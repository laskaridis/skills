import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { temporary, put, EVALS } from './helpers.ts';
import { snapshot } from '../lib/utils.ts';
import { checkCase, checkStructure } from '../skills/plan/checks.ts';
import { degradedPlan, controls } from '../skills/plan/judge-tests.ts';
import { loadCases } from '../lib/cases.ts';
import { validateControls } from '../lib/loader.ts';

const SPEC = 'specs/seat-reservation.spec.md';

const DESIGN = 'specs/seat-reservation.design.md';

const PLAN = 'specs/seat-reservation.plan.json';

async function setup(t: import('vitest').TestContext) {
  const root = await temporary(t);

  await put(
    root,
    SPEC,
    await fs.readFile(
      path.join(EVALS, 'skills/plan/cases/complete/fixtures', SPEC),
    ),
  );
  const initial = await snapshot(root);

  await put(root, DESIGN, '# Design');
  const plan = degradedPlan();

  plan.tasks = [plan.tasks[0]];
  return { root, initial, plan };
}

async function check(
  root: string,
  initial: import('../lib/types.ts').Snapshot,
  plan: unknown,
) {
  await put(root, PLAN, JSON.stringify(plan));
  return checkStructure(root, initial);
}

test('plan controls satisfy structure while encoding deliberate semantic failures', async (t) => {
  // Given
  const { root, initial } = await setup(t);
  const cases = await loadCases(path.join(EVALS, 'skills/plan'), 'plan');

  // When
  const result = await check(root, initial, degradedPlan());
  const verdict = await checkCase({
    workspace: root,
    initialSnapshot: initial,
  });

  // Then
  assert.equal(result.status, 'pass');
  assert.equal(verdict.status, 'pass');

  assert.ok(degradedPlan().tasks[1].objective.includes('waitlist'));

  assert.doesNotThrow(() => validateControls(controls, cases));
});

const mutations: Record<string, (plan: any) => unknown> = {
  null: () => null,
  array: () => [],
  extra: (p) => ({ ...p, extra: true }),
  wrongSpec: (p) => ({ ...p, specification_document: '../outside' }),
  wrongDesign: (p) => ({ ...p, design_document: '/tmp/design' }),
  contextType: (p) => ({ ...p, context_documents: 'wrong' }),
  contextNull: (p) => ({ ...p, context_documents: [null] }),
  contextBad: (p) => ({
    ...p,
    context_documents: [{ path: SPEC, purpose: '' }],
  }),
  contextValid: (p) => ({
    ...p,
    context_documents: [{ path: SPEC, purpose: 'Context' }],
  }),
  tasksType: (p) => ({ ...p, tasks: {} }),
  tasksEmpty: (p) => ({ ...p, tasks: [] }),
  taskNull: (p) => ({ ...p, tasks: [null] }),
  taskExtra: (p) => ({ ...p, tasks: [{ ...p.tasks[0], extra: 1 }] }),
  taskId: (p) => ({ ...p, tasks: [{ ...p.tasks[0], id: '' }] }),
  taskNumber: (p) => ({ ...p, tasks: [{ ...p.tasks[0], id: 1 }] }),
  objective: (p) => ({ ...p, tasks: [{ ...p.tasks[0], objective: ' ' }] }),
  status: (p) => ({ ...p, tasks: [{ ...p.tasks[0], status: 'completed' }] }),
  constraints: (p) => ({
    ...p,
    tasks: [{ ...p.tasks[0], constraints: 'wrong' }],
  }),
  badElement: (p) => ({ ...p, tasks: [{ ...p.tasks[0], constraints: [0] }] }),
  completionEmpty: (p) => ({
    ...p,
    tasks: [{ ...p.tasks[0], completion_criteria: [] }],
  }),
  completionMissing: (p) => ({
    ...p,
    tasks: [{ ...p.tasks[0], completion_criteria: undefined }],
  }),
  noRefs: (p) => ({
    ...p,
    tasks: [
      { ...p.tasks[0], stories_enabled: [], acceptance_criteria_addressed: [] },
    ],
  }),
  badRefs: (p) => ({
    ...p,
    tasks: [
      {
        ...p.tasks[0],
        stories_enabled: 'wrong',
        acceptance_criteria_addressed: 'wrong',
      },
    ],
  }),
  unknownStory: (p) => ({
    ...p,
    tasks: [{ ...p.tasks[0], stories_enabled: ['US-999'] }],
  }),
  unknownCriterion: (p) => ({
    ...p,
    tasks: [{ ...p.tasks[0], acceptance_criteria_addressed: ['AC-999'] }],
  }),
  missingCoverage: (p) => ({
    ...p,
    tasks: [
      {
        ...p.tasks[0],
        acceptance_criteria_addressed:
          p.tasks[0].acceptance_criteria_addressed.slice(1),
      },
    ],
  }),
  depsType: (p) => ({ ...p, tasks: [{ ...p.tasks[0], dependencies: null }] }),
  unknownDep: (p) => ({
    ...p,
    tasks: [{ ...p.tasks[0], dependencies: ['MISSING'] }],
  }),
  self: (p) => ({
    ...p,
    tasks: [{ ...p.tasks[0], dependencies: ['TASK-001'] }],
  }),
  duplicate: (p) => ({ ...p, tasks: [p.tasks[0], p.tasks[0]] }),
  cycle: (p) => ({
    ...p,
    tasks: [
      { ...p.tasks[0], dependencies: ['TASK-002'] },
      { ...p.tasks[0], id: 'TASK-002', dependencies: ['TASK-001'] },
    ],
  }),
};

