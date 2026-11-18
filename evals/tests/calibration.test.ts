import type { TransportCall } from './helpers.ts';
import type { Control } from '../lib/types.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fixture, fakeTransport } from './helpers.ts';
import { calibrate } from '../lib/calibration.ts';

const control: Control = {
  id: 'bad-output',
  caseId: 'basic',
  generatedFiles: { 'document.md': 'Prepared' },
  finalResponse: 'Done',
  expected: { accurate: 'fail' },
};

for (const [name, config, status] of [
  ['pass', { quality: 'fail' }, 'pass'],
  ['disagreement', {}, 'grader_disagreement'],
  ['judge error', { failAt: 'calibration' }, 'judge_error'],
  ['throw', { throwAt: 'calibration', noStack: true }, 'harness_error'],
] as [string, Record<string, any>, string][]) {
  test(`calibration ${name} reuses judge without agent calls`, async (t) => {
    // Given
    const { root, options, item } = await fixture(t);
    const calls: TransportCall[] = [];

    // When
    const result = await calibrate(
      { ...options, transport: fakeTransport(config, calls) },
      root,
      root,
      [item],
      [control],
    );

    // Then
    assert.equal(result.status, status);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mode.judge, true);
    assert.equal(calls[0].bundle.workspace_files['document.md'], 'Prepared');
  });
}

test('missing controls are unavailable; failing setup retains previous controls', async (t) => {
  // Given
  const { root, options, item } = await fixture(t);

  // When
  const missing = await calibrate(options, root, root, [item], null);
  const result = await calibrate(
    { ...options, transport: fakeTransport({ quality: 'fail' }) },
    root,
    root,
    [item],
    [control, { ...control, id: 'next', caseId: 'missing' }],
  );

  // Then
  assert.equal(missing.status, 'unavailable');
  assert.equal(result.status, 'harness_error');
  assert.equal(result.controls!.length, 1);
});

test('judge errors take precedence over disagreements across controls', async (t) => {
  // Given
  const { root, options, item } = await fixture(t);
  const calls: TransportCall[] = [];

  // When
  const result = await calibrate(
    {
      ...options,
      transport: fakeTransport(
        {
          onCall: ({ directory }) => {
            if (directory.endsWith('next')) {
              throw new Error('broken');
            }
          },
        },
        calls,
      ),
    },
    root,
    root,
    [item],
    [control, { ...control, id: 'next' }],
  );

  // Then
  assert.equal(result.status, 'harness_error');
  assert.equal(result.controls![0].status, 'grader_disagreement');
});
