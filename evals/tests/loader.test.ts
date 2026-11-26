import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { put, temporary } from './helpers.ts';
import {
  loadJudgeControls,
  loadDeterministicChecksFor,
  validateControls,
} from '../lib/loader.ts';

const cases = [
  {
    id: 'basic',
    requirements: [
      { id: 'accurate', text: 'Accurate document.' },
      { id: 'complete', text: 'Complete document.' },
    ],
  },
];

const CONTROLS_YML = `version: 1
controls:
  bad-output:
    case: basic
    description: Plausible but inaccurate.
    default: pass
    expect:
      accurate: fail
`;

// Writes a suite whose judge-controls declare one valid control, bad-output.
async function controlSuite(t: import('vitest').TestContext) {
  const suite = await temporary(t);
  const fixture = path.join(suite, 'judge-controls/fixtures/bad-output');

  await put(suite, 'judge-controls/controls.yml', CONTROLS_YML);
  await put(fixture, 'final-message.md', 'Done.\n');
  await put(fixture, 'skill-output-files/document.md', 'Prepared');
  await put(fixture, 'skill-output-files/notes/extra.txt', 'Nested');
  return { suite, fixture };
}

const declaration = {
  version: 1,
  controls: {
    'bad-output': {
      case: 'basic',
      description: 'Plausible but inaccurate.',
      default: 'pass',
      expect: { accurate: 'fail' },
    },
  },
};

function declare(control: Record<string, unknown>) {
  return { version: 1, controls: { 'bad-output': control } };
}

const valid = declaration.controls['bad-output'];

test('optional checks module is null when absent and rejected when not a file', async (t) => {
  // Given
  const root = await temporary(t);
  const empty = await temporary(t);

  await put(root, 'checks.ts/inner.ts', '');

  // When
  const hooks = await loadDeterministicChecksFor(empty);
  const act = () => loadDeterministicChecksFor(root);

  // Then
  assert.equal(hooks, null);
  await assert.rejects(act, /Expected ordinary module/);
});

test('hooks must export checkCase when checks.ts exists', async (t) => {
  // Given
  const validHooks = await temporary(t);
  const invalid = await temporary(t);
  const empty = await temporary(t);

  await put(validHooks, 'checks.ts', 'export function checkCase() {}');
  await put(invalid, 'checks.ts', 'export const other = 1;');

  // When
  const loaded = await loadDeterministicChecksFor(validHooks);
  const none = await loadDeterministicChecksFor(empty);
  const act = () => loadDeterministicChecksFor(invalid);

  // Then
  assert.equal(typeof loaded.checkCase, 'function');
  assert.equal(none, null);
  await assert.rejects(act, /checks.ts must export checkCase/);
});

test('validateControls expands default and expect to a verdict for every criterion', () => {
  // When
  const controls = validateControls(declaration, cases);

  // Then
  assert.deepEqual(controls, [
    {
      id: 'bad-output',
      caseId: 'basic',
      description: 'Plausible but inaccurate.',
      expected: { accurate: 'fail', complete: 'pass' },
    },
  ]);
});

test('validateControls accepts a control without description or expect', () => {
  // Given
  const document = declare({ case: 'basic', default: 'ungradable' });

  // When
  const controls = validateControls(document, cases);

  // Then
  assert.deepEqual(controls, [
    {
      id: 'bad-output',
      caseId: 'basic',
      expected: { accurate: 'ungradable', complete: 'ungradable' },
    },
  ]);
});

for (const [name, document] of Object.entries({
  notMap: [],
  missingVersion: { controls: declaration.controls },
  unsupportedVersion: { ...declaration, version: 2 },
  extraTopLevelKey: { ...declaration, extra: true },
  missingControls: { version: 1 },
  emptyControls: { version: 1, controls: {} },
  controlsList: { version: 1, controls: [valid] },
  unsafeId: { version: 1, controls: { 'bad.id': valid } },
  controlNotMap: declare(null as any),
  missingCase: declare({ ...valid, case: undefined }),
  unknownCase: declare({ ...valid, case: 'unknown' }),
  unknownKey: declare({ ...valid, extra: true }),
  descriptionType: declare({ ...valid, description: 1 }),
  missingDefault: declare({ ...valid, default: undefined }),
  invalidDefault: declare({ ...valid, default: 'other' }),
  expectList: declare({ ...valid, expect: ['accurate'] }),
  unknownCriterion: declare({ ...valid, expect: { other: 'fail' } }),
  invalidStatus: declare({ ...valid, expect: { accurate: 'other' } }),
})) {
  test(`validateControls rejects ${name}`, () => {
    // When
    const act = () => validateControls(document, cases);

    // Then
    assert.throws(act);
  });
}

