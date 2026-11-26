import { test, vi, type TestContext } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { temporary, put, fakeCodex } from './helpers.ts';
import { invoke, TIMEOUT } from '../lib/execution.ts';
import { parseCodexTrace } from '../lib/agents.ts';
import { readJSON } from '../lib/utils.ts';

const OPTIONS = {
  model: 'agent',
  judgeModel: 'judge',
  reasoning: 'high',
  judgeReasoning: 'low',
};

const HANG = 'setInterval(()=>{},1000)';

// Runs `invoke` against a fake codex whose body is the given script.
async function run(
  t: TestContext,
  root: string,
  body: string,
  extra: { timeout?: number; signal?: AbortSignal } = {},
  prompt = 'Request',
) {
  const bin = await fakeCodex(root, body);
  const oldPath = process.env.PATH;

  t.onTestFinished(() => {
    process.env.PATH = oldPath;
  });
  process.env.PATH = `${bin}:${oldPath}`;

  return invoke(
    { ...OPTIONS, ...extra },
    root,
    root,
    path.join(root, 'call'),
    prompt,
  );
}

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
  const result = parseCodexTrace(raw);
  const empty = parseCodexTrace('');

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
  test(`invoke classifies ${name} and saves evidence`, async (t) => {
    // Given
    const root = await temporary(t);
    const directory = path.join(root, 'call');

    // When
    const result = await run(t, root, script, { timeout: 3000 });
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

test('invoke retains supplied final file over event text and supplies stdin', async (t) => {
  // Given
  const root = await temporary(t);

  const timers = vi.spyOn(globalThis, 'setTimeout');

  t.onTestFinished(() => timers.mockRestore());
  await put(root, 'call/final.txt', 'Saved');

  // When
  const result = await run(
    t,
    root,
    'process.stdin.on("data",x=>process.stderr.write(x));process.stdin.on("end",()=>console.log(JSON.stringify({type:"turn.completed"})))',
    {},
    'Input',
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

test('invoke reports failed spawn', async (t) => {
  // Given
  const root = await temporary(t);
  const oldPath = process.env.PATH;

  t.onTestFinished(() => {
    process.env.PATH = oldPath;
  });
  process.env.PATH = path.join(root, 'empty');

  // When
  const result = await invoke(
    OPTIONS,
    root,
    root,
    path.join(root, 'call'),
    'Task',
  );

  // Then
  assert.equal(result.status, 'execution_error');
  assert.match(result.spawn_error!, /ENOENT/);
});

test('invoke timeout terminates process group and removes interrupt listeners', async (t) => {
  // Given
  const root = await temporary(t);
  const initial = process.listenerCount('SIGTERM');

  // When
  const result = await run(t, root, HANG, { timeout: 300 });

  // Then
  assert.equal(result.status, 'timeout');
  assert.equal(process.listenerCount('SIGTERM'), initial);
});

test('invoke forwards parent interrupts to process group', async (t) => {
  // Given
  const root = await temporary(t);
  const timer = setTimeout(() => process.emit('SIGTERM'), 300);

  t.onTestFinished(() => clearTimeout(timer));

  // When
  const result = await run(t, root, HANG, { timeout: 3000 });

  // Then
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.status, 'cancelled');
});

test('invoke escalates timeout termination when the process ignores SIGTERM', async (t) => {
  // Given
  const root = await temporary(t);
  const initial = process.listenerCount('SIGTERM');

  // When
  const result = await run(t, root, `process.on('SIGTERM',()=>{});${HANG}`, {
    timeout: 1500,
  });

  // Then
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

test('invoke stops the child when the run signal aborts', async (t) => {
  // Given
  const root = await temporary(t);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);

  t.onTestFinished(() => clearTimeout(timer));

  // When
  const result = await run(t, root, HANG, {
    timeout: 3000,
    signal: controller.signal,
  });

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
