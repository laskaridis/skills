import type {
  CalibrationResult,
  CaseResult,
  Comparison,
  Execution,
  Finding,
  RunResults,
} from './types.ts';
import path from 'node:path';
import { styleText } from 'node:util';
import { infrastructureFailure } from './reporting.ts';

type Format = Parameters<typeof styleText>[0];

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const LABEL_WIDTH = 18;

// styleText drops the escape codes when the stream is not a TTY or NO_COLOR is set.
const paint = (format: Format, text: string) =>
  styleText(format, text, { stream: process.stdout });

const icons = {
  ok: () => paint('green', '✔'),
  fail: () => paint('red', '✖'),
  warn: () => paint('yellow', '⚠'),
  skip: () => paint('dim', '–'),
};

const dim = (text: string) => paint('dim', text);

const firstLine = (text: string) => text.split('\n')[0];

function formatDuration(ms: number) {
  const seconds = ms / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const whole = Math.round(seconds);

  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
}

function formatTokens(count: number) {
  if (count < 1000) {
    return String(count);
  }

  return count < 1_000_000
    ? `${(count / 1000).toFixed(1)}k`
    : `${(count / 1_000_000).toFixed(2)}M`;
}

// Raw CLI usage: Claude reports cache tokens separately from input_tokens, and
// resumed Codex sessions report cumulative totals, so take the last turn per
// execution instead of summing turns.
function tokensOf(execution: Execution | undefined) {
  const usages = Array.isArray(execution?.usage) ? execution.usage : [];
  const last = usages.filter((u) => u && typeof u === 'object').at(-1);

  if (!last) {
    return null;
  }

  const count = (key: string) =>
    typeof last[key] === 'number' ? (last[key] as number) : 0;

  return {
    input:
      count('input_tokens') +
      count('cache_creation_input_tokens') +
      count('cache_read_input_tokens'),
    output: count('output_tokens'),
  };
}

function tokenSummary(label: string, executions: (Execution | undefined)[]) {
  const counted = executions.map(tokensOf).filter((t) => t !== null);

  if (!counted.length) {
    return null;
  }

  const input = counted.reduce((sum, t) => sum + t.input, 0);
  const output = counted.reduce((sum, t) => sum + t.output, 0);

  return `${label} ${formatTokens(input)} in / ${formatTokens(output)} out`;
}

function heading(text: string) {
  console.log(`\n${paint('bold', text)}`);
}

function line(icon: string, label: string, detail = '', indent = 2) {
  return `${' '.repeat(indent)}${icon} ${label.padEnd(LABEL_WIDTH)} ${detail}`.trimEnd();
}

export function printHeader(
  results: Pick<RunResults, 'skill' | 'settings'>,
  directory: string,
) {
  const {
    agent,
    skill_mode,
    checks_mode,
    model,
    judge_model,
    judge_reasoning,
  } = results.settings;
  const baseline = skill_mode === 'none' ? ' · no skill' : '';
  const noChecks = checks_mode === 'skipped' ? ' · no checks' : '';

  console.log(
    `${paint(['bold', 'cyan'], '▶')} ${paint('bold', results.skill)}  ${agent ?? 'codex'} · ${model}${baseline}${noChecks}`,
  );
  console.log(dim(`  judge ${judge_model} · reasoning ${judge_reasoning}`));
  console.log(dim(`  artifacts  ${directory}`));
}

// On a TTY the label animates in place with the elapsed time; elsewhere nothing
// is printed, so logs and CI output only contain the lines printed afterwards.
// The spinner sits at column 0 under the same blank separator that `heading`
// prints. On stop the spinner line is erased and the cursor moves back onto the
// separator, so the heading that follows does not add a second blank line.
export async function busy<T>(
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!process.stdout.isTTY) {
    return work();
  }

  let frame = 0;
  const started = Date.now();
  const draw = () =>
    process.stdout.write(
      `\r\x1b[2K${paint('cyan', FRAMES[frame++ % FRAMES.length])} ${label} ${dim(formatDuration(Date.now() - started))}`,
    );
  const timer = setInterval(draw, 100);

  timer.unref();
  process.stdout.write('\n');
  draw();

  try {
    return await work();
  } finally {
    clearInterval(timer);
    process.stdout.write('\r\x1b[2K\x1b[1A');
  }
}

