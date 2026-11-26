/**
 * Grades evidence against requirements with an independent judge agent.
 *
 * Responsibilities:
 * - isolate the judge in a throwaway workspace
 * - reject replies that are invalid, or runs that modified their inputs
 *
 * @module
 */

import type { Requirement } from './cases.ts';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  exactKeys,
  nonempty,
  gitInit,
  snapshot,
  writeJSON,
  type JsonRecord,
} from './utils.ts';
import {
  invoke,
  type Execution,
  type ExecutionOptions,
  type Transport,
} from './execution.ts';

/** Settings for one judge call. */
export interface JudgeOptions extends ExecutionOptions {
  /** Directory holding `quality.schema.json` and `rubric.md`. */
  grading: string;
  /** Replaces the real agent CLI invocation. */
  transport?: Transport;
}

/** The judge's verdict on one requirement (matched by `id`), with supporting evidence. */
export interface JudgeVerdict {
  id: string;
  status: 'pass' | 'fail' | 'ungradable';
  evidence: string[];
}

/**
 * Outcome of judging one case. `verdicts` is empty unless `status` is 'ok';
 * other statuses (e.g. 'execution_error', 'invalid_response', 'cancelled', 'not_run')
 * may carry `error`.
 */
export interface JudgeResult {
  status: string;
  execution?: Execution;
  verdicts: JudgeVerdict[];
  error?: string;
}

/**
 * Runs an independent read-only judge agent over a bundle and validates its verdict.
 *
 * The judge runs in a temporary git workspace holding only the bundle, schema and
 * rubric; the workspace is always removed afterwards. Writes `bundle.json` (and, on
 * success, `finding.json`) to `directory`.
 *
 * @param options Judge options; `grading` locates the schema and rubric, `transport`
 * overrides the agent invocation, and `signal` aborts before starting.
 * @param runtime Agent runtime used to invoke the judge.
 * @param directory Output directory for the judge's artifacts.
 * @param requirements Requirements to grade; added to the bundle.
 * @param bundle Evidence the judge grades against.
 * @returns A `JudgeResult` whose `status` is:
 * - 'cancelled': `options.signal` was already aborted; nothing ran.
 * - 'ok': `verdicts` is valid for `requirements`; otherwise it is empty.
 * - 'invalid_response': the reply was not valid JSON or did not match the schema
 *   (exactly one finding per requirement, each with a valid status and evidence).
 * - 'execution_error': the judge modified its inputs.
 * - any other status: the non-ok status of the judge execution, passed through.
 * All but 'cancelled' include `execution`.
 */
export async function judge(
  options: JudgeOptions,
  runtime: string,
  directory: string,
  requirements: Requirement[],
  bundle: JsonRecord,
): Promise<JudgeResult> {
  if (options.signal?.aborted) {
    return { status: 'cancelled', verdicts: [] };
  }

  await fs.mkdir(directory, { recursive: true });
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), 'skill-eval-judge-'),
  );

  try {
    await writeJSON(path.join(directory, 'bundle.json'), {
      ...bundle,
      requirements,
    });

    await fs.copyFile(
      path.join(directory, 'bundle.json'),
      path.join(workspace, 'bundle.json'),
    );

    for (const [source, target] of [
      ['quality.schema.json', 'schema.json'],
      ['rubric.md', 'rubric.md'],
    ]) {
      await fs.copyFile(
        path.join(options.grading, source),
        path.join(workspace, target),
      );
    }

    gitInit(workspace);
    const before = await snapshot(workspace);
    const execution = await (options.transport ?? invoke)(
      options,
      runtime,
      workspace,
      directory,
      'You are an independent, read-only evaluator. Read rubric.md, schema.json and bundle.json. ' +
        'Follow rubric.md and return only the required JSON. Read only those files. Do not invoke any other agent.',
      { judge: true, schema: path.join(workspace, 'schema.json') },
    );

    if (execution.status !== 'ok') {
      return { status: execution.status, verdicts: [], execution };
    }

    if (JSON.stringify(await snapshot(workspace)) !== JSON.stringify(before)) {
      return {
        status: 'execution_error',
        verdicts: [],
        error: 'Read-only judge modified its inputs',
        execution,
      };
    }

    let finding;

    try {
      finding = JSON.parse(execution.final_response);
    } catch {
      /* local validation below */
    }

    if (!_isValidJudgeFinding(finding, requirements)) {
      return {
        status: 'invalid_response',
        verdicts: [],
        error: 'Invalid JSON, findings, evidence, or requirement IDs',
        execution,
      };
    }

    await writeJSON(path.join(directory, 'finding.json'), finding);
    return { status: 'ok', verdicts: finding.findings, execution };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

/** The judge's reply, as defined by quality.schema.json. */
type JudgeReply = { findings: JudgeVerdict[] };

// Type guard for a judge's parsed JSON reply: true only if `value` has exactly a
// `findings` array with one entry per requirement id (no duplicates, none missing
// or extra), each with exactly `id`, `status` and a non-empty `evidence` array of
// non-blank strings.
function _isValidJudgeFinding(
  value: unknown,
  requirements: Requirement[],
): value is JudgeReply {
  if (!exactKeys(value, ['findings']) || !Array.isArray(value.findings)) {
    return false;
  }

  const ids = new Set(requirements.map((item) => item.id));

  if (value.findings.length !== ids.size) {
    return false;
  }

  for (const finding of value.findings) {
    if (
      !exactKeys(finding, ['id', 'status', 'evidence']) ||
      !ids.delete(finding.id) ||
      !['pass', 'fail', 'ungradable'].includes(finding.status) ||
      !Array.isArray(finding.evidence) ||
      !finding.evidence.length ||
      !finding.evidence.every(nonempty)
    ) {
      return false;
    }
  }

  return ids.size === 0;
}
