import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EVALS } from './helpers.ts';

for (const args of [['--help'], ['--self-test']]) {
  test(`entry point handles ${args[0]}`, async (t) => {
    // Given
    const oldArgs = process.argv;
    const oldExit = process.exitCode;

    t.onTestFinished(() => {
      process.argv = oldArgs;
      process.exitCode = oldExit;
      vi.resetModules();
    });
    process.argv = [
      process.execPath,
      path.join(EVALS, 'run.ts'),
      'plan',
      ...args,
    ];
    vi.resetModules();

    // When
    await import('../run.ts');

    // Then
    assert.equal(process.exitCode, args[0] === '--help' ? oldExit : 2);
  });
}

test('import has no CLI effects when argv has no entry', async (t) => {
  // Given
  const oldArgs = process.argv;

  t.onTestFinished(() => {
    process.argv = oldArgs;
    vi.resetModules();
  });
  process.argv = [];
  vi.resetModules();

  // When
  const act = async () => {
    await import('../run.ts');
  };

  // Then
  await assert.doesNotReject(act);
});
