import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  normalizeResults,
  compareResults,
  observedSettings,
  infrastructureFailure,
  report,
} from '../lib/reporting.ts';

export const one = (): any => ({
  case: 'basic',
  input_hash: 'same',
  execution: { status: 'ok', calls: [{}] },
  checks: { status: 'pass', failures: [] },
  judge: { status: 'ok' },
  requirements: [
    { id: 'works', text: 'Works', status: 'pass', evidence: ['output: works'] },
  ],
});

export const run = (): any => ({
  format_version: 2,
  skill: 'synthetic',
  run_id: 'id',
  settings: { model: 'agent', judge_model: 'judge' },
  cases: [one()],
});

test('normalization returns v2 results unchanged', () => {
  // Given
  const current = run();

  // When
  const normalized = normalizeResults(current);

  // Then
  assert.equal(normalized, current);
});

for (const value of [
  null,
  {},
  { cases: [], format_version: 99 },
  { format_version: 2, cases: [] },
  { format_version: 2, skill: 'x', cases: [{}] },
  { format_version: 1, cases: [{}] },
]) {
  test(`unsupported results ${JSON.stringify(value)}`, () => {
    // When
    const act = () => normalizeResults(value);

    // Then
    assert.throws(act);
  });
}

for (const [from, to, direction] of [
  ['pass', 'pass', 'unchanged'],
  ['pass', 'fail', 'regression'],
  ['fail', 'pass', 'improvement'],
  ['pass', 'ungradable', 'availability_change'],
]) {
  test(`comparison ${from} to ${to}`, () => {
    // Given
    const before = run();
    const after = run();

    before.cases[0].requirements[0].status = from;
    after.cases[0].requirements[0].status = to;

    // When
    const comparison = compareResults(before, after);
    const change = comparison.changes.find((c) => c.requirement === 'works');

    // Then
    assert.equal(change!.direction, direction);
  });
}

test('comparison identifies additions, removals and changed experiment inputs', () => {
  // Given
  const before = run();
  const after = run();

  before.inputs_hash = 'old';
  after.inputs_hash = 'new';
  after.skill_hash = 'changed';
  after.settings.model = 'other';
  after.observed_settings = { available: true };
  after.cases[0].input_hash = 'changed';
  after.cases[0].requirements[0].text = 'Changed';
  after.cases[0].requirements.push({ id: 'new', status: 'pass' });
  after.cases.push({ ...one(), case: 'added' });
  before.cases.push({ ...one(), case: 'removed' });

  // When
  const c = compareResults(before, after);
  const inverse = compareResults(after, before);

  // Then
  assert.deepEqual(c.added_cases, ['synthetic/added']);
  assert.deepEqual(c.removed_cases, ['synthetic/removed']);
  assert.equal(c.added_requirements.length, 1);
  assert.ok(c.limitations.some((x) => x.includes('case inputs')));
  assert.ok(c.limitations.some((x) => x.includes('requirement text')));
  assert.ok(c.limitations.some((x) => x.includes('Observed')));
  assert.ok(c.limitations.some((x) => x.includes('Runtime')));

  assert.equal(inverse.removed_requirements.length, 1);
});

test('comparison excludes cases outside the selection', () => {
  // Given
  const before = run();
  const after = run();

  before.cases.push({ ...one(), case: 'removed' });
  after.selection = { case: 'basic' };
  before.selection = { case: 'basic' };

  // When
  const c = compareResults(before, after);

  // Then
  assert.deepEqual(c.excluded_cases, ['synthetic/removed']);
  assert.equal(c.removed_cases.length, 0);
});

test('comparison reports differing skills', () => {
  // Given
  const before = run();
  const after = run();

  after.skill = 'other';

  // When
  const c = compareResults(before, after);

  // Then
  assert.ok(c.limitations.some((x) => x.includes('Skills differ')));
});

test('observations preserve missing contexts and all available invocation contexts', () => {
  // Given
  const missing = run();
  const value = run();

  value.cases[0].execution.calls[0].observed_settings = { model: 'a' };
  value.cases[0].judge.execution = { observed_settings: { model: 'c' } };

  // When
  const absent = observedSettings(missing);
  const observed = observedSettings(value);

  // Then
  assert.equal(absent.basic.agent[0], null);

  assert.equal(observed.basic.quality_judge!.model, 'c');
});

for (const [field, status] of [
  ['execution', 'timeout'],
  ['checks', 'error'],
  ['judge', 'invalid_response'],
  ['harness_error', 'broken'],
  ['calibration', 'judge_error'],
  ['calibration', 'harness_error'],
]) {
  test(`infrastructure classification for ${field} ${status}`, () => {
    // Given
    const value = run();

    if (field === 'harness_error') {
      value.cases[0].harness_error = status;
    } else if (field === 'calibration') {
      value.calibration = { status };
    } else {
      value.cases[0][field].status = status;
    }

    // When
    const failed = infrastructureFailure(value);

    // Then
    assert.equal(failed, true);
  });
}

test('quality failures, absent judges and disagreements are successful experiments', () => {
  // Given
  const value = run();

  value.cases[0].checks.status = 'fail';
  value.cases[0].judge.status = 'not_run';
  value.cases[0].requirements[0].status = 'fail';
  value.calibration = { status: 'grader_disagreement' };

  // When
  const failed = infrastructureFailure(value);

  // Then
  assert.equal(failed, false);
});

