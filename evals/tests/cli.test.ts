import type { TransportCall } from './helpers.ts';
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { argumentsFor, main } from '../run.ts';
import {
  temporary,
  put,
  putControl,
  fakeCodex,
  fakeTransport,
  EVALS,
} from './helpers.ts';
import { readJSON } from '../lib/utils.ts';

test('arguments resolve defaults and all supported overrides', () => {
  // When
  const a = argumentsFor(['plan', '--model', 'agent']);
  const b = argumentsFor([
    'plan',
    '--model',
    'a',
    '--judge-model',
    'b',
    '--reasoning',
    'low',
    '--judge-reasoning',
    'medium',
    '--skill',
    'candidate',
    '--compare',
    'baseline.json',
    '--case',
    'complete',
    '--calibrate',
  ]);
  const help = argumentsFor(['--help']);

  // Then
  assert.equal(a.judgeModel, 'agent');
  assert.equal(a.reasoning, 'high');
  assert.equal(a.judgeReasoning, 'high');
  assert.equal(a.skill, path.resolve(EVALS, '../skills/plan'));

  assert.equal(b.skill, path.resolve('candidate'));
  assert.equal(b.compare, path.resolve('baseline.json'));
  assert.equal(b.case, 'complete');
  assert.equal(b.calibrate, true);
  assert.equal(b.judgeReasoning, 'medium');

  assert.equal(help.help, true);
});

test('no-skill flag selects a suite without resolving a skill directory', () => {
  // When
  const options = argumentsFor(['plan', '--model', 'agent', '--no-skill']);

  // Then
  assert.equal(options.noSkill, true);
  assert.equal(options.skillName, 'plan');
  assert.equal(options.skill, '');
});

test('no-skill flag cannot be combined with a skill directory', () => {
  // When
  const act = () =>
    argumentsFor([
      'plan',
      '--model',
      'a',
      '--no-skill',
      '--skill',
      'candidate',
    ]);

  // Then
  assert.throws(act, /--no-skill and --skill are mutually exclusive/);
});

test('no-checks flag skips the suite checks and keeps the skill', () => {
  // When
  const options = argumentsFor(['plan', '--model', 'agent', '--no-checks']);
  const defaults = argumentsFor(['plan', '--model', 'agent']);

  // Then
  assert.equal(options.noChecks, true);
  assert.equal(options.skill, path.resolve(EVALS, '../skills/plan'));

  assert.ok(!defaults.noChecks);
});

test('create flag needs a case but no model', () => {
  // When
  const options = argumentsFor(['plan', '--case', 'x', '--create']);
  const act = () => argumentsFor(['plan', '--create']);

  // Then
  assert.equal(options.create, true);
  assert.equal(options.case, 'x');
  assert.throws(act, /--case/);
});

test('main scaffolds a case without calling the agent', async (t) => {
  // Given
  const root = await temporary(t);

  await fs.mkdir(path.join(root, 'skills', 'plan'), { recursive: true });
  const calls: TransportCall[] = [];
  const transport = fakeTransport({}, calls);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  t.onTestFinished(() => log.mockRestore());

  // When
  await main(['plan', '--case', 'x', '--create'], {
    evalRoot: root,
    transport,
  });

  // Then
  const directory = path.join(root, 'skills', 'plan', 'cases', 'x');

  assert.ok((await fs.stat(path.join(directory, 'prompt.md'))).isFile());
  assert.ok((await fs.stat(path.join(directory, 'expected.md'))).isFile());
  assert.ok((await fs.stat(path.join(directory, 'fixtures'))).isDirectory());
  assert.equal(calls.length, 0);
});

test('main fails when the scaffolded case already exists', async (t) => {
  // Given
  const root = await temporary(t);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  t.onTestFinished(() => log.mockRestore());
  await put(root, 'skills/plan/cases/x/prompt.md', 'Keep');

  // When
  const act = main(['plan', '--case', 'x', '--create'], { evalRoot: root });

  // Then
  await assert.rejects(act, /already exists/);
  assert.equal(
    await fs.readFile(path.join(root, 'skills/plan/cases/x/prompt.md'), 'utf8'),
    'Keep',
  );
});

