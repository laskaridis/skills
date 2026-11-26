/**
 * Defines the contract of a suite's optional deterministic check hook
 * (`checks.ts`) and loads it.
 *
 * Responsibilities:
 * - describe what a check receives and returns
 * - load a suite's hook and confirm it exports `checkCase`
 *
 * @module
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { optionalStat, type Snapshot } from './utils.ts';

/**
 * Outcome of a case's deterministic checks. 'pass' has no failures, 'fail' has at
 * least one; 'not_run' is used when checks never ran; 'skipped' when the run
 * was started with --no-checks.
 */
export type CheckStatus = 'pass' | 'fail' | 'error' | 'not_run' | 'skipped';

export interface CheckResult {
  status: CheckStatus;
  failures: string[];
}

/** Input passed to a case's check function: the workspace after the run and the agent's final answer. */
export interface CheckContext {
  caseId: string;
  workspace: string;
  initialSnapshot: Snapshot;
  finalResponse: string;
}

/** Deterministic check for a case. Returns a `CheckResult` (sync or async). */
export type CheckCase = (
  context: CheckContext,
) => CheckResult | Promise<CheckResult>;

/**
 * Loads and validates the suite's optional `checks.ts` hook module; null when
 * absent. Throws if it is not an ordinary file or does not export `checkCase`.
 */
export async function loadDeterministicChecksFor(suite: string) {
  const hooks = await _optionalModule(suite, 'checks.ts');

  if (hooks && typeof hooks.checkCase !== 'function') {
    throw new Error('checks.ts must export checkCase');
  }

  return hooks;
}

// Imports an optional suite module; returns null when the file does not exist.
async function _optionalModule(directory: string, name: string) {
  const file = path.join(directory, name);
  const stat = await optionalStat(file);

  if (!stat) {
    return null;
  }

  if (!stat.isFile()) {
    throw new Error(`Expected ordinary module: ${file}`);
  }

  return import(pathToFileURL(file).href);
}