for (const [name, mutate] of Object.entries(mutations)) {
  test(`plan validator rejects ${name}`, async (t) => {
    // Given
    const { root, initial, plan } = await setup(t);
    const mutated = mutate(plan);

    // When
    const result = await check(root, initial, mutated);

    // Then
    assert.equal(result.status, 'fail');
  });
}

test('plan graph accepts shared prerequisites and criterion-only tasks', async (t) => {
  // Given
  const { root, initial, plan } = await setup(t);
  const first = { ...plan.tasks[0], stories_enabled: [] };

  plan.tasks = [
    first,
    { ...first, id: 'TASK-002', dependencies: ['TASK-001'] },
    { ...first, id: 'TASK-003', dependencies: ['TASK-001', 'TASK-002'] },
  ];

  // When
  const result = await check(root, initial, plan);

  // Then
  assert.equal(result.status, 'pass');
});

for (const [name, mutate] of [
  ['malformed JSON', (r) => put(r, PLAN, '{broken')],
  ['empty plan', (r) => put(r, PLAN, '')],
  ['empty design', (r) => put(r, DESIGN, ' ')],
  ['unexpected application code', (r) => put(r, 'app.js', 'code')],
  ['modified input', (r) => put(r, SPEC, 'Changed')],
  ['deleted input', (r) => fs.unlink(path.join(r, SPEC))],
  ['deleted design', (r) => fs.unlink(path.join(r, DESIGN))],
  [
    'plan symlink',
    async (r) => {
      await fs.unlink(path.join(r, PLAN));
      await fs.symlink(SPEC, path.join(r, PLAN));
    },
  ],
  [
    'design symlink',
    async (r) => {
      await fs.unlink(path.join(r, DESIGN));
      await fs.symlink('seat-reservation.spec.md', path.join(r, DESIGN));
    },
  ],
] as [string, (root: string) => Promise<unknown>][]) {
  test(`plan validator rejects ${name}`, async (t) => {
    // Given
    const { root, initial, plan } = await setup(t);

    await put(root, PLAN, JSON.stringify(plan));
    await mutate(root);

    // When
    const result = await checkStructure(root, initial);

    // Then
    assert.equal(result.status, 'fail');
  });
}

test('ambiguous case passes only when the workspace is left untouched', async (t) => {
  // Given
  const { root, initial } = await setup(t);
  const untouched = await temporary(t);

  await put(
    untouched,
    SPEC,
    await fs.readFile(
      path.join(EVALS, 'skills/plan/cases/complete/fixtures', SPEC),
    ),
  );

  // When
  const clean = await checkCase({
    caseId: 'ambiguous',
    workspace: untouched,
    initialSnapshot: initial,
  });
  const generated = await checkCase({
    caseId: 'ambiguous',
    workspace: root,
    initialSnapshot: initial,
  });

  await put(untouched, SPEC, 'Changed');
  const modified = await checkCase({
    caseId: 'ambiguous',
    workspace: untouched,
    initialSnapshot: initial,
  });

  // Then
  assert.equal(clean.status, 'pass');

  assert.equal(generated.status, 'fail');
  assert.deepEqual(generated.failures, [
    `Unexpected output before clarification: ${DESIGN}`,
  ]);

  assert.equal(modified.status, 'fail');
  assert.deepEqual(modified.failures, [`Input modified or deleted: ${SPEC}`]);
});
