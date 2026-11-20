import type {
  Finding,
  JudgeFinding,
  JudgeResult,
  JsonRecord,
  Requirement,
  RunOptions,
} from './types.ts';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exactKeys, nonempty, gitInit, snapshot, writeJSON } from './utils.ts';
import { invoke } from './execution.ts';

export function validateJudge(
  value: unknown,
  requirements: Requirement[],
): value is JudgeFinding {
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

export function unavailable(
  requirements: Requirement[],
  reason: string,
): Finding[] {
  return requirements.map(({ id, text }) => ({
    id,
    text,
    status: 'ungradable',
    evidence: [reason],
  }));
}

export async function judge(
  options: RunOptions,
  runtime: string,
  directory: string,
  requirements: Requirement[],
  bundle: JsonRecord,
): Promise<JudgeResult> {
  if (options.signal?.aborted) {
    return { status: 'cancelled' };
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

    for (const [source, target] of [
      ['quality.schema.json', 'schema.json'],
      ['rubric.md', 'rubric.md'],
    ]) {
      await fs.copyFile(
        path.join(options.grading, source),
        path.join(directory, target),
      );
    }

    for (const file of ['bundle.json', 'schema.json', 'rubric.md']) {
      await fs.copyFile(path.join(directory, file), path.join(workspace, file));
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
      return { status: execution.status, execution };
    }

    if (JSON.stringify(await snapshot(workspace)) !== JSON.stringify(before)) {
      return {
        status: 'execution_error',
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

    if (!validateJudge(finding, requirements)) {
      return {
        status: 'invalid_response',
        error: 'Invalid JSON, findings, evidence, or requirement IDs',
        execution,
      };
    }

    await writeJSON(path.join(directory, 'finding.json'), finding);
    return { status: 'ok', finding, execution };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}
