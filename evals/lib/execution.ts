import type { Execution, InvocationMode, RunOptions } from './types.ts';
import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { getAgent, parseCodexTrace, type Trace } from './agents.ts';
import { writeJSON } from './utils.ts';

export const TIMEOUT = 10 * 60 * 1000;

export const parseTrace = parseCodexTrace;

// Spawn without a shell. Kill the process group so timeout also stops tool children.
export async function capture(
  command: string,
  args: string[],
  {
    cwd,
    env = process.env,
    directory,
    prompt = '',
    timeout = TIMEOUT,
    parse = parseCodexTrace,
    signal: runSignal,
  }: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    directory: string;
    prompt?: string;
    timeout?: number;
    parse?: (raw: string) => Trace;
    signal?: AbortSignal;
  },
  {
    platform = process.platform,
    spawnProcess = spawn,
    killGroup = process.kill,
  }: {
    platform?: NodeJS.Platform;
    spawnProcess?: (
      command: string,
      args: string[],
      options: SpawnOptionsWithoutStdio,
    ) => ChildProcessWithoutNullStreams;
    killGroup?: typeof process.kill;
  } = {},
): Promise<Execution> {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'prompt.txt'), prompt);
  const stdout = createWriteStream(path.join(directory, 'trace.jsonl'));
  const stderr = createWriteStream(path.join(directory, 'stderr.txt'));
  const started = Date.now();
  let timedOut = false;
  let cancelled = false;
  let spawnError: string | null = null;
  const child = spawnProcess(command, args, {
    cwd,
    env,
    detached: platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const kill = (signal: NodeJS.Signals) => {
    try {
      if (platform === 'win32') {
        child.kill(signal);
      } else {
        killGroup(-child.pid!, signal);
      }
    } catch {
      /* already exited, or failed to spawn */
    }
  };

  const onInterrupt = () => {
    cancelled = true;
    kill('SIGTERM');
  };

  runSignal?.addEventListener('abort', onInterrupt, { once: true });

  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  child.stdin.on('error', (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'EPIPE') {
      spawnError = error.message;
    }
  });
  child.stdin.end(prompt);
  const timer = setTimeout(() => {
    timedOut = true;
    kill('SIGTERM');
    setTimeout(() => kill('SIGKILL'), 2000);
  }, timeout);
  const { code, signal } = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once('error', (error) => {
      spawnError = error.message;
    });
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  clearTimeout(timer);
  // Keep the forced kill scheduled after a timeout, even if the parent exited first.
  // A referenced timer prevents the runner exiting while tool children remain alive.
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onInterrupt);
  runSignal?.removeEventListener('abort', onInterrupt);
  await Promise.all([finished(stdout), finished(stderr)]);
  const { final, ...trace } = parse(
    await fs.readFile(path.join(directory, 'trace.jsonl'), 'utf8'),
  );
  let finalResponse = final ?? trace.messages.at(-1) ?? '';

  // Codex writes final.txt itself (-o); other CLIs report it in the trace.
  if (final === undefined || final === null) {
    try {
      finalResponse = await fs.readFile(
        path.join(directory, 'final.txt'),
        'utf8',
      );
    } catch {
      /* use event */
    }
  }

  const status = timedOut
    ? 'timeout'
    : cancelled
      ? 'cancelled'
      : spawnError ||
          code !== 0 ||
          trace.failed ||
          !trace.completed ||
          trace.parse_errors.length
        ? 'execution_error'
        : 'ok';
  const result = {
    status,
    exit_code: code,
    signal,
    spawn_error: spawnError,
    duration_ms: Date.now() - started,
    ...trace,
    final_response: finalResponse,
  };

  await fs.writeFile(path.join(directory, 'final.txt'), finalResponse);
  await writeJSON(path.join(directory, 'execution.json'), result);
  return result;
}

export async function invoke(
  options: Pick<
    RunOptions,
    | 'agent'
    | 'model'
    | 'judgeModel'
    | 'reasoning'
    | 'judgeReasoning'
    | 'timeout'
    | 'signal'
  >,
  runtime: string,
  cwd: string,
  directory: string,
  prompt: string,
  mode: InvocationMode = {},
): Promise<Execution> {
  if (options.signal?.aborted) {
    // The run was cancelled: never start another paid model call.
    return { status: 'cancelled', final_response: '' };
  }

  const agent = getAgent(options.agent);
  const { args, env } = await agent.args(options, runtime, directory, mode);
  const execution = await capture(agent.binary, args, {
    cwd,
    directory,
    prompt,
    env,
    timeout: options.timeout ?? TIMEOUT,
    signal: options.signal,
    parse: agent.parseTrace,
  });

  execution.observed_settings = await agent.observedSettings(
    runtime,
    execution,
  );
  execution.settings_note = agent.settingsNote(execution.observed_settings);
  await writeJSON(path.join(directory, 'execution.json'), execution);
  return execution;
}
