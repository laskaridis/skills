#!/usr/bin/env -S node --experimental-strip-types
import type {
  AgentName,
  CaseDefinition,
  Control,
  RunOptions,
  RunResults,
  Transport,
} from './lib/types.ts';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveChecklists, createCase, loadCases } from './lib/cases.ts';
import { calibrate } from './lib/calibration.ts';
import { loadJudgeTests, loadDeterministicChecksFor } from './lib/loader.ts';
import type { Agent } from './lib/agents.ts';
import { AGENT_NAMES, DEFAULT_AGENT, getAgent } from './lib/agents.ts';
import { TIMEOUT } from './lib/execution.ts';
import { copyTree, gitState, sha, snapshot, writeJSON } from './lib/utils.ts';
import {
  compareResults,
  infrastructureFailure,
  observedSettings,
  report,
} from './lib/reporting.ts';
import { preflight } from './lib/preflight.ts';
import { runCase } from './lib/run-case.ts';
import {
  busy,
  printCalibration,
  printCase,
  printHeader,
  printSummary,
} from './lib/ui.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const REPO = path.dirname(HERE);

export function argumentsFor(argv: string[]): RunOptions {
  const options = { reasoning: 'high', calibrate: false } as RunOptions;
  const names: Record<
    string,
    | 'skill'
    | 'model'
    | 'judgeModel'
    | 'reasoning'
    | 'judgeReasoning'
    | 'compare'
    | 'case'
  > = {
    '--skill': 'skill',
    '--model': 'model',
    '--judge-model': 'judgeModel',
    '--reasoning': 'reasoning',
    '--judge-reasoning': 'judgeReasoning',
    '--compare': 'compare',
    '--case': 'case',
  };

  if (argv[0] && !argv[0].startsWith('--')) {
    options.skillName = argv[0];
  }

  for (let i = options.skillName ? 1 : 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--calibrate') {
      options.calibrate = true;
      continue;
    }

    if (arg === '--create') {
      options.create = true;
      continue;
    }

    if (arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--agent') {
      const value = argv[++i];

      if (!AGENT_NAMES.includes(value as AgentName)) {
        throw new Error(
          `Unknown --agent: ${value}; use ${AGENT_NAMES.join(', ')}`,
        );
      }

      options.agent = value as AgentName;
      continue;
    }

    if (!names[arg] || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error(`Invalid/missing argument: ${arg}`);
    }

    options[names[arg]] = argv[++i];
  }

  if (options.help) {
    return options;
  }

  if (!options.skillName) {
    throw new Error('A skill name is required; use --help');
  }

  if (
    options.skillName &&
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(options.skillName)
  ) {
    throw new Error('Unsafe skill name');
  }

  if (options.create) {
    if (!options.case) {
      throw new Error('--create requires --case');
    }

    return options;
  }

  options.agent ??= DEFAULT_AGENT;

  if (!options.model) {
    throw new Error('--model is required; use --help');
  }

  options.judgeModel ??= options.model;
  options.judgeReasoning ??= options.reasoning;
  options.skill = options.skill
    ? path.resolve(options.skill)
    : path.join(REPO, 'skills', options.skillName);

  if (options.compare) {
    options.compare = path.resolve(options.compare);
  }

  return options;
}

export interface ArchiveSource {
  skill: string;
  skillName: string;
  suite: string;
  grading: string;
  directory: string;
}

export interface ArchivedInputs {
  skill: string;
  grading: string;
  suite: string;
}

