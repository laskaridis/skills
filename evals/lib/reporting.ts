/**
 * Interprets the results of an eval run, without running or grading anything.
 *
 * Responsibilities:
 * - compare a run with a baseline and flag what limits the comparison
 * - summarize the CLI settings observed during the run
 * - tell infrastructure failures apart from quality failures
 * - render the run as a Markdown report
 *
 * @module
 */

import type { CaseResult } from './run-case.ts';
import { normalizeResults, type RunResults } from './results.ts';

/** One requirement or channel outcome that differs between baseline and current run. */
export interface ComparisonChange {
  skill: string;
  case: string;
  channel: string;
  requirement?: string;
  before: unknown;
  after: unknown;
  direction: string;
}

/** Identifies a requirement added or removed between two runs. */
export interface RequirementChange {
  skill: string;
  case: string;
  id: string;
}

/** Differences between a baseline run and the current run; `limitations` lists caveats that weaken the comparison. */
export interface Comparison {
  limitations: string[];
  changes: ComparisonChange[];
  added_cases: string[];
  removed_cases: string[];
  excluded_cases: string[];
  added_requirements: RequirementChange[];
  removed_requirements: RequirementChange[];
}

/**
 * Compares a baseline run with the current run, matching cases by `skill/case`.
 *
 * @param previousValue Baseline results (parsed `results.json` from `--compare`).
 * @param currentValue Results of the current run.
 * @returns Status changes per channel and requirement; added, removed and
 *   excluded cases and requirements; and limitations where the runs are not
 *   like-for-like.
 * @throws If either value is not valid version-2 results.
 */
export function compareResults(
  previousValue: unknown,
  currentValue: unknown,
): Comparison {
  const previous = normalizeResults(previousValue);
  const current = normalizeResults(currentValue);
  const limitations: string[] = [];
  const changes: ComparisonChange[] = [];
  const addedCases: string[] = [];
  const removedCases: string[] = [];
  const addedRequirements: RequirementChange[] = [];
  const removedRequirements: RequirementChange[] = [];
  const excludedCases: string[] = [];

  for (const key of ['inputs_hash', 'skill_hash'] as const) {
    if (previous[key] !== current[key]) {
      limitations.push(`${key} differs`);
    }
  }

  const harness = _harnessLimitation(previous.harness_git, current.harness_git);

  if (harness) {
    limitations.push(harness);
  }

  // Results recorded before --agent, --no-skill and --no-checks existed were
  // produced by Codex with the skill installed and the checks run.
  const withDefaults = (settings: RunResults['settings']) => ({
    agent: 'codex',
    skill_mode: 'installed',
    checks_mode: 'run',
    ...settings,
  });
  const previousSettings = withDefaults(previous.settings);
  const currentSettings = withDefaults(current.settings);

  if (previousSettings.agent !== currentSettings.agent) {
    limitations.push(
      `Agent differs (${previousSettings.agent} vs ${currentSettings.agent}); results are not like-for-like`,
    );
  }

  if (previousSettings.skill_mode !== currentSettings.skill_mode) {
    const sides =
      previousSettings.skill_mode === 'none'
        ? 'baseline ran without the skill, current ran with it'
        : 'baseline ran with the skill, current ran without it';

    limitations.push(
      `With/without-skill comparison: ${sides}; changes reflect the skill's presence, not an edit to it`,
    );
  }

  if (previousSettings.checks_mode !== currentSettings.checks_mode) {
    const side =
      previousSettings.checks_mode === 'skipped' ? 'baseline' : 'current';

    limitations.push(
      `Checks were skipped in the ${side} run; checks changes are not comparable`,
    );
  }

  if (JSON.stringify(previousSettings) !== JSON.stringify(currentSettings)) {
    limitations.push('Runtime settings differ');
  }

  if (
    JSON.stringify(previous.observed_settings) !==
    JSON.stringify(current.observed_settings)
  ) {
    limitations.push('Observed CLI settings or their availability differ');
  }

  if (previous.skill !== current.skill) {
    limitations.push(
      `Skills differ: ${previous.skill} versus ${current.skill}; cases are not matched across skills`,
    );
  }

  if (current.selection?.case) {
    limitations.push(
      `Current run selected only case ${current.selection.case}; other baseline cases are excluded, not removed`,
    );
  }

  if (previous.selection?.case) {
    limitations.push(
      `Baseline selected only case ${previous.selection.case}; baseline case availability is partial`,
    );
  }

  const key = (run: RunResults, c: CaseResult) => `${run.skill}/${c.case}`;
  const oldCases = new Map(previous.cases.map((c) => [key(previous, c), c]));
  const newCases = new Map(current.cases.map((c) => [key(current, c), c]));

  for (const [caseKey, after] of newCases) {
    const before = oldCases.get(caseKey);

    if (!before) {
      addedCases.push(caseKey);
      continue;
    }

    if (
      before.input_hash !== after.input_hash &&
      before.input_hash !== undefined &&
      after.input_hash !== undefined
    ) {
      limitations.push(`${caseKey}: case inputs differ`);
    }

    for (const channel of ['execution', 'checks', 'judge'] as const) {
      const from = before[channel].status;
      const to = after[channel].status;

      changes.push({
        skill: current.skill,
        case: after.case,
        channel,
        before: from,
        after: to,
        direction: _direction(from, to),
      });
    }

    // Without verdicts from both sides, the judge channel already shows why.
    if (before.judge.status !== 'ok' || after.judge.status !== 'ok') {
      continue;
    }

    const oldIds = new Map(before.judge.verdicts.map((v) => [v.id, v]));
    const newIds = new Map(after.judge.verdicts.map((v) => [v.id, v]));

    for (const [id, verdict] of newIds) {
      if (!oldIds.has(id)) {
        addedRequirements.push({ skill: current.skill, case: after.case, id });
        continue;
      }

      const old = oldIds.get(id)!;

      changes.push({
        skill: current.skill,
        case: after.case,
        channel: 'requirement',
        requirement: id,
        before: old.status,
        after: verdict.status,
        direction: _direction(old.status, verdict.status),
      });
    }

    for (const id of oldIds.keys()) {
      if (!newIds.has(id)) {
        removedRequirements.push({
          skill: current.skill,
          case: after.case,
          id,
        });
      }
    }
  }

  for (const caseKey of oldCases.keys()) {
    if (!newCases.has(caseKey)) {
      if (current.selection?.case && previous.skill === current.skill) {
        excludedCases.push(caseKey);
      } else {
        removedCases.push(caseKey);
      }
    }
  }

  return {
    limitations,
    changes,
    added_cases: addedCases,
    removed_cases: removedCases,
    added_requirements: addedRequirements,
    removed_requirements: removedRequirements,
    excluded_cases: excludedCases,
  };
}