test('loadJudgeControls returns null when the suite has no judge-controls', async (t) => {
  // Given
  const suite = await temporary(t);

  // When
  const controls = await loadJudgeControls(suite, cases);

  // Then
  assert.equal(controls, null);
});

test('loadJudgeControls reads fixtures into the response, generated files and verdicts', async (t) => {
  // Given
  const { suite } = await controlSuite(t);

  // When
  const controls = await loadJudgeControls(suite, cases);

  // Then
  assert.deepEqual(controls, [
    {
      id: 'bad-output',
      caseId: 'basic',
      description: 'Plausible but inaccurate.',
      generatedFiles: {
        'document.md': 'Prepared',
        'notes/extra.txt': 'Nested',
      },
      finalResponse: 'Done.\n',
      expected: { accurate: 'fail', complete: 'pass' },
    },
  ]);
});

test('loadJudgeControls uses no generated files when skill-output-files is absent', async (t) => {
  // Given
  const { suite, fixture } = await controlSuite(t);

  await fs.rm(path.join(fixture, 'skill-output-files'), { recursive: true });

  // When
  const controls = await loadJudgeControls(suite, cases);

  // Then
  assert.deepEqual(controls?.[0].generatedFiles, {});
});

for (const [name, mutate, error] of [
  [
    'judge-controls that is not a directory',
    async (suite) => {
      await fs.rm(path.join(suite, 'judge-controls'), { recursive: true });
      await put(suite, 'judge-controls');
    },
    /Expected ordinary directory/,
  ],
  [
    'a missing controls.yml',
    (suite) => fs.rm(path.join(suite, 'judge-controls/controls.yml')),
    /controls\.yml/,
  ],
  [
    'more than one YAML document',
    (suite) =>
      put(suite, 'judge-controls/controls.yml', `${CONTROLS_YML}---\n{}\n`),
    /controls\.yml/,
  ],
  [
    'duplicate control IDs',
    (suite) =>
      put(
        suite,
        'judge-controls/controls.yml',
        `${CONTROLS_YML}  bad-output:\n    case: basic\n    default: pass\n`,
      ),
    /controls\.yml/,
  ],
  [
    'an invalid declaration',
    (suite) =>
      put(suite, 'judge-controls/controls.yml', 'version: 1\ncontrols: {}\n'),
    /at least one control/,
  ],
  [
    'a control without a fixture folder',
    (suite) =>
      fs.rm(path.join(suite, 'judge-controls/fixtures'), { recursive: true }),
    /bad-output/,
  ],
  [
    'fixtures that is not a directory',
    async (suite) => {
      await fs.rm(path.join(suite, 'judge-controls/fixtures'), {
        recursive: true,
      });
      await put(suite, 'judge-controls/fixtures');
    },
    /fixtures/,
  ],
  [
    'a fixture folder without a control',
    (suite) =>
      put(suite, 'judge-controls/fixtures/orphan/final-message.md', 'Done'),
    /orphan/,
  ],
  [
    'a file directly under fixtures',
    (suite) => put(suite, 'judge-controls/fixtures/stray.md', 'Done'),
    /stray\.md/,
  ],
  [
    'a missing final-message.md',
    (suite) =>
      fs.rm(
        path.join(suite, 'judge-controls/fixtures/bad-output/final-message.md'),
      ),
    /final-message\.md/,
  ],
  [
    'an empty final-message.md',
    (suite) =>
      put(suite, 'judge-controls/fixtures/bad-output/final-message.md', ' \n'),
    /final-message\.md/,
  ],
  [
    'an unexpected entry in a fixture folder',
    (suite) =>
      put(suite, 'judge-controls/fixtures/bad-output/notes.md', 'Stray'),
    /notes\.md/,
  ],
  [
    'skill-output-files that is not a directory',
    async (suite) => {
      const outputs = 'judge-controls/fixtures/bad-output/skill-output-files';

      await fs.rm(path.join(suite, outputs), { recursive: true });
      await put(suite, outputs);
    },
    /skill-output-files/,
  ],
  [
    'a symlink among the skill output files',
    (suite) =>
      fs.symlink(
        path.join(suite, 'judge-controls/controls.yml'),
        path.join(
          suite,
          'judge-controls/fixtures/bad-output/skill-output-files/link.md',
        ),
      ),
    /link\.md/,
  ],
] as [string, (suite: string) => Promise<unknown>, RegExp][]) {
  test(`loadJudgeControls rejects ${name}`, async (t) => {
    // Given
    const { suite } = await controlSuite(t);

    await mutate(suite);

    // When
    const act = () => loadJudgeControls(suite, cases);

    // Then
    await assert.rejects(act, error);
  });
}
