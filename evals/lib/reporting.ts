import type {
  CaseResult,
  Comparison,
  ComparisonChange,
  RequirementChange,
  RunResults,
} from './types.ts';
import { object } from './utils.ts';

export function normalizeResults(value: unknown): RunResults {
  if (!object(value) || !Array.isArray(value.cases)) {
    throw new Error('Unsupported baseline format: missing cases');
  }

  if (value.format_version !== 2) {
    throw new Error(`Unsupported baseline format: ${value.format_version}`);
  }

  if (
    typeof value.skill !== 'string' ||
    value.cases.some(
      (c) =>
        typeof c.case !== 'string' ||
        !Array.isArray(c.requirements) ||
        !c.execution ||
        !c.checks ||
        !c.judge,
    )
  ) {
    throw new Error('Invalid version-2 results');
  }

  return value as RunResults;
}

const direction = (from: unknown, to: unknown) =>
  from === to
    ? 'unchanged'
    : from === 'fail' && to === 'pass'
      ? 'improvement'
      : from === 'pass' && to === 'fail'
        ? 'regression'
        : 'availability_change';

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

  // Results recorded before --agent existed were produced by Codex.
  const withAgent = (settings: RunResults['settings']) => ({
    agent: 'codex',
    ...settings,
  });

  if (
    withAgent(previous.settings).agent !== withAgent(current.settings).agent
  ) {
    limitations.push(
      `Agent differs (${withAgent(previous.settings).agent} vs ${withAgent(current.settings).agent}); results are not like-for-like`,
    );
  }

  if (
    JSON.stringify(withAgent(previous.settings)) !==
    JSON.stringify(withAgent(current.settings))
  ) {
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
        direction: direction(from, to),
      });
    }

    const oldIds = new Map(before.requirements.map((f) => [f.id, f]));
    const newIds = new Map(after.requirements.map((f) => [f.id, f]));

    for (const [id, finding] of newIds) {
      if (!oldIds.has(id)) {
        addedRequirements.push({ skill: current.skill, case: after.case, id });
        continue;
      }

      const old = oldIds.get(id)!;

      if (old.text !== finding.text) {
        limitations.push(
          `${caseKey}/${id}: requirement text changed or was unavailable`,
        );
      }

      changes.push({
        skill: current.skill,
        case: after.case,
        channel: 'requirement',
        requirement: id,
        before: old.status,
        after: finding.status,
        direction: direction(old.status, finding.status),
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

const cell = (value: unknown) =>
  String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

export function report(results: RunResults) {
  const lines = [
    `# ${results.skill} eval run`,
    '',
    `Run: ${results.run_id}`,
    '',
    `Agent: ${results.settings.model} (${results.settings.reasoning}); judge: ${results.settings.judge_model} (${results.settings.judge_reasoning}).`,
    `CLI: ${results.settings.agent ?? 'codex'} ${results.settings.cli_version}; Node: ${results.settings.node_version}.`,
    `Skill SHA-256: \`${results.skill_hash}\`.`,
    '',
    '| Case | Execution | Checks | Judge execution | Requirements |',
    '|---|---|---|---|---|',
  ];

  for (const item of results.cases) {
    lines.push(
      `| [${item.case}](${item.case}/result.json) | ${item.execution.status} | ${item.checks.status} | ${item.judge.status} | ${item.requirements.map((f) => `${f.id}: ${f.status}`).join('; ')} |`,
    );
  }

  for (const item of results.cases) {
    lines.push(
      '',
      `## ${item.case}`,
      '',
      `[Initial snapshot](${item.case}/initial-snapshot.json) · [Final workspace](${item.case}/workspace.manifest.json) · [Agent response](${item.case}/agent/final.txt)`,
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

    for (const f of item.requirements) {
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
          `- ${id}: expected ${expected}; observed ${control.judge.finding?.findings.find((f) => f.id === id)?.status ?? 'unavailable'}`,
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
          `| ${row.skill}/${row.case} | ${row.channel}${row.requirement ? ` / ${row.requirement}` : ''} | ${cell(row.before)} | ${cell(row.after)} | ${row.direction} |`,
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
