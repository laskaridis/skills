import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { temporary, put } from './helpers.ts';
import { parseChecklist, loadCases, createCase } from '../lib/cases.ts';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));

test('checklists retain stable IDs, continuation text and CRLF', () => {
  // Given
  const text = '\n- [one] First\r\n  next\r\n\tmore\n\n- [two] Last\n';

  // When
  const result = parseChecklist(text);

  // Then
  assert.deepEqual(result, [
    { id: 'one', text: 'First\nnext\nmore' },
    { id: 'two', text: 'Last' },
  ]);
});

for (const [name, text] of Object.entries({
  empty: '',
  blank: '\n ',
  missingText: '- [id]',
  whitespace: '- [id]   ',
  duplicate: '- [id] A\n- [id] B',
  heading: '# Title',
  orphan: '  text',
  bullet: '- ordinary',
  invalidId: '- [a.b] text',
  singleIndent: ' x',
})) {
  test(`checklist rejects ${name} with source and line`, () => {
    // Given
    const withSource = () => parseChecklist(text, 'source.md');
    const withDefault = () => parseChecklist(text);

    // Then
    assert.throws(withSource, /source.md:\d+:/);
    assert.throws(withDefault, /expected.md:/);
  });
}

async function suite(t: import('vitest').TestContext) {
  const root = await temporary(t);

  for (const id of ['z-last', 'a-first']) {
    await put(root, `cases/${id}/fixtures/.gitkeep`);
    await put(root, `cases/${id}/prompt.md`, 'Task');
    await put(root, `cases/${id}/expected.md`, '- [works] Works');
  }

  return root;
}

test('case discovery sorts, omits packaging markers, and handles empty inputs', async (t) => {
  // Given
  const root = await suite(t);
  const initial = await loadCases(root, 'skill');

  await fs.unlink(path.join(root, 'cases/a-first/fixtures/.gitkeep'));

  // When
  const cases = await loadCases(root, 'skill');

  await put(root, 'cases/a-first/fixtures/new.md', 'Changed');
  const changed = await loadCases(root, 'skill');

  // Then
  assert.deepEqual(
    initial.map((c) => c.id),
    ['a-first', 'z-last'],
  );
  assert.deepEqual(initial[0].fixtureFiles, []);
  assert.notEqual(changed[0].inputHash, cases[0].inputHash);
});

for (const [name, mutate, pattern] of [
  ['unsafe skill', async () => {}, /Unsafe skill/],
  [
    'missing root',
    (root) => fs.rm(path.join(root, 'cases'), { recursive: true }),
    /Missing directory/,
  ],
  [
    'nonregular root',
    async (root) => {
      await fs.rm(path.join(root, 'cases'), { recursive: true });
      await put(root, 'cases');
    },
    /ordinary directory/,
  ],
  [
    'no cases',
    (root) =>
      fs
        .rm(path.join(root, 'cases'), { recursive: true })
        .then(() => fs.mkdir(path.join(root, 'cases'))),
    /No cases/,
  ],
  [
    'unsafe directory',
    (root) => fs.mkdir(path.join(root, 'cases/bad.name')),
    /safe case/,
  ],
  ['file instead of case', (root) => put(root, 'cases/file'), /safe case/],
  [
    'missing prompt',
    (root) => fs.unlink(path.join(root, 'cases/a-first/prompt.md')),
    /requires/,
  ],
  [
    'empty expected',
    (root) => put(root, 'cases/a-first/expected.md', ' '),
    /Empty file/,
  ],
  [
    'directory prompt',
    async (root) => {
      await fs.unlink(path.join(root, 'cases/a-first/prompt.md'));
      await fs.mkdir(path.join(root, 'cases/a-first/prompt.md'));
    },
    /ordinary file/,
  ],
  [
    'missing fixtures',
    (root) =>
      fs.rm(path.join(root, 'cases/a-first/fixtures'), { recursive: true }),
    /Missing directory/,
  ],
  [
    'git directory',
    (root) => fs.mkdir(path.join(root, 'cases/a-first/fixtures/.git')),
    /Unsafe fixture/,
  ],
  [
    'newline path',
    (root) => put(root, 'cases/a-first/fixtures/bad\nname'),
    /Unsafe fixture/,
  ],
  [
    'carriage return path',
    (root) => put(root, 'cases/a-first/fixtures/bad\rname'),
    /Unsafe fixture/,
  ],
  [
    'backslash path',
    (root) => put(root, 'cases/a-first/fixtures/bad\\name'),
    /Unsafe fixture/,
  ],
  [
    'skill collision',
    (root) =>
      fs.mkdir(path.join(root, 'cases/a-first/fixtures/.agents/skills/skill'), {
        recursive: true,
      }),
    /collision/,
  ],
  [
    'skill ancestor collision',
    (root) => put(root, 'cases/a-first/fixtures/.agents'),
    /collision/,
  ],
  [
    'symlink',
    (root) =>
      fs.symlink('/outside', path.join(root, 'cases/a-first/fixtures/link')),
    /Non-regular/,
  ],
] as [string, (root: string) => Promise<unknown>, RegExp][]) {
  test(`case preflight rejects ${name}`, async (t) => {
    // Given
    const root = await suite(t);
    const skill = name === 'unsafe skill' ? '../unsafe' : 'skill';

    await mutate(root);

    // When
    const result = loadCases(root, skill);

    // Then
    await assert.rejects(result, pattern);
  });
}

