#!/usr/bin/env -S node --experimental-strip-types
import type {
  AgentName,
  RunOptions,
  RunResults,
  Transport,
} from './lib/types.ts';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveChecklists, loadCases } from './lib/cases.ts';
import { calibrate } from './lib/calibration.ts';
import { loadJudgeTests, loadDeterministicChecksFor } from './lib/loader.ts';
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
      'pnpm eval SKILL --model MODEL [--agent codex|claude] [--skill DIR] [--case CASE_ID] [--judge-model MODEL] [--reasoning high] [--judge-reasoning high] [--compare RESULTS.json] [--calibrate]',
    );
    return;
  }

  options.transport = transport;
  const agent = getAgent(options.agent);
  const suite = path.join(evalRoot, options.skillName);
  const { previous, cliVersion } = await preflight(options, suite);

  const runId =
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  const directory = path.join(suite, 'artifacts', runId);
  const inputs = path.join(directory, 'inputs');
  const archivedEvals = path.join(inputs, 'evals');
  const archivedSuite = path.join(archivedEvals, options.skillName);

  await copyTree(options.skill, path.join(inputs, 'skill'));
  await fs.mkdir(archivedEvals, { recursive: true });

  await copyTree(
    path.join(HERE, 'grading'),
    path.join(archivedEvals, 'grading'),
  );
  await copyTree(path.join(suite, 'cases'), path.join(archivedSuite, 'cases'));

  for (const name of ['checks.ts', 'judge-tests.ts', 'run.ts', 'README.md']) {
    try {
      const source = path.join(suite, name);

      if (!(await fs.lstat(source)).isFile()) {
        throw new Error(`Expected ordinary suite file: ${source}`);
      }

      await fs.copyFile(source, path.join(archivedSuite, name));
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  const cases = await loadCases(
    archivedSuite,
    options.skillName,
    agent.skillDir,
  );

  await archiveChecklists(cases, archivedSuite);
  options.skill = path.join(inputs, 'skill');
  options.grading = path.join(archivedEvals, 'grading');
  // Suite modules import ../lib at runtime, so they load from the live suite;
  // their archived copies are evidence and are covered by inputs_hash.
  options.checkCase = (await loadDeterministicChecksFor(suite))?.checkCase;
  const controls = options.calibrate
    ? await loadJudgeTests(suite, cases)
    : null;
  const skillHash = sha(JSON.stringify(await snapshot(options.skill)));
  const inputSnapshot = await snapshot(inputs);

  for (const file of Object.keys(inputSnapshot)) {
    if (file.startsWith('skill/')) {
      delete inputSnapshot[file];
    }
  }

  const results: RunResults = {
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

  const persist = async () => {
    results.observed_settings = observedSettings(results);

    if (previous) {
      results.comparison = compareResults(previous, results);
    }

    await writeJSON(path.join(directory, 'results.json'), results);
    await fs.writeFile(path.join(directory, 'report.md'), report(results));
  };

  if (previous) {
    await writeJSON(path.join(directory, 'baseline.json'), previous);
  }

  const runtime = await fs.mkdtemp(
    path.join(os.tmpdir(), 'skill-eval-runtime-'),
  );

  try {
    await agent.prepareRuntime(runtime);

    console.log(`Artifacts: ${directory}`);
    await persist();

    for (const item of cases.filter(
      (c) => !options.case || c.id === options.case,
    )) {
      results.cases.push(await runCase(options, runtime, directory, item));
      await persist();
    }

    if (options.calibrate) {
      results.calibration = await calibrate(
        options,
        runtime,
        directory,
        cases,
        controls,
      );
    }

    await persist();
    console.log(`Report: ${path.join(directory, 'report.md')}`);

    if (infrastructureFailure(results)) {
      process.exitCode = 2;
    }

    return { directory, results };
  } finally {
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
