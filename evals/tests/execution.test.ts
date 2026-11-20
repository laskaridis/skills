import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { temporary, put, fakeCodex } from './helpers.ts';
import { parseTrace, capture, invoke, TIMEOUT } from '../lib/execution.ts';
import { readJSON } from '../lib/utils.ts';

test('trace parser retains raw usage, errors and final agent messages', () => {
  // Given
  const raw = [
    ' ',
    'bad',
    { type: 'thread.started', thread_id: 'session' },
    { type: 'turn.completed', usage: { input_tokens: 2 } },
    { type: 'turn.completed' },
    { type: 'item.completed' },
    { type: 'item.completed', item: { type: 'other' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Answer' } },
    { type: 'error', message: 'failed' },
    { type: 'turn.failed' },
  ]
    .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
    .join('\n');

  // When
  const result = parseTrace(raw);
  const empty = parseTrace('');

  // Then
  assert.equal(result.session_id, 'session');
  assert.equal(result.completed, true);
  assert.equal(result.failed, true);
  assert.deepEqual(result.messages, ['Answer']);
  assert.deepEqual(result.usage, [{ input_tokens: 2 }, null]);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.parse_errors, ['bad']);
  assert.equal(empty.session_id, null);
});

for (const [name, script, status] of [
  ['success', 'console.log(JSON.stringify({type:"turn.completed"}));', 'ok'],
  [
    'crash',
    'process.stderr.write("failed");process.exit(2)',
    'execution_error',
  ],
  ['malformed', 'console.log("not JSON")', 'execution_error'],
  [
    'missing completion',
    'console.log(JSON.stringify({type:"thread.started"}))',
    'execution_error',
  ],
  [
    'failed turn',
    'console.log(JSON.stringify({type:"turn.failed"}));console.log(JSON.stringify({type:"turn.completed"}));',
    'execution_error',
  ],
  [
    'event fallback',
    'console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"Event answer"}}));console.log(JSON.stringify({type:"turn.completed"}));',
    'ok',
  ],
]) {
  test(`capture classifies ${name} and saves evidence`, async (t) => {
    // Given
    const root = await temporary(t);
    const directory = path.join(root, 'call');

    // When
    const result = await capture(process.execPath, ['-e', script], {
      cwd: root,
      directory,
      timeout: 3000,
      prompt: 'Request',
    });
    const prompt = await fs.readFile(
      path.join(directory, 'prompt.txt'),
      'utf8',
    );
    const saved = await readJSON(path.join(directory, 'execution.json'));

    // Then
    assert.equal(result.status, status);
    assert.equal(prompt, 'Request');
    assert.equal(saved.status, status);

    if (name === 'event fallback') {
      assert.equal(result.final_response, 'Event answer');
    }

    if (name === 'crash') {
      assert.equal(
        await fs.readFile(path.join(directory, 'stderr.txt'), 'utf8'),
        'failed',
      );
    }
  });
}

test('capture retains supplied final file over event text and supplies stdin', async (t) => {
  // Given
  const root = await temporary(t);

  const timers = vi.spyOn(globalThis, 'setTimeout');

  t.onTestFinished(() => timers.mockRestore());
  await put(root, 'call/final.txt', 'Saved');

  // When
  const result = await capture(
    process.execPath,
    [
      '-e',
      'process.stdin.on("data",x=>process.stderr.write(x));process.stdin.on("end",()=>console.log(JSON.stringify({type:"turn.completed"})))',
    ],
    { cwd: root, directory: path.join(root, 'call'), prompt: 'Input' },
  );
  const stderr = await fs.readFile(path.join(root, 'call/stderr.txt'), 'utf8');
  const command = await fs.access(path.join(root, 'call/command.json')).then(
    () => true,
    () => false,
  );

  // Then
  assert.equal(result.final_response, 'Saved');
  assert.equal(stderr, 'Input');
  assert.ok(timers.mock.calls.some(([, delay]) => delay === TIMEOUT));
  assert.equal(command, false);
});

test('capture reports failed spawn', async (t) => {
  // Given
  const root = await temporary(t);

  // When
  const result = await capture(path.join(root, 'missing'), [], {
    cwd: root,
    directory: path.join(root, 'call'),
  });

  // Then
  assert.equal(result.status, 'execution_error');
  assert.match(result.spawn_error!, /ENOENT/);
});

test('capture timeout terminates process group and removes interrupt listeners', async (t) => {
  const root = await temporary(t);
  const initial = process.listenerCount('SIGTERM');

  // When
  const result = await capture(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    { cwd: root, directory: path.join(root, 'call'), timeout: 50 },
  );

  // Then
  assert.equal(result.status, 'timeout');
  assert.equal(process.listenerCount('SIGTERM'), initial);
});

test('capture forwards parent interrupts to process group', async (t) => {
  // Given
  const root = await temporary(t);
  const timer = setTimeout(() => process.emit('SIGTERM'), 100);

  t.onTestFinished(() => clearTimeout(timer));

  // When
  const result = await capture(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    { cwd: root, directory: path.join(root, 'call'), timeout: 3000 },
  );

  // Then
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.status, 'cancelled');
});

