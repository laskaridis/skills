import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { Control } from '../lib/controls.ts';
import type { TransportCall } from './helpers.ts';
import type { CaseDefinition } from '../lib/cases.ts';
import type { RunResults } from '../lib/results.ts';
import { runSuite, type RunOptions } from '../run.ts';
import { fixture, fakeTransport } from './helpers.ts';

async function suiteRun(
  t: import('vitest').TestContext,
  config: Parameters<typeof fakeTransport>[0] = {},
  overrides: Partial<RunOptions> = {},
) {
  const { root, options, item } = await fixture(t);
  const calls: TransportCall[] = [];
  const cancellation = new AbortController();
  const results = { cases: [] } as unknown as RunResults;
  const persisted: number[] = [];
  const runOptions: RunOptions = {
    ...options,
    transport: fakeTransport(config, calls),
    signal: cancellation.signal,
    ...overrides,
  };

  return {
    root,
    calls,
    cancellation,
    results,
    persisted,
    cases: [item, { ...item, id: 'second' }],
    start: (cases: CaseDefinition[], controls: Control[] | null = null) =>
      runSuite({
        options: runOptions,
        runtime: root,
        directory: root,
        cases,
        controls,
        results,
        persist: async () => {
          persisted.push(results.cases.length);
        },
      }),
  };
}

test('runSuite runs only the selected case and persists after each one', async (t) => {
  // Given
  const run = await suiteRun(t, {}, { case: 'second' });
  const exitCode = process.exitCode;

  // When
  await run.start(run.cases);

  // Then
  assert.deepEqual(
    run.results.cases.map((c) => c.case),
    ['second'],
  );
  assert.deepEqual(run.persisted, [1, 1]);
  assert.equal(run.results.cancelled, undefined);
  assert.equal(process.exitCode, exitCode);
});

test('runSuite stops starting cases once the run is cancelled', async (t) => {
  // Given
  const cancellation = new AbortController();
  const run = await suiteRun(
    t,
    { onCall: () => cancellation.abort() },
    { signal: cancellation.signal, calibrate: true },
  );

  // When
  await run.start(run.cases, []);

  // Then
  assert.equal(run.results.cases.length, 1);
  assert.equal(run.results.cancelled, true);
  assert.equal(run.results.calibration, undefined);
  assert.equal(run.calls.length > 0, true);
});

test('runSuite runs every case when no cancellation signal is given', async (t) => {
  // Given
  const run = await suiteRun(t, {}, { signal: undefined });

  // When
  await run.start(run.cases);

  // Then
  assert.deepEqual(
    run.results.cases.map((c) => c.case),
    ['basic', 'second'],
  );
  assert.equal(run.results.cancelled, undefined);
});

test('runSuite calibrates after the cases unless the run was cancelled', async (t) => {
  // Given
  const control: Control = {
    id: 'bad-output',
    caseId: 'basic',
    generatedFiles: { 'document.md': 'Prepared' },
    finalResponse: 'Done',
    expected: { accurate: 'fail' },
  };
  const run = await suiteRun(t, { quality: 'fail' }, { calibrate: true });

  // When
  await run.start(run.cases, [control]);

  // Then
  assert.equal(run.results.calibration?.status, 'pass');
  assert.equal(run.results.calibration?.controls?.[0].case, 'basic');
});