function requirementLines(requirements: Finding[]) {
  if (requirements.length === 0) {
    return [line(icons.skip(), 'requirements', 'none')];
  }

  const unavailable = requirements.every((r) => r.status === 'ungradable');
  const passed = requirements.filter((r) => r.status === 'pass').length;
  const lines = [
    line(
      unavailable
        ? icons.warn()
        : passed === requirements.length
          ? icons.ok()
          : icons.fail(),
      'requirements',
      unavailable ? 'ungradable' : `${passed}/${requirements.length}`,
    ),
  ];

  for (const requirement of requirements) {
    const icon =
      requirement.status === 'pass'
        ? icons.ok()
        : requirement.status === 'fail'
          ? icons.fail()
          : icons.warn();

    lines.push(`      ${icon} ${requirement.id}`);
  }

  return lines;
}

export function printCase(result: CaseResult) {
  const { execution, checks } = result;

  heading(result.case);

  if (execution.status !== 'not_run') {
    const durations = execution.calls
      .map((call) => call.duration_ms)
      .filter((ms): ms is number => typeof ms === 'number');
    const duration = durations.length
      ? formatDuration(durations.reduce((sum, ms) => sum + ms, 0))
      : '';

    if (execution.status === 'ok') {
      console.log(line(icons.ok(), 'executed', duration));
    } else {
      console.log(line(icons.fail(), 'executed', execution.status));
      console.log(line(icons.skip(), 'requirements', 'skipped'));
    }
  }

  if (execution.status === 'ok') {
    console.log(
      line(
        checks.status === 'pass'
          ? icons.ok()
          : checks.status === 'fail'
            ? icons.fail()
            : icons.skip(),
        'checks',
        checks.status,
      ),
    );

    for (const failure of checks.failures) {
      console.log(`      ${icons.fail()} ${firstLine(failure)}`);
    }

    for (const text of requirementLines(result.requirements)) {
      console.log(text);
    }
  }

  if (result.harness_error) {
    console.log(
      line(icons.fail(), 'harness error', firstLine(result.harness_error)),
    );
  }
}

export function printCalibration(calibration: CalibrationResult) {
  heading('calibration');

  if (calibration.status === 'unavailable') {
    console.log(
      line(icons.skip(), dim('unavailable'), dim(calibration.reason ?? '')),
    );
    return;
  }

  if (calibration.status === 'harness_error') {
    console.log(
      line(
        icons.fail(),
        'harness error',
        firstLine(calibration.reason ?? 'unknown error'),
      ),
    );
    return;
  }

  for (const control of calibration.controls ?? []) {
    const expected = Object.entries(control.expected);
    const mismatched = expected.filter(
      ([id, state]) =>
        control.judge.finding?.findings.find((f) => f.id === id)?.status !==
        state,
    ).length;

    if (control.status === 'pass') {
      console.log(
        line(
          icons.ok(),
          control.id,
          `judge agreed with all ${expected.length} expected verdicts`,
        ),
      );
    } else if (control.status === 'judge_error') {
      console.log(
        line(icons.fail(), control.id, `judge ${control.judge.status}`),
      );
    } else {
      console.log(
        line(
          icons.fail(),
          control.id,
          `judge disagreed on ${mismatched}/${expected.length} expected verdicts`,
        ),
      );
    }
  }
}

const arrows: Record<string, (text: string) => string> = {
  improvement: (text) => paint('green', `▲ ${text}`),
  regression: (text) => paint('red', `▼ ${text}`),
  availability_change: (text) => paint('yellow', `◆ ${text}`),
};

