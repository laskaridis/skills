import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { temporary, put } from './helpers.ts';
import { parseChecklist, loadCases, archiveChecklists } from '../lib/cases.ts';
import { readJSON } from '../lib/utils.ts';

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
    await put(root, `cases/${id}/input/.gitkeep`);
    await put(root, `cases/${id}/prompt.md`, 'Task');
    await put(root, `cases/${id}/expected.md`, '- [works] Works');
  }

  return root;
}

test('case discovery sorts, omits packaging markers, handles empty inputs and archives original requirements', async (t) => {
  // Given
  const root = await suite(t);
  const initial = await loadCases(root, 'skill');

  await fs.unlink(path.join(root, 'cases/a-first/input/.gitkeep'));

  // When
  const cases = await loadCases(root, 'skill');

  await archiveChecklists(cases, root);
  const expected = await readJSON(
    path.join(root, 'cases/z-last/expected.parsed.json'),
  );

  await put(root, 'cases/a-first/input/new.md', 'Changed');
  const changed = await loadCases(root, 'skill');

  // Then
  assert.deepEqual(
    initial.map((c) => c.id),
    ['a-first', 'z-last'],
  );
  assert.deepEqual(initial[0].fixtureFiles, []);
  assert.deepEqual(expected, cases[1].requirements);
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
    'missing input',
    (root) =>
      fs.rm(path.join(root, 'cases/a-first/input'), { recursive: true }),
    /Missing directory/,
  ],
  [
    'git directory',
    (root) => fs.mkdir(path.join(root, 'cases/a-first/input/.git')),
    /Unsafe fixture/,
  ],
  [
    'newline path',
    (root) => put(root, 'cases/a-first/input/bad\nname'),
    /Unsafe fixture/,
  ],
  [
    'carriage return path',
    (root) => put(root, 'cases/a-first/input/bad\rname'),
    /Unsafe fixture/,
  ],
  [
    'backslash path',
    (root) => put(root, 'cases/a-first/input/bad\\name'),
    /Unsafe fixture/,
  ],
  [
    'skill collision',
    (root) =>
      fs.mkdir(path.join(root, 'cases/a-first/input/.agents/skills/skill'), {
        recursive: true,
      }),
    /collision/,
  ],
  [
    'skill ancestor collision',
    (root) => put(root, 'cases/a-first/input/.agents'),
    /collision/,
  ],
  [
    'symlink',
    (root) =>
      fs.symlink('/outside', path.join(root, 'cases/a-first/input/link')),
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