test('reports include relevant evidence links and escape comparison cells', () => {
  // Given
  const value = run();
  const c = value.cases[0];

  c.execution.calls.push({ status: 'ok' });
  c.execution.error = 'Execution error';
  c.harness_error = 'Harness error';
  c.checks.failures = ['Check failed'];

  value.calibration = {
    status: 'grader_disagreement',
    reason: 'Reason',
    controls: [
      {
        id: 'control',
        status: 'grader_disagreement',
        expected: { works: 'pass' },
        judge: { finding: { findings: [{ id: 'works', status: 'fail' }] } },
      },
      {
        id: 'missing',
        status: 'judge_error',
        expected: { works: 'pass' },
        judge: {},
      },
    ],
  };

  value.comparison = {
    changes: [
      {
        skill: 'x',
        case: 'basic',
        channel: 'requirement',
        requirement: 'works',
        before: 'a|b\nc',
        after: 'fail',
        direction: 'regression',
      },
      {
        skill: 'x',
        case: 'basic',
        channel: 'execution',
        before: 'ok',
        after: 'timeout',
        direction: 'availability_change',
      },
    ],
    limitations: ['Limited'],
    added_cases: ['x/added'],
    removed_cases: [],
    excluded_cases: [],
    added_requirements: [{ skill: 'x', case: 'basic', id: 'works' }],
    removed_requirements: [],
  };

  // When
  const text = report(value);

  // Then
  for (const expected of [
    'agent/final.txt',
    'Judge bundle',
    'Check failed',
    'expected pass; observed fail',
    'observed unavailable',
    'a\\|b c',
    'added_cases: x/added',
    'x/basic/works',
    'Limitation: Limited',
  ]) {
    assert.ok(text.includes(expected), expected);
  }
});

test('reports do not link an initial snapshot', () => {
  // Given
  const value = run();

  // When
  const text = report(value);

  // Then
  assert.ok(!text.includes('Initial snapshot'));
  assert.ok(!text.includes('initial-snapshot.json'));
  assert.ok(text.includes('Final workspace'));
});

test('reports omit judge links when the judge was not run', () => {
  // Given
  const value = run();

  value.cases[0].judge.status = 'not_run';

  // When
  const plain = report(value);

  // Then
  assert.ok(plain.includes('agent/final.txt'));
  assert.ok(!plain.includes('Judge bundle'));
});

test('comparison reports differing agents and treats missing agents as codex', () => {
  // Given
  const before = run();
  const legacy = run();
  const after = run();

  before.settings.agent = 'codex';
  after.settings.agent = 'claude';

  // When
  const differing = compareResults(before, after);
  const same = compareResults(legacy, before);

  // Then
  assert.ok(differing.limitations.some((x) => x.includes('Agent differs')));
  assert.ok(!same.limitations.some((x) => x.includes('Agent differs')));
});

test('reports flag cancelled runs as partial', () => {
  // Given
  const value = run();
  const plain = report(run());

  value.cancelled = true;

  // When
  const text = report(value);

  // Then
  assert.ok(text.includes('Cancelled by SIGINT/SIGTERM'));
  assert.ok(!plain.includes('Cancelled'));
});

const clean = (
  commit: string | null = 'aaaaaaa1111111',
  dirty = false,
): any => ({
  commit,
  dirty,
});

const harnessLimitations = (previous: any, current: any) => {
  const before = run();
  const after = run();

  before.harness_git = previous;
  after.harness_git = current;

  return compareResults(before, after).limitations.filter((x) =>
    x.startsWith('Harness'),
  );
};

test('comparison accepts the same clean harness commit', () => {
  // When
  const limitations = harnessLimitations(clean(), clean());

  // Then
  assert.deepEqual(limitations, []);
});

test('comparison reports differing harness commits', () => {
  // When
  const limitations = harnessLimitations(clean(), clean('bbbbbbb2222222'));

  // Then
  assert.equal(limitations.length, 1);
  assert.ok(limitations[0].includes('commits differ (aaaaaaa vs bbbbbbb)'));
});

for (const [side, previous, current] of [
  ['baseline', clean('aaaaaaa1111111', true), clean()],
  ['current', clean(), clean('aaaaaaa1111111', true)],
  ['baseline and current', clean('aaaaaaa1111111', true), clean('b', true)],
] as const) {
  test(`comparison reports a dirty harness for ${side}`, () => {
    // When
    const limitations = harnessLimitations(previous, current);

    // Then
    assert.equal(limitations.length, 1);
    assert.ok(limitations[0].includes(`dirty for the ${side} run`));
  });
}

for (const [side, previous, current] of [
  ['baseline', clean(null, null as any), clean()],
  ['current', clean(), clean('aaaaaaa1111111', null as any)],
  ['baseline and current', clean(null, null as any), clean(null, null as any)],
  ['baseline', undefined, clean()],
  ['current', clean(), undefined],
  ['baseline and current', undefined, undefined],
] as const) {
  test(`comparison reports an unknown harness revision for ${side}`, () => {
    // When
    const limitations = harnessLimitations(previous, current);

    // Then
    assert.equal(limitations.length, 1);
    assert.ok(limitations[0].includes(`unknown for the ${side} run`));
  });
}