test('missing expected checklist is rejected before execution', async (t) => {
  // Given
  const root = await suite(t);

  await fs.unlink(path.join(root, 'cases/a-first/expected.md'));

  // When
  const result = loadCases(root, 'skill');

  // Then
  await assert.rejects(result, /requires/);
});

test('case loading propagates filesystem errors other than missing optional files', async (t) => {
  // Given
  const root = await suite(t);
  const lstat = fs.lstat;
  const fault = Object.assign(new Error('disk failed'), { code: 'EIO' });
  const spy = vi.spyOn(fs, 'lstat').mockImplementation((file, ...args) => {
    if (String(file).endsWith('prompt.md')) {
      return Promise.reject(fault);
    }

    return lstat(file, ...args);
  });

  t.onTestFinished(() => spy.mockRestore());

  // When
  const result = loadCases(root, 'skill');

  // Then
  await assert.rejects(result, /disk failed/);
});

test('case order does not depend on filesystem enumeration order', async (t) => {
  // Given
  const root = await suite(t);
  const readdir = fs.readdir;
  const spy = vi
    .spyOn(fs, 'readdir')
    .mockImplementation(async (file, ...args) => {
      const entries = await readdir(file, ...args);
      return String(file) === path.join(root, 'cases')
        ? entries.reverse()
        : entries;
    });

  t.onTestFinished(() => spy.mockRestore());

  // When
  const cases = await loadCases(root, 'skill');

  // Then
  assert.deepEqual(
    cases.map((c) => c.id),
    ['a-first', 'z-last'],
  );
});

test('createCase scaffolds a case that loads', async (t) => {
  // Given
  const root = await temporary(t);

  // When
  const directory = await createCase(root, 'fresh');

  // Then
  assert.equal(directory, path.join(root, 'cases', 'fresh'));
  assert.ok((await fs.stat(path.join(directory, 'prompt.md'))).isFile());
  assert.ok((await fs.stat(path.join(directory, 'expected.md'))).isFile());
  assert.ok(
    (await fs.stat(path.join(directory, 'fixtures', '.gitkeep'))).isFile(),
  );

  const [loaded] = await loadCases(root, 'skill');

  assert.equal(loaded.id, 'fresh');
  assert.equal(loaded.requirements.length, 1);
});

test('createCase fails without modifying an existing case', async (t) => {
  // Given
  const root = await temporary(t);

  await put(root, 'cases/fresh/prompt.md', 'Keep');

  // When
  const act = createCase(root, 'fresh');

  // Then
  await assert.rejects(act, /Case already exists/);
  assert.equal(
    await fs.readFile(path.join(root, 'cases/fresh/prompt.md'), 'utf8'),
    'Keep',
  );
  assert.deepEqual(await fs.readdir(path.join(root, 'cases/fresh')), [
    'prompt.md',
  ]);
});

test('createCase rejects unsafe identifiers', async (t) => {
  // Given
  const root = await temporary(t);

  // When
  const act = createCase(root, '../x');

  // Then
  await assert.rejects(act, /Unsafe case/);
});

test('createCase requires an existing suite and creates nothing', async (t) => {
  // Given
  const root = await temporary(t);
  const suite = path.join(root, 'pln');

  // When
  const act = createCase(suite, 'x');

  // Then
  await assert.rejects(act, /Missing directory/);
  assert.deepEqual(await fs.readdir(root), []);
});

test('createCase creates cases/ inside an existing suite', async (t) => {
  // Given
  const root = await temporary(t);

  // When
  const directory = await createCase(root, 'fresh');

  // Then
  assert.ok((await fs.stat(directory)).isDirectory());
});

test('createCase removes the partial case when a write fails', async (t) => {
  // Given
  const root = await temporary(t);

  await put(root, 'cases/other/fixtures/.gitkeep');

  const failure = new Error('disk full');
  const spy = vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(failure);

  t.onTestFinished(() => spy.mockRestore());

  // When
  const act = createCase(root, 'fresh');

  // Then
  await assert.rejects(act, /disk full/);
  assert.deepEqual(await fs.readdir(path.join(root, 'cases')), ['other']);
});

test('createCase rethrows unexpected errors creating the target', async (t) => {
  // Given
  const root = await temporary(t);
  const real = fs.mkdir;
  const failure = Object.assign(new Error('denied'), { code: 'EACCES' });
  const spy = vi.spyOn(fs, 'mkdir').mockImplementation(async (dir, options) => {
    if (String(dir).endsWith('fresh')) {
      throw failure;
    }

    return real(dir, options as any);
  });

  t.onTestFinished(() => spy.mockRestore());

  // When
  const act = createCase(root, 'fresh');

  // Then
  await assert.rejects(act, /denied/);
});
