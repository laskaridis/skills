import type { TransportCall } from './helpers.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { fixture, fakeTransport, finding, requirements } from './helpers.ts';
import { validateJudge, unavailable, judge } from '../lib/judging.ts';

test('judge contract accepts each status with evidence', () => {
  // Given
  const statuses = ['pass', 'fail', 'ungradable'];

  // When
  const statusResults = statuses.map((status) =>
    validateJudge(finding(requirements, status), requirements),
  );
  const missing = unavailable(requirements, 'Missing');

  // Then
  assert.deepEqual(statusResults, [true, true, true]);
  assert.deepEqual(missing, [
    { ...requirements[0], status: 'ungradable', evidence: ['Missing'] },
  ]);
});

const valid = finding();

for (const [name, value] of Object.entries({
  null: null,
  empty: {},
  additionalKey: { ...valid, extra: true },
  legacyClarification: { ...valid, additional_clarification: false },
  findingsType: { ...valid, findings: {} },
  missing: { ...valid, findings: [] },
  unexpected: { ...valid, findings: [{ ...valid.findings[0], id: 'other' }] },
  duplicate: { ...valid, findings: [valid.findings[0], valid.findings[0]] },
  extraFindingKey: {
    ...valid,
    findings: [{ ...valid.findings[0], extra: true }],
  },
  invalidStatus: {
    ...valid,
    findings: [{ ...valid.findings[0], status: 'good' }],
  },
  evidenceType: {
    ...valid,
    findings: [{ ...valid.findings[0], evidence: 'evidence' }],
  },
  evidenceEmpty: {
    ...valid,
    findings: [{ ...valid.findings[0], evidence: [] }],
  },
  evidenceWhitespace: {
    ...valid,
    findings: [{ ...valid.findings[0], evidence: [' '] }],
  },
})) {
  test(`judge contract rejects ${name}`, () => {
    // When
    const result = validateJudge(value, requirements);

    // Then
    assert.equal(result, false);
  });
}

test('judge rejects duplicate IDs even when total findings length matches', () => {
  // Given
  const duplicated = {
    ...valid,
    findings: [valid.findings[0], valid.findings[0]],
  };
  const expanded = [...requirements, { id: 'another', text: 'Another' }];

  // When
  const result = validateJudge(duplicated, expanded);

  // Then
  assert.equal(result, false);
});

for (const [name, config, expected] of [
  ['valid', {}, 'ok'],
  ['malformed JSON', { rawJudge: 'not json' }, 'invalid_response'],
  ['invalid contract', { rawJudge: '{}' }, 'invalid_response'],
  ['timeout', { failAt: 'final', failure: 'timeout' }, 'timeout'],
  ['failed transport', { failAt: 'final' }, 'execution_error'],
  ['mutated inputs', { mutateJudge: true }, 'execution_error'],
] as [string, Record<string, any>, string][]) {
  test(`judge archives evidence and classifies ${name}`, async (t) => {
    // Given
    const { root, options } = await fixture(t);
    const calls: TransportCall[] = [];
    const directory = path.join(root, 'judge');

    // When
    const result = await judge(
      { ...options, transport: fakeTransport(config, calls) },
      root,
      directory,
      requirements,
      { stage: 'final' },
    );

    // Then
    assert.equal(result.status, expected);
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(directory, 'bundle.json'), 'utf8'))
        .requirements,
      requirements,
    );
    await assert.rejects(fs.access(calls[0].workspace));

    if (expected === 'ok') {
      assert.deepEqual(
        JSON.parse(
          await fs.readFile(path.join(directory, 'finding.json'), 'utf8'),
        ),
        valid,
      );
    }
  });
}

for (const name of ['transport', 'grading']) {
  test(`judge cleans workspace after ${name} throws`, async (t) => {
    // Given
    const { root, options } = await fixture(t);
    const calls: TransportCall[] = [];

    // When
    const result = judge(
      {
        ...options,
        grading: name === 'grading' ? root : options.grading,
        transport: fakeTransport({ throwAt: 'final' }, calls),
      },
      root,
      path.join(root, 'judge'),
      requirements,
      { stage: 'final' },
    );

    // Then
    await assert.rejects(result);

    if (calls.length) {
      await assert.rejects(fs.access(calls[0].workspace));
    }
  });
}

test('judge starts no model call once the run is cancelled', async (t) => {
  // Given
  const { root, options } = await fixture(t);
  const calls: TransportCall[] = [];
  const controller = new AbortController();

  controller.abort();

  // When
  const result = await judge(
    {
      ...options,
      signal: controller.signal,
      transport: fakeTransport({}, calls),
    },
    root,
    path.join(root, 'judge'),
    requirements,
    { stage: 'final' },
  );

  // Then
  assert.equal(result.status, 'cancelled');
  assert.equal(calls.length, 0);
});