/**
 * Collects the CLI settings observed for each case's agent calls and quality
 * judge, keyed by case ID. Unavailable settings are null.
 */
export function observedSettings(results: Pick<RunResults, 'cases'>) {
  return Object.fromEntries(
    results.cases.map((item) => [
      item.case,
      {
        agent: item.execution.calls.map(
          (call) => call.observed_settings ?? null,
        ),
        quality_judge: item.judge.execution?.observed_settings ?? null,
      },
    ]),
  );
}

/**
 * Returns true if the run failed to execute or grade. Quality failures and grader
 * disagreements do not count.
 */
export function infrastructureFailure(
  results: Pick<RunResults, 'cases' | 'calibration'>,
) {
  return (
    results.cases.some(
      (c) =>
        c.harness_error ||
        !['ok'].includes(c.execution.status) ||
        c.checks.status === 'error' ||
        !['ok', 'not_run'].includes(c.judge.status),
    ) ||
    results.calibration?.status === 'judge_error' ||
    results.calibration?.status === 'harness_error'
  );
}

/**
 * Renders the run as a Markdown report. Its links are relative, so save it in the
 * run's output directory.
 */
export function report(results: RunResults) {
  const lines = [
    `# ${results.skill} eval run`,
    '',
    `Run: ${results.run_id}`,
    '',
    ...(results.cancelled
      ? ['**Cancelled by SIGINT/SIGTERM; results are partial.**', '']
      : []),
    `Agent: ${results.settings.model} (${results.settings.reasoning}); judge: ${results.settings.judge_model} (${results.settings.judge_reasoning}).`,
    `CLI: ${results.settings.agent ?? 'codex'} ${results.settings.cli_version}; Node: ${results.settings.node_version}.`,
    results.settings.skill_mode === 'none'
      ? 'Skill: none (baseline run, skill not installed or invoked).'
      : `Skill SHA-256: \`${results.skill_hash}\`.`,
    ...(results.settings.checks_mode === 'skipped'
      ? ['Checks: skipped (--no-checks).']
      : []),
    '',
    '| Case | Execution | Checks | Judge execution | Requirements |',
    '|---|---|---|---|---|',
  ];

  for (const item of results.cases) {
    lines.push(
      `| [${item.case}](${item.case}/result.json) | ${item.execution.status} | ${item.checks.status} | ${item.judge.status} | ${item.judge.verdicts.map((f) => `${f.id}: ${f.status}`).join('; ')} |`,
    );
  }

  for (const item of results.cases) {
    lines.push(
      '',
      `## ${item.case}`,
      '',
      `[Final workspace](${item.case}/workspace.manifest.json) · [Agent response](${item.case}/agent/final.txt)`,
    );

    for (const call of item.execution.calls) {
      lines.push(
        '',
        `Agent: ${call.status}. [Execution](${item.case}/agent/execution.json) · [Trace](${item.case}/agent/trace.jsonl) · [stderr](${item.case}/agent/stderr.txt)`,
      );
    }

    if (item.judge.status !== 'not_run') {
      lines.push(
        '',
        `[Judge bundle](${item.case}/judge-quality/bundle.json) · [Judge response](${item.case}/judge-quality/final.txt) · [Judge execution](${item.case}/judge-quality/execution.json) · [Judge stderr](${item.case}/judge-quality/stderr.txt)`,
      );
    }

    for (const message of [item.harness_error, item.execution.error]) {
      if (message) {
        lines.push('', message);
      }
    }

    for (const failure of item.checks.failures) {
      lines.push('', `- Check: ${failure}`);
    }

    for (const f of item.judge.verdicts) {
      lines.push(
        '',
        `**${f.id}: ${f.status}**`,
        '',
        ...f.evidence.map((e) => `- ${e}`),
      );
    }
  }

  if (results.calibration) {
    lines.push(
      '',
      '## Judge calibration',
      '',
      `Status: ${results.calibration.status}.`,
    );

    if (results.calibration.reason) {
      lines.push('', results.calibration.reason);
    }

    for (const control of results.calibration.controls ?? []) {
      lines.push(
        '',
        `### ${control.id}: ${control.status}`,
        '',
        `[Evidence](calibration/${control.id}/bundle.json)`,
      );

      for (const [id, expected] of Object.entries(control.expected)) {
        lines.push(
          `- ${id}: expected ${expected}; observed ${control.judge.verdicts.find((f) => f.id === id)?.status ?? 'unavailable'}`,
        );
      }
    }
  }

  if (results.comparison) {
    const c = results.comparison;

    lines.push(
      '',
      '## Baseline comparison',
      '',
      '| Case | Channel / requirement | Previous | Current | Change |',
      '|---|---|---|---|---|',
      ...c.changes.map(
        (row) =>
          `| ${row.skill}/${row.case} | ${row.channel}${row.requirement ? ` / ${row.requirement}` : ''} | ${_cell(row.before)} | ${_cell(row.after)} | ${row.direction} |`,
      ),
    );

    for (const key of [
      'added_cases',
      'removed_cases',
      'excluded_cases',
      'added_requirements',
      'removed_requirements',
    ] as const) {
      for (const value of c[key]) {
        lines.push(
          '',
          `- ${key}: ${typeof value === 'string' ? value : `${value.skill}/${value.case}/${value.id}`}`,
        );
      }
    }

    lines.push('', ...c.limitations.map((l) => `- Limitation: ${l}`));
  }

  lines.push(
    '',
    'A completed experiment can contain quality failures or grader disagreements. Infrastructure failures use exit code 2. One run per case is exploratory; repeat before trusting marginal changes. No aggregate score or release gate.',
    '',
  );
  return lines.join('\n');
}

