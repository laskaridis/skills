import { afterEach, beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import {
  busy,
  printCalibration,
  printCase,
  printHeader,
  printSummary,
} from '../lib/ui.ts';

const ESCAPE = String.fromCharCode(27);

// Erase the spinner line, then move up onto the blank separator line.
const STOP = `\r${ESCAPE}[2K${ESCAPE}[1A`;

const saved: { isTTY: boolean | undefined; force?: string; no?: string } = {
  isTTY: undefined,
};

const setTTY = (value: boolean) => {
  process.stdout.isTTY = value;
};

beforeEach(() => {
  saved.isTTY = process.stdout.isTTY;
  saved.force = process.env.FORCE_COLOR;
  saved.no = process.env.NO_COLOR;
  setTTY(false);
  delete process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.stdout.isTTY = saved.isTTY as boolean;

  if (saved.force === undefined) {
    delete process.env.FORCE_COLOR;
  } else {
    process.env.FORCE_COLOR = saved.force;
  }

  if (saved.no === undefined) {
    delete process.env.NO_COLOR;
  } else {
    process.env.NO_COLOR = saved.no;
  }
});

const capture = () => {
  const lines: string[] = [];

  vi.spyOn(console, 'log').mockImplementation((line) => {
    lines.push(String(line));
  });

  return lines;
};

const finding = (id: string, state: 'pass' | 'fail' | 'ungradable'): any => ({
  id,
  status: state,
  evidence: [],
});

const caseResult = (
  execution: string,
  checks: string,
  requirements: any[],
  extra: any = {},
): any => ({
  case: 'one',
  execution: { status: execution, calls: [] },
  checks: { status: checks, failures: [] },
  judge: { status: 'ok' },
  requirements,
  ...extra,
});

const emptyComparison = (): any => ({
  limitations: [],
  changes: [],
  added_cases: [],
  removed_cases: [],
  excluded_cases: [],
  added_requirements: [],
  removed_requirements: [],
});

const control = (
  id: string,
  status: string,
  judge: any,
  expected: any,
): any => ({
  id,
  case: 'one',
  expected,
  judge,
  status,
});

test('printHeader shows skill, agent, model, judge and artifacts', () => {
  // Given
  const lines = capture();
  const results: any = {
    skill: 'plan',
    settings: {
      agent: 'claude',
      model: 'opus',
      judge_model: 'sonnet',
      judge_reasoning: 'high',
    },
  };

  // When
  printHeader(results, '/tmp/run');

  // Then
  assert.equal(lines.length, 3);
  assert.match(lines[0], /▶ plan\s+claude · opus/);
  assert.match(lines[1], /judge sonnet · reasoning high/);
  assert.match(lines[2], /artifacts\s+\/tmp\/run/);
});

test('busy returns the value of the work and prints nothing off a TTY', async () => {
  // Given
  const lines = capture();
  const write = vi.spyOn(process.stdout, 'write');

  // When
  const value = await busy('executing', async () => 42);

  // Then
  assert.equal(value, 42);
  assert.deepEqual(lines, []);
  assert.equal(write.mock.calls.length, 0);
});

test('busy rethrows errors from the work and prints nothing off a TTY', async () => {
  // Given
  const lines = capture();

  // When
  const outcome = busy('executing', async () => {
    throw new Error('boom');
  });

  // Then
  await assert.rejects(outcome, /boom/);
  assert.deepEqual(lines, []);
});

test('busy animates on a TTY and clears the line when the work throws', async () => {
  // Given
  setTTY(true);

  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

  // When
  const outcome = busy('executing', async () => {
    throw new Error('boom');
  });

  // Then
  await assert.rejects(outcome, /boom/);

  const written = write.mock.calls.map((call) => String(call[0]));

  assert.ok(written.some((text) => text.includes('executing')));
  assert.ok(written.some((text) => text.includes('0.0s')));
  assert.equal(written.at(-1), STOP);
});

test('busy returns the value on a TTY and clears the line', async () => {
  // Given
  setTTY(true);

  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

  // When
  const value = await busy('judging', async () => 'done');

  // Then
  assert.equal(value, 'done');
  assert.equal(String(write.mock.calls.at(-1)?.[0]), STOP);
});

test('busy draws the spinner at column 0 under the heading separator and hands back to heading', async () => {
  // Given
  setTTY(true);

  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

  // When
  await busy('complete', async () => 'done');

  // Then
  const written = write.mock.calls.map((call) => String(call[0]));
  const spinner = written.find((text) => text.includes('complete')) as string;

  assert.equal(written[0], '\n');
  assert.ok(spinner.startsWith(`\r${ESCAPE}[2K`));
  assert.ok(!spinner.slice(`\r${ESCAPE}[2K`.length).startsWith(' '));
  assert.match(spinner, /complete/);
  assert.equal(written.at(-1), STOP);
});

test('printCase shows the case, duration, checks and requirements', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', [finding('a', 'pass')]);

  result.execution.calls = [{ duration_ms: 18456 }];

  // When
  printCase(result);

  // Then
  assert.ok(lines[0].includes('one'));
  assert.match(lines[1], /✔ executed\s+18\.5s/);
  assert.match(lines[2], /✔ checks\s+pass/);
  assert.match(lines[3], /✔ requirements\s+1\/1/);
  assert.match(lines[4], /✔ a/);
});

