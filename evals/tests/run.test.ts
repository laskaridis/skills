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
import { archiveInputs, buildRunResults, runSuite } from '../run.ts';
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

test('archiveInputs copies skill, grading, cases and suite files into the run directory', async (t) => {
  // Given
  const { source } = await suiteOnDisk(t);

  // When
  const archived = await archiveInputs(source);

  // Then
  assert.equal(archived.skill, path.join(source.directory, 'inputs/skill'));
  assert.equal(
    archived.grading,
    path.join(source.directory, 'inputs/evals/grading'),
  );
  assert.equal(
    archived.suite,
    path.join(source.directory, 'inputs/evals/skills/synthetic'),
  );

  for (const file of [
    path.join(archived.skill, 'SKILL.md'),
    path.join(archived.grading, 'rubric.md'),
    path.join(archived.suite, 'cases/a-first/prompt.md'),
    path.join(archived.suite, 'checks.ts'),
    path.join(archived.suite, 'README.md'),
  ]) {
    await fs.access(file);
  }

  await assert.rejects(fs.access(path.join(archived.suite, 'judge-tests.ts')));
});

test('archiveInputs rejects suite files that are not ordinary files', async (t) => {
  // Given
  const { source, suite, root } = await suiteOnDisk(t);

  await fs.rm(path.join(suite, 'README.md'));
  await put(root, 'elsewhere.md', 'Outside');
  await fs.symlink(
    path.join(root, 'elsewhere.md'),
    path.join(suite, 'README.md'),
  );

  // When
  const act = archiveInputs(source);

  // Then
  await assert.rejects(act, /Expected ordinary suite file/);
});

async function archivedRun(t: import('vitest').TestContext) {
  const disk = await suiteOnDisk(t);
  const archived = await archiveInputs(disk.source);
  const { options } = await fixture(t);
  const inputs = path.join(disk.source.directory, 'inputs');
  const runOptions: RunOptions = {
    ...options,
    skillName: 'synthetic',
    skill: archived.skill,
    grading: archived.grading,
    model: 'model-x',
    judgeModel: 'judge-x',
    case: 'a-first',
  };

  return {
    archived,
    build: () =>
      buildRunResults({
        options: runOptions,
        agent: getAgent('codex'),
        runId: 'run-1',
        cliVersion: 'cli-1',
        inputs,
      }),
  };
}

test('buildRunResults records identity, selection and settings of the run', async (t) => {
  // Given
  const { build } = await archivedRun(t);

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

test('buildRunResults hashes the skill apart from the other archived inputs', async (t) => {
  // Given
  const { build, archived } = await archivedRun(t);
  const before = await build();

  // When
  await put(archived.skill, 'SKILL.md', '# Changed skill');

  const afterSkillChange = await build();

  await put(archived.suite, 'cases/a-first/prompt.md', 'Changed prompt');

  const afterCaseChange = await build();

  // Then
  assert.notEqual(afterSkillChange.skill_hash, before.skill_hash);
  assert.equal(afterSkillChange.inputs_hash, before.inputs_hash);
  assert.notEqual(afterCaseChange.inputs_hash, afterSkillChange.inputs_hash);
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
