/**
 * Defines the results format of a run, as saved in `results.json`.
 *
 * Responsibilities:
 * - describe what a results file records
 * - create the initial results of a run, hashing its live inputs
 * - validate previously saved results
 *
 * @module
 */

import type { Agent } from './agents.ts';
import type { CaseResult } from './run-case.ts';
import type { Comparison } from './reporting.ts';
import type { CalibrationResult } from './calibration.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { gitState, object, sha, snapshot, type JsonRecord } from './utils.ts';
import { TIMEOUT, type ExecutionOptions } from './execution.ts';

/**
 * Persisted result of a run. `format_version` must equal `RESULTS_VERSION`;
 * other versions are rejected when loading a baseline.
 */
export interface RunResults {
  format_version: number;
  skill: string;
  cases: CaseResult[];
  run_id?: string;
  selection?: { case: string | null };
  settings: JsonRecord;
  skill_hash?: string;
  inputs_hash?: string;
  harness_git?: { commit: string | null; dirty: boolean | null };
  observed_settings?: JsonRecord;
  calibration?: CalibrationResult;
  comparison?: Comparison;
  cancelled?: boolean;
}

/** The run settings that results record. */
export interface ResultsOptions extends ExecutionOptions {
  skillName: string;
  skill: string;
  /** Baseline run: the skill is neither installed nor invoked; skill is ''. */
  noSkill?: boolean;
  /** The suite's checks are not loaded; checks are recorded as skipped. */
  noChecks?: boolean;
  grading: string;
  case?: string;
}

/** What `buildRunResults` needs to know about the run it records. */
export interface RunResultsSource {
  options: ResultsOptions;
  agent: Agent;
  runId: string;
  cliVersion: string;
  /** Live suite directory; `options.skill` and `options.grading` point at live sources. */
  suite: string;
  /** Directory of the harness repository, whose Git state is recorded. */
  repo: string;
}

/** Version of the results format that this harness writes and accepts. */
export const RESULTS_VERSION = 3;

/**
 * Creates the results of a run before any case has run. Reads the skill, grading
 * and suite files to record their hashes.
 *
 * Throws if any hashed input is not an ordinary file.
 */
export async function buildRunResults({
  options,
  agent,
  runId,
  cliVersion,
  suite,
  repo,
}: RunResultsSource): Promise<RunResults> {
  const skillHash = options.noSkill
    ? 'none'
    : sha(JSON.stringify(await _hashTree(options.skill)));
  const inputsHash = sha(
    JSON.stringify(await _inputsSnapshot(suite, options.grading)),
  );

  return {
    format_version: RESULTS_VERSION,
    skill: options.skillName,
    run_id: runId,
    selection: { case: options.case ?? null },
    skill_hash: skillHash,
    inputs_hash: inputsHash,
    harness_git: gitState(repo),
    settings: {
      agent: agent.name,
      skill_mode: options.noSkill ? 'none' : 'installed',
      checks_mode: options.noChecks ? 'skipped' : 'run',
      model: options.model,
      judge_model: options.judgeModel,
      reasoning: options.reasoning,
      judge_reasoning: options.judgeReasoning,
      cli_version: cliVersion,
      node_version: process.version,
      platform: `${process.platform}/${process.arch}`,
      timeout_ms: options.timeout ?? TIMEOUT,
      ...agent.settings(),
      runs_per_case: 1,
    },
    cases: [],
  };
}

/**
 * Validates parsed results, such as a baseline file, and returns the same
 * object. Only the `RESULTS_VERSION` format is accepted; throws on any other.
 *
 * Checks only `format_version`, `skill`, `cases` and, per case, `case`,
 * `execution`, `checks` and `judge.verdicts`. Other fields are not validated.
 */
export function normalizeResults(value: unknown): RunResults {
  if (!object(value) || !Array.isArray(value.cases)) {
    throw new Error('Unsupported baseline format: missing cases');
  }

  if (value.format_version !== RESULTS_VERSION) {
    throw new Error(
      `Unsupported baseline format: found version ${value.format_version}, expected version ${RESULTS_VERSION}`,
    );
  }

  if (
    typeof value.skill !== 'string' ||
    value.cases.some(
      (c) =>
        typeof c.case !== 'string' ||
        !c.execution ||
        !c.checks ||
        !Array.isArray(c.judge?.verdicts),
    )
  ) {
    throw new Error(`Invalid version-${RESULTS_VERSION} results`);
  }

  return value as RunResults;
}

const SUITE_FILES = ['checks.ts', 'run.ts', 'README.md'];

// Hashes the live sources a run depends on, with the same rejection of
// non-regular files that copying them would apply.
async function _hashTree(
  root: string,
  prefix = '',
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};

  for (const [file, hash] of Object.entries(await snapshot(root))) {
    if (hash === 'NON_REGULAR_FILE') {
      throw new Error(`Non-regular input file: ${path.join(root, file)}`);
    }

    hashes[prefix + file] = hash;
  }

  return hashes;
}

async function _inputsSnapshot(
  suite: string,
  grading: string,
): Promise<Record<string, string>> {
  const controls = path.join(suite, 'judge-controls');
  const hashes = {
    ...(await _hashTree(grading, 'grading/')),
    ...(await _hashTree(path.join(suite, 'cases'), 'cases/')),
    // judge-controls/ is optional.
    ...(await fs.access(controls).then(
      () => _hashTree(controls, 'judge-controls/'),
      () => ({}),
    )),
  };

  for (const name of SUITE_FILES) {
    try {
      const file = path.join(suite, name);

      if (!(await fs.lstat(file)).isFile()) {
        throw new Error(`Expected ordinary suite file: ${file}`);
      }

      hashes[`suite/${name}`] = sha(await fs.readFile(file));
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return hashes;
}
