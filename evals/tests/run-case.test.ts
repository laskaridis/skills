import type { TransportCall } from './helpers.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fixture, fakeTransport, put } from './helpers.ts';
import { runCase, workspaceContents } from '../lib/run-case.ts';
import { infrastructureFailure } from '../lib/reporting.ts';

test('workspace evidence excludes installed skill and represents unsafe artifacts', async (t) => {
  // Given
  const { root } = await fixture(t);

  await put(root, '.agents/skills/synthetic/SKILL.md', 'Hidden');
  await fs.symlink('/outside', path.join(root, 'link'));

  // When
  const contents = await workspaceContents(root, 'synthetic');

  // Then
  assert.equal(contents['.agents/skills/synthetic/SKILL.md'], undefined);
  assert.equal(contents.link, '[non-regular or unsafe artifact]');
});

const scenarios: [string, Record<string, any>, string, string][] = [
  ['ordinary run', {}, 'ok', 'not_run'],
  ['quality failure', { quality: 'fail' }, 'ok', 'not_run'],
  ['ungradable evidence', { quality: 'ungradable' }, 'ok', 'not_run'],
  ['no response with fixture evidence', { noResponse: true }, 'ok', 'not_run'],
  ['no evidence', { noResponse: true, deleteEvidence: true }, 'ok', 'not_run'],
  [
    'agent timeout',
    { failAt: 'agent', failure: 'timeout' },
    'timeout',
    'not_run',
  ],
  ['agent throws', { throwAt: 'agent' }, 'execution_error', 'not_run'],
  [
    'agent throws without stack',
    { throwAt: 'agent', noStack: true },
    'execution_error',
    'not_run',
  ],
  ['judge throws', { throwAt: 'final' }, 'ok', 'not_run'],
  ['judge fails', { failAt: 'final' }, 'ok', 'not_run'],
  [
    'validator pass',
    { checkCase: () => ({ status: 'pass', failures: [] }) },
    'ok',
    'pass',
  ],
  [
    'validator fail',
    {
      checkCase: () => ({
        status: 'fail',
        failures: ['Protected file changed'],
      }),
    },
    'ok',
    'fail',
  ],
  [
    'validator throws',
    {
      checkCase: () => {
        throw new Error('Validator broke');
      },
    },
    'ok',
    'error',
  ],
  [
    'validator no stack',
    {
      checkCase: () => {
        throw { message: 'No stack' };
      },
    },
    'ok',
    'error',
  ],
  [
    'early validator',
    {
      failAt: 'agent',
      checkCase: () => ({ status: 'fail', failures: ['Missing output'] }),
    },
    'execution_error',
    'fail',
  ],
];

for (const [name, config, execution, checks] of scenarios) {
  test(`case lifecycle: ${name}`, async (t) => {
    // Given
    const { root, options, item } = await fixture(t);
    const calls: TransportCall[] = [];

    // When
    const result = await runCase(
      {
        ...options,
        transport: fakeTransport(config, calls),
        checkCase: config.checkCase,
      },
      root,
      root,
      item,
    );
    const archived = JSON.parse(
      await fs.readFile(path.join(root, 'basic/result.json'), 'utf8'),
    );
    const first = calls.find((c) => c.stage === 'agent');

    // Then
    assert.equal(result.execution.status, execution);
    assert.equal(result.checks.status, checks);

    assert.equal(archived.execution.status, execution);
    await fs.access(path.join(root, 'basic/workspace.manifest.json'));

    for (const call of calls) {
      await assert.rejects(fs.access(call.workspace));
    }

    assert.ok(first);
    assert.ok(first.prompt.startsWith('$synthetic'));

    if (
      config.quality === 'fail' ||
      (checks === 'fail' && execution === 'ok')
    ) {
      assert.equal(infrastructureFailure({ cases: [result] }), false);
    }
  });
}

for (const value of [
  null,
  {},
  { status: 'other', failures: [] },
  { status: 'pass', failures: 'bad' },
  { status: 'pass', failures: ['error'] },
  { status: 'fail', failures: [] },
  { status: 'fail', failures: [' '] },
  { status: 'pass', failures: [], extra: true },
]) {
  test(`invalid validator result ${JSON.stringify(value)}`, async (t) => {
    // Given
    const { root, options, item } = await fixture(t);

    // When
    const result = await runCase(
      {
        ...options,
        transport: fakeTransport(),
        checkCase: (() => value) as any,
      },
      root,
      root,
      item,
    );

    // Then
    assert.equal(result.checks.status, 'error');
    assert.equal(result.judge.status, 'ok');
  });
}

test('case folder does not contain initial snapshot or initial workspace', async (t) => {
  // Given
  const { root, options, item } = await fixture(t);
  const directory = path.join(root, item.id);

  // When
  await runCase({ ...options, transport: fakeTransport() }, root, root, item);

  // Then
  await assert.rejects(
    fs.access(path.join(directory, 'initial-snapshot.json')),
  );
  await assert.rejects(fs.access(path.join(directory, 'initial-workspace')));
  await assert.rejects(
    fs.access(path.join(directory, 'initial-workspace.manifest.json')),
  );
  await assert.doesNotReject(fs.access(path.join(directory, 'workspace')));
});

test('setup failure archives workspace and does not run validator without initial snapshot', async (t) => {
  // Given
  const { root, options, item } = await fixture(t);
  let called = false;

  // When
  const result = await runCase(
    {
      ...options,
      skill: path.join(root, 'absent'),
      checkCase: () => {
        called = true;
        return { status: 'pass', failures: [] };
      },
    },
    root,
    root,
    item,
  );

  // Then
  assert.equal(result.execution.status, 'execution_error');
  assert.equal(called, false);

  assert.match(result.harness_error!, /ENOENT/);
});

test('agent never sees expected checklist or grader files', async (t) => {
  // Given
  const { root, options, item } = await fixture(t);
  const hidden = ['expected.md', 'rubric.md', 'schema.json'];

  // When
  const result = runCase(
    {
      ...options,
      transport: fakeTransport({
        onCall: async ({ workspace, mode }) => {
          if (!mode.judge) {
            for (const f of hidden) {
              await assert.rejects(fs.access(path.join(workspace, f)));
            }
          }
        },
      }),
    },
    root,
    root,
    item,
  );

  // Then
  await assert.doesNotReject(result);
});

test('case and judges can use the default Codex transport with a fake executable', async (t) => {
  // Given
  const { fakeCodex } = await import('./helpers.ts');
  const { root, options, item } = await fixture(t);
  const bin = await fakeCodex(
    root,
    `
import fs from 'node:fs';
const args=process.argv.slice(2);
const judge=args.includes('--output-schema');
const response=judge ? JSON.stringify({findings:[{id:'accurate',status:'pass',evidence:['Observed output']}]}) : 'Done';
fs.writeFileSync(args[args.indexOf('-o')+1],response);
console.log(JSON.stringify({type:'thread.started',thread_id:'same-session'}));
console.log(JSON.stringify({type:'turn.completed'}));
`,
  );
  const oldPath = process.env.PATH;

  t.onTestFinished(() => {
    process.env.PATH = oldPath;
  });
  process.env.PATH = `${bin}:${oldPath}`;

  // When
  const result = await runCase(
    {
      ...options,
      model: 'fake',
      judgeModel: 'fake',
      reasoning: 'high',
      judgeReasoning: 'high',
    },
    root,
    root,
    item,
  );

  // Then
  assert.equal(result.execution.status, 'ok');
  assert.equal(result.judge.status, 'ok');
});
