import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fakeClaude, put, temporary } from './helpers.ts';
import { getAgent, parseClaudeTrace } from '../lib/agents.ts';
import { invoke } from '../lib/execution.ts';
import { argumentsFor } from '../run.ts';
import { readJSON } from '../lib/utils.ts';

const jsonl = (events: unknown[]) =>
  events.map((event) => JSON.stringify(event)).join('\n');

test('claude trace parser reads init, messages, usage and the final result', () => {
  // Given
  const raw = jsonl([
    {
      type: 'system',
      subtype: 'init',
      session_id: 's',
      model: 'm',
      permissionMode: 'bypassPermissions',
    },
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool_use', name: 'Read' },
        ],
      },
    },
    {
      type: 'result',
      is_error: false,
      session_id: 's',
      usage: { input_tokens: 3 },
      result: 'Done',
    },
  ]);

  // When
  const trace = parseClaudeTrace(raw);

  // Then
  assert.equal(trace.session_id, 's');
  assert.equal(trace.completed, true);
  assert.equal(trace.failed, false);
  assert.deepEqual(trace.usage, [{ input_tokens: 3 }]);
  assert.deepEqual(trace.messages, ['Hello']);
  assert.equal(trace.final, 'Done');
  assert.deepEqual(trace.init, {
    model: 'm',
    permissionMode: 'bypassPermissions',
  });
});

test('claude trace parser prefers structured output as the final response', () => {
  // Given
  const raw = jsonl([
    {
      type: 'result',
      is_error: false,
      result: 'ignored',
      structured_output: { findings: [] },
    },
  ]);

  // When
  const trace = parseClaudeTrace(raw);

  // Then
  assert.equal(trace.final, '{"findings":[]}');
});

for (const [name, raw, completed, failed, parseErrors] of [
  ['error result', jsonl([{ type: 'result', is_error: true }]), true, true, 0],
  [
    'missing result',
    jsonl([{ type: 'system', subtype: 'init' }]),
    false,
    false,
    0,
  ],
  ['malformed line', 'not json', false, false, 1],
] as const) {
  test(`claude trace parser handles ${name}`, () => {
    // When
    const trace = parseClaudeTrace(raw);

    // Then
    assert.equal(trace.completed, completed);
    assert.equal(trace.failed, failed);
    assert.equal(trace.parse_errors.length, parseErrors);
  });
}

test('claude agent validates reasoning and uses its own skill layout', () => {
  // Given
  const agent = getAgent('claude');

  // When
  const invalid = () => agent.validateReasoning('minimal');

  // Then
  assert.throws(invalid, /Invalid --reasoning for claude/);
  assert.doesNotThrow(() => agent.validateReasoning('xhigh'));
  assert.equal(agent.skillDir, '.claude/skills');
  assert.equal(agent.skillPrompt('plan', 'Task'), '/plan\n\nTask');
});

test('codex remains the default agent and keeps its skill layout', () => {
  // When
  const options = argumentsFor(['plan', '--model', 'm']);
  const agent = getAgent(options.agent);

  // Then
  assert.equal(options.agent, 'codex');
  assert.equal(agent.skillDir, '.agents/skills');
  assert.match(agent.skillPrompt('plan', 'Task'), /^\$plan\n/);
});

test('--agent is parsed and validated', () => {
  // When
  const claude = argumentsFor(['plan', '--model', 'm', '--agent', 'claude']);
  const invalid = () => argumentsFor(['plan', '--model', 'm', '--agent', 'x']);
  const missing = () => argumentsFor(['plan', '--model', 'm', '--agent']);

  // Then
  assert.equal(claude.agent, 'claude');
  assert.throws(invalid, /Unknown --agent: x/);
  assert.throws(missing, /Unknown --agent/);
});