// Copies everything a run depends on into <directory>/inputs so the run is
// reproducible from its artifacts alone.
export async function archiveInputs(
  source: ArchiveSource,
): Promise<ArchivedInputs> {
  const inputs = path.join(source.directory, 'inputs');
  const archivedEvals = path.join(inputs, 'evals');
  const archivedSuite = path.join(archivedEvals, 'skills', source.skillName);
  const archivedSkill = path.join(inputs, 'skill');
  const archivedGrading = path.join(archivedEvals, 'grading');

  await copyTree(source.skill, archivedSkill);
  await fs.mkdir(archivedSuite, { recursive: true });
  await copyTree(source.grading, archivedGrading);
  await copyTree(
    path.join(source.suite, 'cases'),
    path.join(archivedSuite, 'cases'),
  );

  for (const name of ['checks.ts', 'judge-tests.ts', 'run.ts', 'README.md']) {
    try {
      const file = path.join(source.suite, name);

      if (!(await fs.lstat(file)).isFile()) {
        throw new Error(`Expected ordinary suite file: ${file}`);
      }

      await fs.copyFile(file, path.join(archivedSuite, name));
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return {
    skill: archivedSkill,
    grading: archivedGrading,
    suite: archivedSuite,
  };
}

export interface RunResultsSource {
  options: RunOptions;
  agent: Agent;
  runId: string;
  cliVersion: string;
  // Archived inputs directory; options.skill must point inside it.
  inputs: string;
}

export async function buildRunResults({
  options,
  agent,
  runId,
  cliVersion,
  inputs,
}: RunResultsSource): Promise<RunResults> {
  const skillHash = sha(JSON.stringify(await snapshot(options.skill)));
  const inputSnapshot = await snapshot(inputs);

  for (const file of Object.keys(inputSnapshot)) {
    if (file.startsWith('skill/')) {
      delete inputSnapshot[file];
    }
  }

  return {
    format_version: 2,
    skill: options.skillName,
    run_id: runId,
    selection: { case: options.case ?? null },
    skill_hash: skillHash,
    inputs_hash: sha(JSON.stringify(inputSnapshot)),
    harness_git: gitState(REPO),
    settings: {
      agent: agent.name,
      model: options.model,
      judge_model: options.judgeModel,
      reasoning: options.reasoning,
      judge_reasoning: options.judgeReasoning,
      cli_version: cliVersion,
      node_version: process.version,
      platform: `${process.platform}/${process.arch}`,
      timeout_ms: TIMEOUT,
      ...agent.settings(),
      runs_per_case: 1,
    },
    cases: [],
  };
}

export interface SuiteRun {
  // options.signal cancels the run: no new case or calibration starts after it.
  options: RunOptions;
  runtime: string;
  directory: string;
  cases: CaseDefinition[];
  controls: Control[] | null;
  results: RunResults;
  persist: () => Promise<void>;
}

// Runs the selected cases (then calibration) into `results`. Never touches
// `process`: signals and exit codes belong to the caller.
export async function runSuite({
  options,
  runtime,
  directory,
  cases,
  controls,
  results,
  persist,
}: SuiteRun): Promise<void> {
  const cancelled = () => options.signal?.aborted ?? false;

  for (const item of cases.filter(
    (c) => !options.case || c.id === options.case,
  )) {
    if (cancelled()) {
      break;
    }

    const result = await busy(item.id, () =>
      runCase(options, runtime, directory, item),
    );

    results.cases.push(result);
    printCase(result);
    await persist();
  }

  if (options.calibrate && !cancelled()) {
    results.calibration = await busy('calibration', () =>
      calibrate(options, runtime, directory, cases, controls),
    );
    printCalibration(results.calibration);
  }

  results.cancelled = cancelled() || undefined;
  await persist();
}

export async function main(
  argv = process.argv.slice(2),
  {
    evalRoot = HERE,
    transport,
  }: { evalRoot?: string; transport?: Transport } = {},
) {
  const options = argumentsFor(argv);

  if (options.help) {
    console.log(
      'pnpm eval SKILL --model MODEL [--agent codex|claude] [--skill DIR] [--case CASE_ID] [--judge-model MODEL] [--reasoning high] [--judge-reasoning high] [--compare RESULTS.json] [--calibrate]\n       pnpm eval SKILL --case CASE_ID --create',
    );
    return;
  }

  if (options.create) {
    const created = await createCase(
      path.join(evalRoot, 'skills', options.skillName),
      options.case!,
    );

    console.log(`Created ${created}`);
    console.log(
      `Edit prompt.md, expected.md and fixtures/, then run: pnpm eval ${options.skillName} --case ${options.case} --model MODEL`,
    );
    return;
  }

  options.transport = transport;
  const agent = getAgent(options.agent);
  const suite = path.join(evalRoot, 'skills', options.skillName);
  const { previous, cliVersion } = await preflight(options, suite);

  const started = Date.now();
  const runId =
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  const directory = path.join(suite, 'artifacts', runId);
  const archived = await archiveInputs({
    skill: options.skill,
    skillName: options.skillName,
    suite,
    grading: path.join(HERE, 'grading'),
    directory,
  });
  const cases = await loadCases(
    archived.suite,
    options.skillName,
    agent.skillDir,
  );

  await archiveChecklists(cases, archived.suite);
  options.skill = archived.skill;
  options.grading = archived.grading;
  // Suite modules import ../lib at runtime, so they load from the live suite;
  // their archived copies are evidence and are covered by inputs_hash.
  options.checkCase = (await loadDeterministicChecksFor(suite))?.checkCase;
  const controls = options.calibrate
    ? await loadJudgeTests(suite, cases)
    : null;
  const results = await buildRunResults({
    options,
    agent,
    runId,
    cliVersion,
    inputs: path.join(directory, 'inputs'),
  });

  const persist = async () => {
    results.observed_settings = observedSettings(results);

    if (previous) {
      results.comparison = compareResults(previous, results);
    }

    await writeJSON(path.join(directory, 'results.json'), results);
    await fs.writeFile(path.join(directory, 'report.md'), report(results));
  };

  const runtime = await fs.mkdtemp(
    path.join(os.tmpdir(), 'skill-eval-runtime-'),
  );

  const cancellation = new AbortController();
  const onInterrupt = () => cancellation.abort();

  options.signal = cancellation.signal;
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);

  try {
    await agent.prepareRuntime(runtime);

    printHeader(results, directory);
    await persist();

    await runSuite({
      options,
      runtime,
      directory,
      cases,
      controls,
      results,
      persist,
    });

    printSummary(results, directory, Date.now() - started);

    if (results.cancelled) {
      process.exitCode = 130;
    } else if (infrastructureFailure(results)) {
      process.exitCode = 2;
    }

    return { directory, results };
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    await fs.rm(runtime, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main().catch((error) => {
    console.error(error.stack);
    process.exitCode = 2;
  });
}
