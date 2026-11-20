import type {
  CaseDefinition,
  CaseResult,
  RunOptions,
  Snapshot,
} from './types.ts';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  archiveWorkspace,
  copyTree,
  exactKeys,
  files,
  gitInit,
  nonempty,
  readablePath,
  snapshot,
  writeJSON,
} from './utils.ts';
import { getAgent } from './agents.ts';
import { invoke } from './execution.ts';
import { judge, unavailable } from './judging.ts';

// Text and coding skills can edit any fixture. The optional suite validator owns
// protected-input and output-path rules; the harness has no plan-specific paths.
export async function workspaceContents(
  workspace: string,
  skill: string,
  skillDir = '.agents/skills',
) {
  const contents: Record<string, string> = {};
  const installed = `${skillDir}/${skill}/`;

  for (const file of await files(workspace)) {
    if (file.startsWith(installed)) {
      continue;
    }

    contents[file] = (await readablePath(workspace, file))
      ? await fs.readFile(path.join(workspace, file), 'utf8')
      : '[non-regular or unsafe artifact]';
  }

  return contents;
}

export async function runCase(
  options: RunOptions,
  runtime: string,
  runDirectory: string,
  item: CaseDefinition,
): Promise<CaseResult> {
  const agent = getAgent(options.agent);
  const directory = path.join(runDirectory, item.id);

  await fs.mkdir(directory, { recursive: true });
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), `skill-eval-${item.id}-`),
  );
  const result: CaseResult = {
    case: item.id,
    input_hash: item.inputHash,
    execution: { status: 'not_run', calls: [] },
    checks: { status: 'not_run', failures: [] },
    judge: { status: 'not_run' },
    requirements: unavailable(
      item.requirements,
      'Execution has not completed.',
    ),
  };
  let initial: Snapshot | null = null;
  let finalResponse = '';
  let checksRan = false;
  let invokingAgent = false;

  const check = async () => {
    if (!initial || checksRan || !options.checkCase) {
      return;
    }

    checksRan = true;

    try {
      const value = await options.checkCase({
        caseId: item.id,
        workspace,
        initialSnapshot: initial,
        finalResponse,
      });

      if (
        !exactKeys(value, ['status', 'failures']) ||
        !['pass', 'fail'].includes(value.status) ||
        !Array.isArray(value.failures) ||
        !value.failures.every(nonempty) ||
        (value.status === 'pass' && value.failures.length) ||
        (value.status === 'fail' && !value.failures.length)
      ) {
        throw new Error(
          'checkCase must return { status: pass|fail, failures: string[] } with consistent status',
        );
      }

      result.checks = value;
    } catch (error: any) {
      result.checks = {
        status: 'error',
        failures: [error.stack ?? error.message],
      };
      result.harness_error = `Validator error: ${error.message}`;
    }
  };

  try {
    await copyTree(
      options.skill,
      path.join(workspace, agent.skillDir, options.skillName),
    );

    for (const file of item.fixtureFiles) {
      const to = path.join(workspace, file);

      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(path.join(item.fixtures, file), to);
    }

    gitInit(workspace);
    initial = await snapshot(workspace);
    const inputFiles = await workspaceContents(
      workspace,
      options.skillName,
      agent.skillDir,
    );
    const prompt = agent.skillPrompt(options.skillName, item.prompt);

    invokingAgent = true;
    const execution = await (options.transport ?? invoke)(
      options,
      runtime,
      workspace,
      path.join(directory, 'agent'),
      prompt,
    );

    invokingAgent = false;

    result.execution.calls.push(execution);
    result.execution.status = execution.status;
    finalResponse = execution.final_response;

    if (execution.status !== 'ok') {
      result.requirements = unavailable(
        item.requirements,
        `Agent ${execution.status}; see agent.`,
      );
      return result;
    }

    await check();
    result.judge = await judge(
      options,
      runtime,
      path.join(directory, 'judge-quality'),
      item.requirements,
      {
        input_files: inputFiles,
        prompt: item.prompt,
        final_response: finalResponse,
        workspace_files: await workspaceContents(
          workspace,
          options.skillName,
          agent.skillDir,
        ),
        deterministic_checks: result.checks,
      },
    );

    if (result.judge.status === 'ok') {
      result.requirements = result.judge.finding!.findings.map((f) => ({
        ...f,
        text: item.requirements.find((r) => r.id === f.id)!.text,
      }));
    } else {
      result.requirements = unavailable(
        item.requirements,
        `Judge ${result.judge.status}; this is not a quality failure.`,
      );
    }

    return result;
  } catch (error: any) {
    result.harness_error = error.stack ?? error.message;

    if (invokingAgent || result.execution.status === 'not_run') {
      result.execution.status = 'execution_error';
    }

    result.requirements = unavailable(
      item.requirements,
      `Harness error: ${error.message}`,
    );
    return result;
  } finally {
    try {
      await check();
      await archiveWorkspace(workspace, directory, 'workspace');
      await writeJSON(path.join(directory, 'result.json'), result);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  }
}