for (const judge of [false, true]) {
  test(`invoke runs claude as ${judge ? 'judge' : 'agent'} and records observed settings`, async (t) => {
    // Given
    const root = await temporary(t);
    const bin = await fakeClaude(root);
    const schema = await put(root, 'schema.json', '{"type":"object"}\n');
    const record = path.join(root, 'args.json');
    const oldPath = process.env.PATH;
    const oldRecord = process.env.FAKE_CLAUDE_ARGS;
    const oldToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

    t.onTestFinished(() => {
      process.env.PATH = oldPath;

      for (const [key, value] of [
        ['FAKE_CLAUDE_ARGS', oldRecord],
        ['CLAUDE_CODE_OAUTH_TOKEN', oldToken],
      ] as const) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.FAKE_CLAUDE_ARGS = record;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'placeholder';

    // When
    const result = await invoke(
      {
        agent: 'claude',
        model: 'agent-model',
        judgeModel: 'judge-model',
        reasoning: 'high',
        judgeReasoning: 'low',
      },
      root,
      root,
      path.join(root, 'call'),
      'Task',
      judge ? { judge: true, schema } : {},
    );
    const seen = await readJSON(record);

    // Then
    assert.equal(result.status, 'ok');
    assert.equal(
      result.final_response,
      judge ? '{"findings":[]}' : 'Saved response',
    );
    assert.deepEqual(result.observed_settings, {
      model: 'observed',
      reasoning: null,
      sandbox: null,
      approval_policy: 'bypassPermissions',
    });
    assert.equal(seen.env, root);
    assert.ok(seen.args.includes(judge ? 'judge-model' : 'agent-model'));
    assert.ok(seen.args.includes(judge ? 'low' : 'high'));
    assert.equal(seen.args.includes('--tools'), judge);
    assert.equal(seen.args.includes('--json-schema'), judge);
    assert.ok(seen.args.includes('--setting-sources'));
  });
}

test('claude CLI preflight names the missing agent', async (t) => {
  // Given
  const root = await temporary(t);
  const oldPath = process.env.PATH;

  t.onTestFinished(() => {
    process.env.PATH = oldPath;
  });
  process.env.PATH = path.join(root, 'empty');
  await fs.mkdir(path.join(root, 'empty'));

  // When
  const act = () => getAgent('claude').version();

  // Then
  assert.throws(act, /Claude CLI unavailable/);
});

const withEnvironment = (
  t: { onTestFinished: (fn: () => void) => void },
  values: Record<string, string | undefined>,
) => {
  const previous = { ...process.env };

  t.onTestFinished(() => {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const options: any = {
  model: 'm',
  judgeModel: 'jm',
  reasoning: 'low',
  judgeReasoning: 'high',
};

test('claude agent without credentials inherits the login and warns', async (t) => {
  // Given
  withEnvironment(t, {
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    ANTHROPIC_API_KEY: undefined,
  });
  const agent = getAgent('claude');
  const warnings: unknown[] = [];
  const original = console.warn;

  console.warn = (...message: unknown[]) => warnings.push(message);
  t.onTestFinished(() => {
    console.warn = original;
  });

  // When
  await agent.prepareRuntime('runtime');
  const settings = agent.settings();
  const { args, env } = await agent.args(options, 'runtime', '.', {});

  // Then
  assert.equal(warnings.length, 1);
  assert.equal(settings.runtime_home, 'real config directory');
  assert.equal(env.CLAUDE_CONFIG_DIR, process.env.CLAUDE_CONFIG_DIR);
  assert.ok(args.includes('m'));
  assert.ok(!args.includes('--tools'));
});

test('claude agent with an API key isolates its config and supports judge schemas', async (t) => {
  // Given
  withEnvironment(t, {
    CLAUDE_CODE_OAUTH_TOKEN: undefined,
    ANTHROPIC_API_KEY: 'present',
  });
  const root = await temporary(t);
  const agent = getAgent('claude');

  await put(root, 'schema.json', '{"type":"object"}\n');

  // When
  await agent.prepareRuntime('runtime');
  const settings = agent.settings();
  const { args, env } = await agent.args(options, 'runtime', '.', {
    judge: true,
    schema: path.join(root, 'schema.json'),
  });

  // Then
  assert.match(String(settings.runtime_home), /temporary CLAUDE_CONFIG_DIR/);
  assert.equal(env.CLAUDE_CONFIG_DIR, 'runtime');
  assert.ok(args.includes('jm'));
  assert.ok(args.includes('Read,Grep,Glob'));
  assert.ok(args.includes('{"type":"object"}'));
});

test('claude agent reports observed settings from the init event', async () => {
  // Given
  const agent = getAgent('claude');
  const init = { model: 'm', permissionMode: 'bypassPermissions' };

  // When
  const observed = await agent.observedSettings('runtime', { init } as any);
  const missing = await agent.observedSettings('runtime', {} as any);

  // Then
  assert.deepEqual(observed, {
    model: 'm',
    reasoning: null,
    sandbox: null,
    approval_policy: 'bypassPermissions',
  });
  assert.equal(missing, null);
  assert.match(agent.settingsNote(observed), /init event/);
  assert.match(agent.settingsNote(missing), /did not emit/);
});

test('claude trace parser tolerates assistant messages without content', () => {
  // Given
  const raw = jsonl([{ type: 'assistant', message: {} }]);

  // When
  const trace = parseClaudeTrace(raw);

  // Then
  assert.deepEqual(trace.messages, []);
});

test('unknown agents are rejected', () => {
  // When
  const act = () => getAgent('nope' as any);

  // Then
  assert.throws(act, /Unknown agent: nope/);
});

test('claude observed settings default absent init fields to null', async () => {
  // Given
  const agent = getAgent('claude');

  // When
  const observed = await agent.observedSettings('runtime', { init: {} } as any);

  // Then
  assert.deepEqual(observed, {
    model: null,
    reasoning: null,
    sandbox: null,
    approval_policy: null,
  });
});
