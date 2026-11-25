import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { TransportCall } from './helpers.ts';
import type {
  CaseDefinition,
  Control,
  RunOptions,
  RunResults,
} from '../lib/types.ts';
import { buildRunResults, runSuite } from '../run.ts';
import { getAgent } from '../lib/agents.ts';
import { temporary, put, fixture, fakeTransport } from './helpers.ts';

async function suiteOnDisk(t: import('vitest').TestContext) {
  const root = await temporary(t);
  const suite = path.join(root, 'evals/skills/synthetic');

  await put(root, 'skill/SKILL.md', '# Synthetic');
  await put(root, 'grading/rubric.md', 'Rubric');
  await put(suite, 'cases/a-first/prompt.md', 'Improve');
  await put(suite, 'checks.ts', 'export const checkCase = () => {};');
  await put(suite, 'README.md', 'Suite');

  return {
    root,
    suite,
    source: {
      skill: path.join(root, 'skill'),
      skillName: 'synthetic',
      suite,
      grading: path.join(root, 'grading'),
      directory: path.join(root, 'run'),
    },
  };
}

async function liveRun(
  t: import('vitest').TestContext,
  overrides: Partial<RunOptions> = {},
) {
  const disk = await suiteOnDisk(t);
  const { options } = await fixture(t);
  const runOptions: RunOptions = {
    ...options,
    skillName: 'synthetic',
    skill: path.join(disk.root, 'skill'),
    grading: path.join(disk.root, 'grading'),
    model: 'model-x',
    judgeModel: 'judge-x',
    case: 'a-first',
    ...overrides,
  };

  return {
    ...disk,
    build: () =>
      buildRunResults({
        options: runOptions,
        agent: getAgent('codex'),
        runId: 'run-1',
        cliVersion: 'cli-1',
        suite: disk.suite,
      }),
  };
}

test('buildRunResults records identity, selection and settings of the run', async (t) => {
  // Given
  const { build } = await liveRun(t);

  // When
  const results = await build();

  // Then
  assert.equal(results.format_version, 2);
  assert.equal(results.skill, 'synthetic');
  assert.equal(results.run_id, 'run-1');
  assert.deepEqual(results.selection, { case: 'a-first' });
  assert.deepEqual(results.cases, []);
  assert.equal(results.settings.agent, 'codex');
  assert.equal(results.settings.model, 'model-x');
  assert.equal(results.settings.judge_model, 'judge-x');
  assert.equal(results.settings.cli_version, 'cli-1');
  assert.equal(results.settings.runs_per_case, 1);
});

test('buildRunResults records that the skill was installed', async (t) => {
  // Given
  const { build } = await liveRun(t);

  // When
  const results = await build();

  // Then
  assert.equal(results.settings.skill_mode, 'installed');
  assert.match(results.skill_hash!, /^[0-9a-f]{64}$/);
});

test('buildRunResults records a no-skill run without hashing a skill', async (t) => {
  // Given
  const { build } = await liveRun(t, { skill: '', noSkill: true });

  // When
  const results = await build();

  // Then
  assert.equal(results.settings.skill_mode, 'none');
  assert.equal(results.skill_hash, 'none');
});

test('buildRunResults hashes the skill apart from the other inputs', async (t) => {
  // Given
  const { build, root, suite } = await liveRun(t);
  const before = await build();

  // When
  await put(root, 'skill/SKILL.md', '# Changed skill');

  const afterSkillChange = await build();

  await put(suite, 'cases/a-first/prompt.md', 'Changed prompt');

  const afterCaseChange = await build();

  // Then
  assert.notEqual(afterSkillChange.skill_hash, before.skill_hash);
  assert.equal(afterSkillChange.inputs_hash, before.inputs_hash);
  assert.notEqual(afterCaseChange.inputs_hash, afterSkillChange.inputs_hash);
  assert.equal(afterCaseChange.skill_hash, afterSkillChange.skill_hash);
});

test('buildRunResults is stable and reflects grading and suite file changes', async (t) => {
  // Given
  const { build, root, suite } = await liveRun(t);
  const before = await build();
  const again = await build();

  // When
  await put(root, 'grading/rubric.md', 'Changed rubric');

  const afterGradingChange = await build();

  await put(suite, 'checks.ts', 'export const checkCase = () => 1;');

  const afterChecksChange = await build();

  // Then
  assert.equal(again.inputs_hash, before.inputs_hash);
  assert.equal(again.skill_hash, before.skill_hash);
  assert.notEqual(afterGradingChange.inputs_hash, before.inputs_hash);
  assert.notEqual(
    afterChecksChange.inputs_hash,
    afterGradingChange.inputs_hash,
  );
});

test('buildRunResults ignores run artifacts stored in the suite', async (t) => {
  // Given
  const { build, suite } = await liveRun(t);
  const before = await build();

  // When
  await put(suite, 'artifacts/old-run/results.json', '{}');

  const after = await build();

  // Then
  assert.equal(after.inputs_hash, before.inputs_hash);
});

test('buildRunResults rejects suite files that are not ordinary files', async (t) => {
  // Given
  const { build, suite, root } = await liveRun(t);

  await fs.rm(path.join(suite, 'README.md'));
  await put(root, 'elsewhere.md', 'Outside');
  await fs.symlink(
    path.join(root, 'elsewhere.md'),
    path.join(suite, 'README.md'),
  );

  // When
  const act = build();

  // Then
  await assert.rejects(act, /Expected ordinary suite file/);
});

test('buildRunResults rejects non-regular files in the inputs it hashes', async (t) => {
  // Given
  const { build, suite, root } = await liveRun(t);

  await put(root, 'elsewhere.md', 'Outside');
  await fs.symlink(
    path.join(root, 'elsewhere.md'),
    path.join(suite, 'cases/a-first/link.md'),
  );

  // When
  const act = build();

  // Then
  await assert.rejects(act, /Non-regular input file/);
});

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
