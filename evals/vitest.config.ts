import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 15000,
    silent: 'passed-only',
    coverage: {
      provider: 'v8',
      include: ['run.ts', 'lib/*.ts', 'skills/plan/checks.ts'],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
        perFile: true,
      },
    },
  },
});
