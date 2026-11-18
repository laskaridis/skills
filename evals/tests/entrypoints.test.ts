import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EVALS } from './helpers.ts';

for (const name of ['shared', 'plan']) {
  for (const args of [['--help'], ['--self-test']]) {
    test(`${name} entry point handles ${args[0]}`, async (t) => {
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
        path.join(EVALS, name === 'plan' ? 'plan/run.ts' : 'run.ts'),
        ...(name === 'shared' ? ['plan'] : []),
        ...args,
      ];
      vi.resetModules();

      // When
      if (name === 'plan') {
        await import('../plan/run.ts');
      } else {
        await import('../run.ts');
      }

      // Then
      assert.equal(process.exitCode, args[0] === '--help' ? oldExit : 2);
    });
  }

  test(`${name} import has no CLI effects when argv has no entry`, async (t) => {
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
      if (name === 'plan') {
        await import('../plan/run.ts');
      } else {
        await import('../run.ts');
      }
    };

    // Then
    await assert.doesNotReject(act);
  });
}