function _direction(from: unknown, to: unknown) {
  if (from === to) {
    return 'unchanged';
  }

  if (from === 'fail' && to === 'pass') {
    return 'improvement';
  }

  return from === 'pass' && to === 'fail'
    ? 'regression'
    : 'availability_change';
}

type HarnessGit = NonNullable<RunResults['harness_git']>;

function _harnessSides(
  previous: HarnessGit | undefined,
  current: HarnessGit | undefined,
  predicate: (git: HarnessGit | undefined) => boolean,
) {
  const sides = [
    predicate(previous) ? 'baseline' : '',
    predicate(current) ? 'current' : '',
  ].filter(Boolean);

  return sides.join(' and ');
}

function _harnessLimitation(
  previous: HarnessGit | undefined,
  current: HarnessGit | undefined,
) {
  const unknown = _harnessSides(
    previous,
    current,
    (git) => !git || !git.commit || git.dirty === null,
  );

  if (unknown) {
    return `Harness revision is unknown for the ${unknown} run; harness changes cannot be ruled out`;
  }

  const dirty = _harnessSides(previous, current, (git) => git!.dirty === true);

  if (dirty) {
    return `Harness working tree was dirty for the ${dirty} run; the recorded commit does not identify the harness code, so harness changes cannot be ruled out`;
  }

  if (previous!.commit !== current!.commit) {
    return `Harness commits differ (${previous!.commit!.slice(0, 7)} vs ${current!.commit!.slice(0, 7)}); changes to execution, evidence or comparison code may affect results`;
  }

  return undefined;
}

function _cell(value: unknown) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}