for (const args of [
  [],
  ['plan'],
  ['../unsafe', '--model', 'x'],
  ['plan', '--model'],
  ['plan', '--model', '--help'],
  ['--unknown'],
  ['--self-test'],
  ['plan', '--self-test'],
]) {
  test(`arguments reject ${args.join(' ') || 'empty'}`, () => {
    // When
    const act = () => argumentsFor(args);

    // Then
    assert.throws(act);
  });
}

test('CLI exposes help, rejects removed self-test and missing model', () => {
  for (const args of [['--help'], ['--self-test'], []]) {
    // When
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', path.join(EVALS, 'run.ts'), ...args],
      { encoding: 'utf8' },
    );

    // Then
    assert.equal(result.status, args[0] === '--help' ? 0 : 2);

    if (args[0] === '--help') {
      assert.ok(!result.stdout.includes('--self-test'));
      assert.match(result.stdout, /\[--skill DIR \| --no-skill\]/);
      assert.match(result.stdout, /\[--no-checks\]/);
    }
  }
});

async function environment(t: import('vitest').TestContext) {
  const root = await temporary(t);
  const bin = await fakeCodex(root);
  const oldPath = process.env.PATH;
  const oldHome = process.env.CODEX_HOME;
  const oldExit = process.exitCode;

  t.onTestFinished(() => {
    process.env.PATH = oldPath;

    if (oldHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = oldHome;
    }

    process.exitCode = oldExit;
  });
  process.env.PATH = `${bin}:${oldPath}`;
  process.env.CODEX_HOME = path.join(root, 'synthetic-auth');
  await put(root, 'skill/SKILL.md', '# Synthetic');

  for (const id of ['z-last', 'a-first']) {
    await put(
      root,
      `evals/skills/synthetic/cases/${id}/fixtures/document.md`,
      'Old',
    );
    await put(root, `evals/skills/synthetic/cases/${id}/prompt.md`, 'Improve');
    await put(
      root,
      `evals/skills/synthetic/cases/${id}/expected.md`,
      '- [accurate] Accurate',
    );
  }

  return {
    root,
    bin,
    suite: path.join(root, 'evals/skills/synthetic'),
    args: ['synthetic', '--model', 'fake', '--skill', path.join(root, 'skill')],
    deps: { evalRoot: path.join(root, 'evals'), transport: fakeTransport() },
  };
}

test('main help does not require a suite', async () => {
  // When
  const result = await main(['--help']);

  // Then
  assert.equal(result, undefined);
});

test('orchestrator with no-checks never runs the suite checks', async (t) => {
  // Given
  const { args, deps, suite } = await environment(t);

  await put(
    suite,
    'checks.ts',
    "export function checkCase() { throw new Error('checks ran'); }",
  );

  // When
  const result = await main(
    [...args, '--no-checks', '--case', 'a-first'],
    deps,
  );
  const saved = await readJSON(path.join(result!.directory, 'results.json'));

  // Then
  assert.equal(saved.settings.checks_mode, 'skipped');
  assert.deepEqual(saved.cases[0].checks, { status: 'skipped', failures: [] });
  assert.equal(saved.cases[0].harness_error, undefined);
});

test('orchestrator with no-checks never loads the suite checks module', async (t) => {
  // Given
  const { args, deps, suite } = await environment(t);

  await put(suite, 'checks.ts', "throw new Error('checks loaded');");

  // When
  const result = await main(
    [...args, '--no-checks', '--case', 'a-first'],
    deps,
  );

  // Then
  assert.equal(result!.results.settings.checks_mode, 'skipped');
  assert.deepEqual(result!.results.cases[0].checks, {
    status: 'skipped',
    failures: [],
  });
});

