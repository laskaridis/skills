import { test } from 'vitest';
import assert from 'node:assert/strict';
import { put, temporary } from './helpers.ts';
import { loadDeterministicChecksFor } from '../lib/checks.ts';

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
