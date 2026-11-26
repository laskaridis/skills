import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { RunOptions } from '../run.ts';
import { buildRunResults, normalizeResults } from '../lib/results.ts';
import { TIMEOUT } from '../lib/execution.ts';
import { getAgent } from '../lib/agents.ts';
import { temporary, put, fixture } from './helpers.ts';

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
        repo: disk.root,
      }),
  };
}

test('buildRunResults records identity, selection and settings of the run', async (t) => {
  // Given
  const { build } = await liveRun(t);

  // When
  const results = await build();

  // Then
  assert.equal(results.format_version, 3);
  assert.equal(results.skill, 'synthetic');
  assert.equal(results.run_id, 'run-1');
  assert.deepEqual(results.selection, { case: 'a-first' });
  assert.deepEqual(results.cases, []);
  assert.equal(results.settings.agent, 'codex');
  assert.equal(results.settings.model, 'model-x');
  assert.equal(results.settings.judge_model, 'judge-x');
  assert.equal(results.settings.cli_version, 'cli-1');
  assert.equal(results.settings.runs_per_case, 1);
  assert.equal(results.settings.timeout_ms, TIMEOUT);
  assert.deepEqual(results.harness_git, { commit: null, dirty: null });
});

test('buildRunResults records the time limit set for the run', async (t) => {
  // Given
  const { build } = await liveRun(t, { timeout: 5000 });

  // When
  const results = await build();

  // Then
  assert.equal(results.settings.timeout_ms, 5000);
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

test('buildRunResults records that the suite checks ran', async (t) => {
  // Given
  const { build } = await liveRun(t);

  // When
  const results = await build();

  // Then
  assert.equal(results.settings.checks_mode, 'run');
});

test('buildRunResults records a no-checks run', async (t) => {
  // Given
  const { build } = await liveRun(t, { noChecks: true });

  // When
  const results = await build();

  // Then
  assert.equal(results.settings.checks_mode, 'skipped');
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

test('buildRunResults reflects judge control declaration and fixture changes', async (t) => {
  // Given
  const { build, suite } = await liveRun(t);
  const before = await build();

  // When
  await put(suite, 'judge-controls/controls.yml', 'version: 1');

  const afterDeclaration = await build();

  await put(
    suite,
    'judge-controls/fixtures/prepared/final-message.md',
    'Changed',
  );

  const afterFixture = await build();

  // Then
  assert.notEqual(afterDeclaration.inputs_hash, before.inputs_hash);
  assert.notEqual(afterFixture.inputs_hash, afterDeclaration.inputs_hash);
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

test('normalization returns current results unchanged', () => {
  // Given
  const current = { format_version: 3, skill: 'synthetic', cases: [] };

  // When
  const normalized = normalizeResults(current);

  // Then
  assert.equal(normalized, current);
});

for (const value of [
  null,
  {},
  { cases: [], format_version: 99 },
  { format_version: 2, skill: 'x', cases: [] },
  {
    format_version: 3,
    skill: 'x',
    cases: [{ case: 'c', execution: {}, checks: {}, judge: {} }],
  },
  { format_version: 3, cases: [] },
  { format_version: 3, skill: 'x', cases: [{}] },
  { format_version: 1, cases: [{}] },
]) {
  test(`unsupported results ${JSON.stringify(value)}`, () => {
    // When
    const act = () => normalizeResults(value);

    // Then
    assert.throws(act);
  });
}