test('orchestrator runs sorted cases and archives exact inputs without credentials', async (t) => {
  // Given
  const { args, deps } = await environment(t);
  const calls: TransportCall[] = [];

  await put(process.env.CODEX_HOME!, 'auth.json', 'SYNTHETIC AUTH');

  deps.transport = fakeTransport({}, calls);

  // When
  const result = await main(args, deps);
  const saved = await readJSON(path.join(result!.directory, 'results.json'));

  // Then
  assert.deepEqual(
    result!.results.cases.map((c) => c.case),
    ['a-first', 'z-last'],
  );

  assert.equal(result!.results.format_version, 2);
  assert.ok(result!.results.skill_hash);
  assert.equal(saved.cases.length, 2);

  assert.ok(saved.skill_hash);
  assert.ok(saved.inputs_hash);
  assert.ok(saved.harness_git);

  await assert.rejects(fs.access(path.join(result!.directory, 'inputs')));
});

test('orchestrator compares baseline and single selection still calibrates all controls', async (t) => {
  // Given
  const { args, deps, suite } = await environment(t);

  await put(
    suite,
    'checks.ts',
    "export const checkCase = () => ({status:'pass',failures:[]});",
  );
  await put(suite, 'README.md', 'Suite');
  await put(suite, 'run.ts', '// entry');
  await putControl(suite, 'z-last');

  const baseline = await main(args, deps);

  // When
  const result = await main(
    [
      ...args,
      '--case',
      'a-first',
      '--compare',
      path.join(baseline!.directory, 'results.json'),
      '--calibrate',
    ],
    deps,
  );

  // Then
  assert.equal(result!.results.cases.length, 1);
  assert.equal(result!.results.cases[0].checks.status, 'pass');

  assert.equal(result!.results.calibration!.status, 'pass');
  assert.equal(result!.results.calibration!.controls![0].case, 'z-last');

  assert.deepEqual(result!.results.comparison!.excluded_cases, [
    'synthetic/z-last',
  ]);

  assert.ok(result!.results.comparison);

  await assert.rejects(
    fs.access(path.join(result!.directory, 'baseline.json')),
    {
      code: 'ENOENT',
    },
  );
});

test('orchestrator runs a no-skill baseline that a with-skill run can compare against', async (t) => {
  // Given
  const { args, deps } = await environment(t);
  const calls: TransportCall[] = [];

  deps.transport = fakeTransport({}, calls);

  // When
  const baseline = await main(
    ['synthetic', '--model', 'fake', '--no-skill', '--case', 'a-first'],
    deps,
  );
  const compared = await main(
    [
      ...args,
      '--case',
      'a-first',
      '--compare',
      path.join(baseline!.directory, 'results.json'),
    ],
    deps,
  );

  // Then
  assert.equal(baseline!.results.skill_hash, 'none');
  assert.equal(baseline!.results.settings.skill_mode, 'none');
  assert.equal(calls[0].prompt, 'Improve');

  assert.ok(
    compared!.results.comparison!.limitations.some((x) =>
      x.startsWith('With/without-skill comparison'),
    ),
  );
});

test('calibration without module is unavailable and infrastructure failures set exit 2', async (t) => {
  // Given
  const { args, deps } = await environment(t);

  deps.transport = fakeTransport({ failAt: 'agent' });

  // When
  const result = await main([...args, '--calibrate'], deps);

  // Then
  assert.equal(result!.results.calibration!.status, 'unavailable');
  assert.equal(process.exitCode, 2);
});