test('printCase sums call durations and formats minutes', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', [finding('a', 'pass')]);

  result.execution.calls = [{ duration_ms: 60000 }, { duration_ms: 41000 }];

  // When
  printCase(result);

  // Then
  assert.match(lines[1], /✔ executed\s+1m 41s/);
});

test('printCase pads minutes under ten seconds', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', [finding('a', 'pass')]);

  result.execution.calls = [{ duration_ms: 65000 }];

  // When
  printCase(result);

  // Then
  assert.match(lines[1], /✔ executed\s+1m 05s/);
});

test('printCase tolerates calls without a duration', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', [finding('a', 'pass')]);

  // When
  printCase(result);

  // Then
  assert.equal(lines[1], '  ✔ executed');
});

test('printCase reports a failed execution and skips requirements', () => {
  // Given
  const lines = capture();
  const result = caseResult('timeout', 'not_run', []);

  // When
  printCase(result);

  // Then
  assert.match(lines[1], /✖ executed\s+timeout/);
  assert.match(lines[2], /– requirements\s+skipped/);
  assert.equal(lines.length, 3);
});

test('printCase lists the first line of each check failure', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'fail', [finding('a', 'pass')]);

  result.checks.failures = ['missing file\nmore detail', 'bad heading'];

  // When
  printCase(result);

  // Then
  assert.match(lines[2], /✖ checks\s+fail/);
  assert.match(lines[3], /✖ missing file$/);
  assert.match(lines[4], /✖ bad heading$/);
});

test('printCase lists each requirement and the pass count', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', [
    finding('a', 'pass'),
    finding('b', 'fail'),
  ]);

  // When
  printCase(result);

  // Then
  assert.match(lines[3], /✖ requirements\s+1\/2/);
  assert.match(lines[4], /✔ a/);
  assert.match(lines[5], /✖ b/);
});

test('printCase reports ungradable requirements as a warning', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', [finding('a', 'ungradable')]);

  // When
  printCase(result);

  // Then
  assert.match(lines[3], /⚠ requirements\s+ungradable/);
  assert.match(lines[4], /⚠ a/);
});

test('printCase handles an empty requirement list', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', []);

  // When
  printCase(result);

  // Then
  assert.match(lines[3], /– requirements\s+none/);
});

test('printCase shows the first line of a harness error', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'pass', [finding('a', 'pass')], {
    harness_error: 'Error: kaput\n    at somewhere',
  });

  // When
  printCase(result);

  // Then
  assert.match(lines.at(-1) as string, /✖ harness error\s+Error: kaput$/);
  assert.ok(lines.every((line) => !line.includes('somewhere')));
});

test('printCase shows only the harness error when nothing ran', () => {
  // Given
  const lines = capture();
  const result = caseResult('not_run', 'not_run', [], {
    harness_error: 'Error: setup failed',
  });

  // When
  printCase(result);

  // Then
  assert.equal(lines.length, 2);
  assert.match(lines[1], /✖ harness error\s+Error: setup failed/);
});

test('printCalibration reports agreement for passing controls', () => {
  // Given
  const lines = capture();
  const calibration: any = {
    status: 'pass',
    controls: [
      control(
        'good',
        'pass',
        { status: 'ok', finding: { findings: [finding('a', 'pass')] } },
        { a: 'pass' },
      ),
    ],
  };

  // When
  printCalibration(calibration);

  // Then
  assert.ok(lines[0].includes('calibration'));
  assert.match(lines[1], /✔ good\s+judge agreed with all 1 expected verdicts/);
});

