import type { Control } from '../lib/types.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { requirements, put, temporary } from './helpers.ts';
import {
  loadJudgeTests,
  loadDeterministicChecksFor,
  validateControls,
} from '../lib/loader.ts';

const control: Control = {
  id: 'bad-output',
  caseId: 'basic',
  generatedFiles: { 'document.md': 'Prepared' },
  finalResponse: 'Done',
  expected: { accurate: 'fail' },
};

test('optional modules are null when absent and rejected when not files', async (t) => {
  // Given
  const root = await temporary(t);
  const emptyHooks = await temporary(t);
  const emptyControls = await temporary(t);

  await put(root, 'checks.ts/inner.ts', '');
  await put(root, 'judge-tests.ts/inner.ts', '');

  // When
  const hooks = await loadDeterministicChecksFor(emptyHooks);
  const controls = await loadJudgeTests(emptyControls, []);
  const hooksAct = () => loadDeterministicChecksFor(root);
  const controlsAct = () => loadJudgeTests(root, []);

  // Then
  assert.equal(hooks, null);
  assert.equal(controls, null);
  await assert.rejects(hooksAct, /Expected ordinary module/);
  await assert.rejects(controlsAct, /Expected ordinary module/);
});

for (const [name, value] of Object.entries({
  empty: [],
  notArray: {},
  duplicate: [control, control],
  unsafe: [{ ...control, id: 'bad.id' }],
  unknown: [{ ...control, caseId: 'unknown' }],
  filesType: [{ ...control, generatedFiles: [] }],
  fileContent: [{ ...control, generatedFiles: { x: 1 } }],
  response: [{ ...control, finalResponse: 2 }],
  expected: [{ ...control, expected: { other: 'fail' } }],
  status: [{ ...control, expected: { accurate: 'other' } }],
})) {
  test(`controls reject ${name}`, () => {
    // Given
    const cases = [{ id: 'basic', requirements }];

    // When
    const act = () => validateControls(value, cases);

    // Then
    assert.throws(act);
  });
}

test('valid control matches requirements independently of order', () => {
  // Given
  const cases = [{ id: 'basic', requirements }];

  // When
  const act = () => validateControls([control], cases);

  // Then
  assert.doesNotThrow(act);
});

test('hooks must export checkCase when checks.ts exists', async (t) => {
  // Given
  const valid = await temporary(t);
  const invalid = await temporary(t);
  const empty = await temporary(t);

  await put(valid, 'checks.ts', 'export function checkCase() {}');
  await put(invalid, 'checks.ts', 'export const other = 1;');

  // When
  const loaded = await loadDeterministicChecksFor(valid);
  const none = await loadDeterministicChecksFor(empty);
  const act = () => loadDeterministicChecksFor(invalid);

  // Then
  assert.equal(typeof loaded.checkCase, 'function');
  assert.equal(none, null);
  await assert.rejects(act, /checks.ts must export checkCase/);
});

test('loadJudgeTests returns null when absent and validated controls when present', async (t) => {
  // Given
  const empty = await temporary(t);
  const suite = await temporary(t);
  const cases = [{ id: 'basic', requirements }];

  await put(
    suite,
    'judge-tests.ts',
    `export const controls = [${JSON.stringify(control)}];`,
  );

  // When
  const none = await loadJudgeTests(empty, cases);
  const loaded = await loadJudgeTests(suite, cases);

  // Then
  assert.equal(none, null);
  assert.deepEqual(loaded, [control]);
});