for (const [name, mutate, extra] of [
  ['unknown case', async () => {}, ['--case', 'unknown']],
  [
    'invalid hook',
    (e) => put(e.suite, 'checks.ts', 'export const wrong=1;'),
    [],
  ],
  ['nonregular hook', (e) => fs.mkdir(path.join(e.suite, 'checks.ts')), []],
  [
    'bad control',
    (e) =>
      put(e.suite, 'judge-controls/controls.yml', 'version: 1\ncontrols: {}\n'),
    ['--calibrate'],
  ],
  [
    'bad baseline',
    (e) => put(e.root, 'baseline.json', '{"format_version":99,"cases":[]}'),
    ['--compare', 'BASELINE'],
  ],
  [
    'non-directory skill',
    async (e) => {
      await fs.rm(path.join(e.root, 'skill'), { recursive: true });
      await put(e.root, 'skill');
    },
    [],
  ],
  [
    'non-file skill definition',
    async (e) => {
      await fs.unlink(path.join(e.root, 'skill/SKILL.md'));
      await fs.mkdir(path.join(e.root, 'skill/SKILL.md'));
    },
    [],
  ],
  [
    'unavailable codex',
    async (e) => {
      process.env.PATH = e.root;
    },
    [],
  ],
  [
    'failed version',
    async (e) => {
      await put(e.bin, 'codex', '#!/bin/sh\necho failed >&2\nexit 2\n');
      await fs.chmod(path.join(e.bin, 'codex'), 0o755);
    },
    [],
  ],
  [
    'nonregular archival suite file',
    (e) => fs.mkdir(path.join(e.suite, 'README.md')),
    [],
  ],
] as [string, (e: any) => Promise<unknown>, string[]][]) {
  test(`main rejects ${name} before model calls`, async (t) => {
    // Given
    const e = await environment(t);
    let called = false;

    await mutate(e);

    e.deps.transport = async () => {
      called = true;
      throw new Error('must not call');
    };

    const flags = extra.map((x) =>
      x === 'BASELINE' ? path.join(e.root, 'baseline.json') : x,
    );

    // When
    const result = main([...e.args, ...flags], e.deps);

    // Then
    await assert.rejects(result);

    assert.equal(called, false);
  });
}

test('optional suite module propagates non-missing filesystem errors before calls', async (t) => {
  // Given
  const e = await environment(t);
  const lstat = fs.lstat;
  const spy = vi.spyOn(fs, 'lstat').mockImplementation((file, ...args) => {
    if (String(file).endsWith('checks.ts')) {
      return Promise.reject(
        Object.assign(new Error('disk failed'), { code: 'EIO' }),
      );
    }

    return lstat(file, ...args);
  });

  t.onTestFinished(() => spy.mockRestore());

  // When
  const result = main(e.args, e.deps);

  // Then
  await assert.rejects(result, /disk failed/);
});

test('orchestrator falls back to home authentication path without reading real credentials', async (t) => {
  // Given
  const { default: os } = await import('node:os');
  const e = await environment(t);
  const spy = vi
    .spyOn(os, 'homedir')
    .mockReturnValue(path.join(e.root, 'synthetic-home'));

  t.onTestFinished(() => spy.mockRestore());
  delete process.env.CODEX_HOME;

  // When
  const result = await main([...e.args, '--case', 'a-first'], e.deps);

  // Then
  assert.equal(result!.results.cases[0].execution.status, 'ok');
});

test('SIGTERM during the first case cancels the whole suite', async (t) => {
  // Given
  const { args, deps, suite } = await environment(t);
  const calls: TransportCall[] = [];
  const initialInt = process.listenerCount('SIGINT');
  const initialTerm = process.listenerCount('SIGTERM');

  await putControl(suite, 'z-last');
  deps.transport = fakeTransport(
    {
      onCall: ({ stage }) => {
        if (stage === 'agent') {
          process.emit('SIGTERM');
        }
      },
    },
    calls,
  );

  // When
  const result = await main([...args, '--calibrate'], deps);
  const saved = await readJSON(path.join(result!.directory, 'results.json'));

  // Then
  assert.equal(process.exitCode, 130);
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['agent'],
  );
  assert.equal(result!.results.cancelled, true);
  assert.equal(result!.results.calibration, undefined);
  assert.deepEqual(
    saved.cases.map((c: { case: string }) => c.case),
    ['a-first'],
  );
  assert.equal(saved.cancelled, true);
  assert.equal(saved.calibration, undefined);

  await fs.access(path.join(result!.directory, 'a-first/result.json'));
  await fs.access(path.join(result!.directory, 'report.md'));
  await assert.rejects(fs.access(path.join(result!.directory, 'z-last')));

  assert.equal(process.listenerCount('SIGINT'), initialInt);
  assert.equal(process.listenerCount('SIGTERM'), initialTerm);
});