test('printCalibration reports a judge error with its status', () => {
  // Given
  const lines = capture();
  const calibration: any = {
    status: 'judge_error',
    controls: [
      control('broken', 'judge_error', { status: 'timeout' }, { a: 'pass' }),
    ],
  };

  // When
  printCalibration(calibration);

  // Then
  assert.match(lines[1], /✖ broken\s+judge timeout/);
});

test('printCalibration counts mismatched and missing verdicts on disagreement', () => {
  // Given
  const lines = capture();
  const calibration: any = {
    status: 'grader_disagreement',
    controls: [
      control(
        'bad',
        'grader_disagreement',
        {
          status: 'ok',
          finding: { findings: [finding('a', 'fail'), finding('b', 'pass')] },
        },
        { a: 'pass', b: 'pass', c: 'fail' },
      ),
    ],
  };

  // When
  printCalibration(calibration);

  // Then
  assert.match(lines[1], /✖ bad\s+judge disagreed on 2\/3 expected verdicts/);
});

test('printCalibration prints one line with the reason when unavailable', () => {
  // Given
  const lines = capture();
  const calibration: any = { status: 'unavailable', reason: 'no controls' };

  // When
  printCalibration(calibration);

  // Then
  assert.equal(lines.length, 2);
  assert.match(lines[1], /– unavailable\s+no controls/);
});

test('printCalibration shows the first line of a harness error', () => {
  // Given
  const lines = capture();
  const calibration: any = {
    status: 'harness_error',
    reason: 'Error: nope\n    at somewhere',
  };

  // When
  printCalibration(calibration);

  // Then
  assert.equal(lines.length, 2);
  assert.match(lines[1], /✖ harness error\s+Error: nope$/);
});

test('printSummary reports PASSED with the report path and no escape codes off a TTY', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.every((line) => !line.includes(ESCAPE)));
  assert.ok(lines.some((line) => line.includes('PASSED')));
  assert.ok(lines.some((line) => line.includes('1 passed')));
  assert.ok(lines.some((line) => line.includes('5.0s')));
  assert.ok(lines.some((line) => /report\s+\/tmp\/run\/report\.md/.test(line)));
});

test('printSummary totals agent and judge tokens, taking the last usage per execution', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [
      caseResult('ok', 'pass', [finding('a', 'pass')], {
        execution: {
          status: 'ok',
          calls: [
            {
              usage: [
                { input_tokens: 1, output_tokens: 1 },
                {
                  input_tokens: 4,
                  cache_creation_input_tokens: 1000,
                  cache_read_input_tokens: 500,
                  output_tokens: 1800,
                },
              ],
            },
          ],
        },
        judge: {
          status: 'ok',
          execution: { usage: [{ input_tokens: 2000, output_tokens: 200 }] },
        },
      }),
    ],
    calibration: {
      status: 'pass',
      controls: [
        {
          id: 'c',
          case: 'one',
          expected: {},
          status: 'pass',
          judge: {
            status: 'ok',
            execution: { usage: [{ input_tokens: 1000, output_tokens: 300 }] },
          },
        },
      ],
    },
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(
    lines.some((line) =>
      /tokens\s+agent 1\.5k in \/ 1\.8k out · judge 3\.0k in \/ 500 out/.test(
        line,
      ),
    ),
  );
});

test('printSummary omits the token line when no usage was reported', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.every((line) => !line.includes('tokens')));
});

test('printSummary reports failure when a requirement fails', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'fail')])],
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => line.includes('FAILED')));
  assert.ok(lines.some((line) => line.includes('1 failed')));
});

test('printSummary counts errored cases and reports FAILED', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [
      caseResult('ok', 'pass', [finding('a', 'pass')]),
      caseResult('execution_error', 'pass', [finding('a', 'ungradable')]),
    ],
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => line.includes('FAILED')));
  assert.ok(lines.some((line) => line.includes('1 passed')));
  assert.ok(lines.some((line) => line.includes('0 failed')));
  assert.ok(lines.some((line) => line.includes('1 errored')));
});

test('printSummary omits the errored count when there are none', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.every((line) => !line.includes('errored')));
});

test('printSummary does not report PASSED when calibration disagrees', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
    calibration: { status: 'grader_disagreement' },
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => line.includes('FAILED')));
  assert.ok(lines.every((line) => !line.includes('PASSED')));
});

test('printSummary reports FAILED on an infrastructure failure', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
    calibration: { status: 'harness_error' },
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => line.includes('FAILED')));
});

test('printSummary marks calibration as passing', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
    calibration: { status: 'pass' },
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => line.includes('calibration ✔')));
  assert.ok(lines.some((line) => line.includes('PASSED')));
});