test('capture escalates timeout termination when the process group stays alive', async (t) => {
  // Given
  const root = await temporary(t);
  const signals: NodeJS.Signals[] = [];
  const initial = process.listenerCount('SIGTERM');

  // When
  const result = await capture(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    { cwd: root, directory: path.join(root, 'call'), timeout: 50 },
    {
      platform: 'linux',
      killGroup: (pid, signal) => {
        signals.push(signal as NodeJS.Signals);

        if (signal === 'SIGTERM') {
          return true;
        }

        return process.kill(pid, signal);
      },
    },
  );

  // Then
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.status, 'timeout');
  assert.equal(process.listenerCount('SIGTERM'), initial);
});

for (const mode of [
  'full',
  'empty',
  'none',
  'missing',
  'unmatched',
  'malformed',
]) {
  test(`invoke captures requested settings and ${mode} observed context`, async (t) => {
    // Given
    const root = await temporary(t);
    const bin = await fakeCodex(root);
    const oldPath = process.env.PATH;
    const oldMode = process.env.FAKE_CONTEXT;
    const record = path.join(root, 'args.json');

    t.onTestFinished(() => {
      process.env.PATH = oldPath;
      delete process.env.FAKE_CODEX_ARGS;

      if (oldMode === undefined) {
        delete process.env.FAKE_CONTEXT;
      } else {
        process.env.FAKE_CONTEXT = oldMode;
      }
    });
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.FAKE_CONTEXT = mode;
    process.env.FAKE_CODEX_ARGS = record;

    // When
    const result = await invoke(
      {
        model: 'agent',
        judgeModel: 'judge',
        reasoning: 'high',
        judgeReasoning: 'low',
      },
      root,
      root,
      path.join(root, 'call'),
      'Task',
      mode === 'full' ? { judge: true, schema: 'schema.json' } : {},
    );
    const args: string[] = await readJSON(record);
    const command = await fs.access(path.join(root, 'call/command.json')).then(
      () => true,
      () => false,
    );

    // Then
    assert.equal(result.status, 'ok');
    assert.equal(command, false);
    assert.equal(result.final_response, 'Saved response');

    if (mode === 'full') {
      assert.deepEqual(result.observed_settings, {
        model: 'observed',
        reasoning: 'high',
        sandbox: 'workspace-write',
        approval_policy: 'never',
      });
    } else if (mode === 'empty') {
      assert.deepEqual(result.observed_settings, {
        model: null,
        reasoning: null,
        sandbox: null,
        approval_policy: null,
      });
    } else {
      assert.equal(result.observed_settings, null);
    }

    assert.ok(args.includes(mode === 'full' ? 'judge' : 'agent'));
    assert.ok(args.includes('--ignore-user-config'));

    if (mode === 'full') {
      assert.equal(args[0], 'exec');
      assert.ok(!args.includes('resume'));
      assert.ok(args.includes('--output-schema'));
    }
  });
}

test('capture uses direct child termination on Windows boundary', async (t) => {
  // Given
  const root = await temporary(t);

  // When
  const result = await capture(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    {
      cwd: root,
      directory: path.join(root, 'call'),
      timeout: 40,
    },
    { platform: 'win32' },
  );

  // Then
  assert.equal(result.status, 'timeout');
});

test('capture records non-EPIPE stdin failures and tolerates EPIPE', async (t) => {
  // Given
  const { spawn } = await import('node:child_process');
  const root = await temporary(t);

  for (const code of ['EPIPE', 'EIO']) {
    // When
    const result = await capture(
      process.execPath,
      [
        '-e',
        'setTimeout(()=>console.log(JSON.stringify({type:"turn.completed"})),30)',
      ],
      {
        cwd: root,
        directory: path.join(root, code),
      },
      {
        spawnProcess: (...args) => {
          const child = spawn(args[0], args[1], args[2]);

          queueMicrotask(() =>
            child.stdin!.emit(
              'error',
              Object.assign(new Error('stdin failed'), { code }),
            ),
          );
          return child;
        },
      },
    );

    // Then
    assert.equal(result.status, code === 'EPIPE' ? 'ok' : 'execution_error');
    assert.equal(result.spawn_error, code === 'EPIPE' ? null : 'stdin failed');
  }
});

test('capture stops the child when the run signal aborts', async (t) => {
  // Given
  const root = await temporary(t);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);

  t.onTestFinished(() => clearTimeout(timer));

  // When
  const result = await capture(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    {
      cwd: root,
      directory: path.join(root, 'call'),
      timeout: 3000,
      signal: controller.signal,
    },
  );

  // Then
  assert.equal(result.status, 'cancelled');
  assert.equal(result.signal, 'SIGTERM');
});

test('invoke starts no model call once the run is cancelled', async (t) => {
  // Given
  const root = await temporary(t);
  const controller = new AbortController();

  controller.abort();

  // When
  const result = await invoke(
    {
      model: 'agent',
      judgeModel: 'judge',
      reasoning: 'high',
      judgeReasoning: 'low',
      signal: controller.signal,
    },
    root,
    root,
    path.join(root, 'call'),
    'Task',
  );

  // Then
  assert.equal(result.status, 'cancelled');
  await assert.rejects(fs.access(path.join(root, 'call')));
});
