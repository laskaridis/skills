import type { RunOptions } from '../lib/types.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preflight } from '../lib/preflight.ts';
import { fakeCodex, put, temporary } from './helpers.ts';

async function environment(t: import('vitest').TestContext) {
  const root = await temporary(t);
  const bin = await fakeCodex(root);
  const oldPath = process.env.PATH;

  t.onTestFinished(() => {
    process.env.PATH = oldPath;
  });
  process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
  await put(root, 'skill/SKILL.md', '# Synthetic');
  await put(root, 'suite/cases/basic/fixtures/document.md', 'Old');
  await put(root, 'suite/cases/basic/prompt.md', 'Improve');
  await put(root, 'suite/cases/basic/expected.md', '- [accurate] Accurate');

  const options = {
    skillName: 'synthetic',
    skill: path.join(root, 'skill'),
  } as RunOptions;

  return { root, options, suite: path.join(root, 'suite') };
}

test('preflight resolves cases, baseline, and CLI version', async (t) => {
  // Given
  const { options, suite } = await environment(t);

  // When
  const result = await preflight(options, suite);

  // Then
  assert.deepEqual(
    result.definedCases.map((c) => c.id),
    ['basic'],
  );
  assert.equal(result.previous, null);
  assert.equal(result.cliVersion, 'fake-codex');
});

test('preflight rejects an unknown case ID', async (t) => {
  // Given
  const { options, suite } = await environment(t);

  options.case = 'missing';

  // When
  const act = () => preflight(options, suite);

  // Then
  await assert.rejects(act, /Unknown case ID: missing/);
});

test('preflight rejects an invalid hooks module', async (t) => {
  // Given
  const { options, suite } = await environment(t);

  await put(suite, 'checks.ts', 'export const other = 1;');

  // When
  const act = () => preflight(options, suite);

  // Then
  await assert.rejects(act, /checks.ts must export checkCase/);
});

test('preflight validates controls only when calibrating', async (t) => {
  // Given
  const { options, suite } = await environment(t);

  await put(suite, 'judge-tests.ts', 'export const controls = [];');

  // When
  const skipped = await preflight(options, suite);

  options.calibrate = true;

  const act = () => preflight(options, suite);

  // Then
  assert.equal(skipped.definedCases.length, 1);
  await assert.rejects(act, /nonempty controls array/);
});

test('preflight rejects a malformed baseline', async (t) => {
  // Given
  const { root, options, suite } = await environment(t);

  options.compare = await put(root, 'bad.json', '{}');

  // When
  const act = () => preflight(options, suite);

  // Then
  await assert.rejects(act, /Unsupported baseline format/);
});

test('preflight rejects a skill directory without SKILL.md', async (t) => {
  // Given
  const { root, options, suite } = await environment(t);

  await put(root, 'empty/other.md', '');
  options.skill = path.join(root, 'empty');

  // When
  const act = () => preflight(options, suite);

  // Then
  await assert.rejects(act);
});

test('preflight rejects when the Codex CLI is unavailable', async (t) => {
  // Given
  const { root, options, suite } = await environment(t);

  process.env.PATH = path.join(root, 'nothing');

  // When
  const act = () => preflight(options, suite);

  // Then
  await assert.rejects(act, /Codex CLI unavailable/);
});
