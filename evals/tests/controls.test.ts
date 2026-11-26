import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { put, temporary } from './helpers.ts';
import { loadJudgeControls } from '../lib/controls.ts';

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

// Writes a suite whose controls.yml is the given document (JSON is valid YAML)
// and whose only fixture folder is bad-output.
async function suiteDeclaring(
  t: import('vitest').TestContext,
  document: unknown,
) {
  const suite = await temporary(t);

  await put(suite, 'judge-controls/controls.yml', JSON.stringify(document));
  await put(
    suite,
    'judge-controls/fixtures/bad-output/final-message.md',
    'Done.',
  );
  return suite;
}

function declare(control: Record<string, unknown>) {
  return { version: 1, controls: { 'bad-output': control } };
}

const valid = declaration.controls['bad-output'];

test('loadJudgeControls expands default and expect to a verdict for every criterion', async (t) => {
  // Given
  const suite = await suiteDeclaring(t, declaration);

  // When
  const controls = await loadJudgeControls(suite, cases);

  // Then
  assert.deepEqual(controls, [
    {
      id: 'bad-output',
      caseId: 'basic',
      description: 'Plausible but inaccurate.',
      generatedFiles: {},
      finalResponse: 'Done.',
      expected: { accurate: 'fail', complete: 'pass' },
    },
  ]);
});

test('loadJudgeControls accepts a control without description or expect', async (t) => {
  // Given
  const document = declare({ case: 'basic', default: 'ungradable' });
  const suite = await suiteDeclaring(t, document);

  // When
  const controls = await loadJudgeControls(suite, cases);

  // Then
  assert.deepEqual(controls, [
    {
      id: 'bad-output',
      caseId: 'basic',
      generatedFiles: {},
      finalResponse: 'Done.',
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
  test(`loadJudgeControls rejects ${name}`, async (t) => {
    // Given
    const suite = await suiteDeclaring(t, document);

    // When
    const act = () => loadJudgeControls(suite, cases);

    // Then
    await assert.rejects(act, /controls\.yml|control/i);
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