function comparisonLines(comparison: Comparison) {
  const lines: string[] = [];
  const changed = comparison.changes.filter((c) => c.direction !== 'unchanged');
  const cases = [...new Set(comparison.changes.map((c) => c.case))];

  for (const name of cases) {
    const own = changed.filter((c) => c.case === name);

    if (!own.length) {
      lines.push(line(dim('●'), name, dim('unchanged')));
      continue;
    }

    for (const change of own) {
      const what = change.requirement
        ? `${change.requirement}`
        : change.channel;
      const text = `${what} ${change.before} → ${change.after}`;

      lines.push(line(' ', name, arrows[change.direction](text)));
    }
  }

  const label = (items: string[]) => items.join(', ');
  const ids = (items: Comparison['added_requirements']) =>
    label(items.map((r) => `${r.case}/${r.id}`));

  if (comparison.removed_cases.length) {
    lines.push(
      `  ${paint('red', `▼ removed cases: ${label(comparison.removed_cases)}`)}`,
    );
  }

  if (comparison.removed_requirements.length) {
    lines.push(
      `  ${paint('red', `▼ removed requirements: ${ids(comparison.removed_requirements)}`)}`,
    );
  }

  if (comparison.added_cases.length) {
    lines.push(
      `  ${paint('green', `▲ added cases: ${label(comparison.added_cases)}`)}`,
    );
  }

  if (comparison.added_requirements.length) {
    lines.push(
      `  ${paint('green', `▲ added requirements: ${ids(comparison.added_requirements)}`)}`,
    );
  }

  if (comparison.excluded_cases.length) {
    lines.push(
      `  ${paint('yellow', `◆ excluded cases: ${label(comparison.excluded_cases)}`)}`,
    );
  }

  for (const limitation of comparison.limitations) {
    lines.push(`  ${icons.warn()} ${paint('yellow', limitation)}`);
  }

  return lines;
}

export function printSummary(
  results: RunResults,
  directory: string,
  elapsedMs: number,
) {
  let passed = 0;
  let failed = 0;
  let errored = 0;

  for (const c of results.cases) {
    if (
      c.checks.status === 'fail' ||
      c.requirements.some((r) => r.status === 'fail')
    ) {
      failed++;
    } else if (
      c.execution.status === 'ok' &&
      ['pass', 'skipped'].includes(c.checks.status) &&
      c.requirements.length > 0 &&
      c.requirements.every((r) => r.status === 'pass')
    ) {
      passed++;
    } else {
      errored++;
    }
  }

  const calibration = results.calibration;
  const calibrationBad =
    !!calibration &&
    calibration.status !== 'pass' &&
    calibration.status !== 'unavailable';
  const parts = [
    `${icons.ok()} ${passed} passed`,
    `${failed ? icons.fail() : dim('✖')} ${failed} failed`,
  ];

  if (errored > 0) {
    parts.push(`${icons.warn()} ${errored} errored`);
  }

  if (calibration && calibration.status !== 'unavailable') {
    parts.push(`calibration ${calibrationBad ? icons.fail() : icons.ok()}`);
  }

  parts.push(formatDuration(elapsedMs));

  const comparison = results.comparison
    ? comparisonLines(results.comparison)
    : [];

  if (comparison.length > 0) {
    heading('compared with baseline');

    for (const text of comparison) {
      console.log(text);
    }
  }

  const bad =
    failed > 0 ||
    errored > 0 ||
    calibrationBad ||
    infrastructureFailure(results);

  console.log(`\n${dim('─'.repeat(58))}`);
  console.log(
    `${paint(['bold', bad ? 'red' : 'green'], bad ? 'FAILED' : 'PASSED')}  ${parts.join(dim(' · '))}`,
  );
  const tokens = [
    tokenSummary(
      'agent',
      results.cases.flatMap((c) => c.execution.calls),
    ),
    tokenSummary('judge', [
      ...results.cases.map((c) => c.judge.execution),
      ...(results.calibration?.controls ?? []).map((c) => c.judge.execution),
    ]),
  ].filter((text) => text !== null);

  if (tokens.length) {
    console.log(dim(`  tokens  ${tokens.join(' · ')}`));
  }

  console.log(dim(`  report  ${path.join(directory, 'report.md')}`));
}
