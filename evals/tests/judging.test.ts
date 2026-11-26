import type { TransportCall } from './helpers.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { fixture, fakeTransport, finding, requirements } from './helpers.ts';
import { judge } from '../lib/judging.ts';

const valid = finding();

// Runs judge() against a fake transport that replies with `reply` verbatim.
async function _judgeReply(
  t: Parameters<typeof fixture>[0],
  reply: unknown,
  graded = requirements,
) {
  const { root, options } = await fixture(t);
  const transport = fakeTransport({ rawJudge: JSON.stringify(reply) }, []);

  return judge(
    { ...options, transport },
    root,
    path.join(root, 'judge'),
    graded,
    { stage: 'final' },
  );
}

for (const status of ['pass', 'fail', 'ungradable']) {
  test(`judge contract accepts ${status} with evidence`, async (t) => {
    // Given
    const reply = finding(requirements, status);

    // When
    const result = await _judgeReply(t, reply);

    // Then
    assert.equal(result.status, 'ok');
  });
}

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
  test(`judge contract rejects ${name}`, async (t) => {
    // When
    const result = await _judgeReply(t, value);

    // Then
    assert.equal(result.status, 'invalid_response');
  });
}

test('judge rejects duplicate IDs even when total findings length matches', async (t) => {
  // Given
  const duplicated = {
    ...valid,
    findings: [valid.findings[0], valid.findings[0]],
  };
  const expanded = [...requirements, { id: 'another', text: 'Another' }];

  // When
  const result = await _judgeReply(t, duplicated, expanded);

  // Then
  assert.equal(result.status, 'invalid_response');
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
    await assert.rejects(fs.access(path.join(directory, 'schema.json')));
    await assert.rejects(fs.access(path.join(directory, 'rubric.md')));

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

test('judge workspace holds the grading files and the bundle', async (t) => {
  // Given
  const { root, options } = await fixture(t);
  const calls: TransportCall[] = [];
  const seen: Record<string, string> = {};
  const transport = fakeTransport(
    {
      onCall: async ({ workspace }) => {
        for (const file of ['rubric.md', 'schema.json', 'bundle.json']) {
          seen[file] = await fs.readFile(path.join(workspace, file), 'utf8');
        }
      },
    },
    calls,
  );
  const rubric = await fs.readFile(
    path.join(options.grading, 'rubric.md'),
    'utf8',
  );
  const schema = await fs.readFile(
    path.join(options.grading, 'quality.schema.json'),
    'utf8',
  );

  // When
  const result = await judge(
    { ...options, transport },
    root,
    path.join(root, 'judge'),
    requirements,
    { stage: 'final' },
  );

  // Then
  assert.equal(result.status, 'ok');
  assert.equal(seen['rubric.md'], rubric);
  assert.equal(seen['schema.json'], schema);
  assert.deepEqual(JSON.parse(seen['bundle.json']).requirements, requirements);
  assert.equal(
    calls[0].mode.schema,
    path.join(calls[0].workspace, 'schema.json'),
  );
});

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