test('printSummary skips the baseline section when the comparison is empty', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
    comparison: emptyComparison(),
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.every((line) => !line.includes('compared with baseline')));
});

test('printSummary marks regressions, improvements, and limitations', () => {
  // Given
  const lines = capture();
  const comparison = emptyComparison();

  comparison.limitations = ['inputs_hash differs'];
  comparison.changes = [
    {
      case: 'one',
      channel: 'requirement',
      requirement: 'r',
      before: 'pass',
      after: 'fail',
      direction: 'regression',
    },
    {
      case: 'two',
      channel: 'checks',
      before: 'fail',
      after: 'pass',
      direction: 'improvement',
    },
    {
      case: 'three',
      channel: 'checks',
      before: 'pass',
      after: 'pass',
      direction: 'unchanged',
    },
  ];

  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
    comparison,
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => line.includes('compared with baseline')));
  assert.ok(lines.some((line) => /one\s+▼ r pass → fail/.test(line)));
  assert.ok(lines.some((line) => /two\s+▲ checks fail → pass/.test(line)));
  assert.ok(lines.some((line) => /three\s+unchanged/.test(line)));
  assert.ok(lines.some((line) => /⚠ inputs_hash differs/.test(line)));
});

test('printSummary lists added, removed, and excluded cases and requirements', () => {
  // Given
  const lines = capture();
  const comparison = emptyComparison();

  comparison.added_cases = ['new-case'];
  comparison.removed_cases = ['old-case'];
  comparison.excluded_cases = ['skipped-case'];
  comparison.added_requirements = [{ skill: 's', case: 'c', id: 'fresh' }];
  comparison.removed_requirements = [{ skill: 's', case: 'c', id: 'gone' }];

  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
    comparison,
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => /removed cases: old-case/.test(line)));
  assert.ok(lines.some((line) => /removed requirements: c\/gone/.test(line)));
  assert.ok(lines.some((line) => /added cases: new-case/.test(line)));
  assert.ok(lines.some((line) => /added requirements: c\/fresh/.test(line)));
  assert.ok(lines.some((line) => /excluded cases: skipped-case/.test(line)));
});

test('printHeader defaults the agent to codex', () => {
  // Given
  const lines = capture();
  const results: any = {
    skill: 'plan',
    settings: { model: 'gpt', judge_model: 'sonnet', judge_reasoning: 'low' },
  };

  // When
  printHeader(results, '/tmp/run');

  // Then
  assert.match(lines[0], /▶ plan\s+codex · gpt/);
});

test('printSummary formats token counts in millions', () => {
  // Given
  const lines = capture();
  const results: any = {
    cases: [
      caseResult('ok', 'pass', [finding('a', 'pass')], {
        execution: {
          status: 'ok',
          calls: [{ usage: [{ input_tokens: 2_500_000, output_tokens: 10 }] }],
        },
      }),
    ],
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(lines.some((line) => /agent 2\.50M in \/ 10 out/.test(line)));
});

test('printCase marks checks that did not run with a skip icon', () => {
  // Given
  const lines = capture();
  const result = caseResult('ok', 'not_run', [finding('a', 'pass')]);

  // When
  printCase(result);

  // Then
  assert.match(lines[2], /– checks\s+not_run/);
});

test('printCalibration falls back when the reason is missing', () => {
  // Given
  const lines = capture();

  // When
  printCalibration({ status: 'unavailable' } as any);

  // Then
  assert.match(lines[1], /– unavailable$/);
});

test('printCalibration names an unknown harness error when no reason is given', () => {
  // Given
  const lines = capture();

  // When
  printCalibration({ status: 'harness_error' } as any);

  // Then
  assert.match(lines[1], /✖ harness error\s+unknown error$/);
});

test('printCalibration prints only the heading when there are no controls', () => {
  // Given
  const lines = capture();

  // When
  printCalibration({ status: 'pass' } as any);

  // Then
  assert.equal(lines.length, 1);
});

test('printSummary marks availability changes in the baseline comparison', () => {
  // Given
  const lines = capture();
  const comparison = emptyComparison();

  comparison.changes = [
    {
      case: 'one',
      channel: 'checks',
      before: 'pass',
      after: 'unavailable',
      direction: 'availability_change',
    },
  ];

  const results: any = {
    cases: [caseResult('ok', 'pass', [finding('a', 'pass')])],
    comparison,
  };

  // When
  printSummary(results, '/tmp/run', 5000);

  // Then
  assert.ok(
    lines.some((line) => /one\s+◆ checks pass → unavailable/.test(line)),
  );
});
