import { test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { temporary, put, EVALS } from './helpers.ts';
import { snapshot } from '../lib/utils.ts';
import { loadCases } from '../lib/cases.ts';
import { validateControls } from '../lib/loader.ts';
import { checkCase, SPEC } from '../skills/specify/checks.ts';
import { controls, goldenSpec, specimens } from '../skills/specify/judge-tests.ts';

const SUITE = path.join(EVALS, 'skills/specify');

async function setup(t: import('vitest').TestContext) {
  const root = await temporary(t);
  const fixture = await fs.readFile(
    path.join(SUITE, 'cases/complete/fixtures/README.md'),
    'utf8',
  );

  await put(root, 'README.md', fixture);
  return { root, initial: await snapshot(root) };
}

test('specify case and all calibration controls are valid', async () => {
  const cases = await loadCases(SUITE, 'specify');

  assert.deepEqual(cases.map((item) => item.id), ['complete']);
  assert.match(cases[0].prompt, /replacing that earlier decision/);
  assert.match(cases[0].prompt, /signed-in member dashboard/);
  assert.match(cases[0].prompt, /Email confirmations and reminders/);
  assert.deepEqual(
    cases[0].requirements.map((item) => item.id),
    [
      'completeness',
      'verifiable_stories',
      'vertical_stories',
      'superseded_decisions',
      'out_of_scope',
      'captured_assumptions',
    ],
  );
  assert.doesNotThrow(() => validateControls(controls, cases));
  assert.equal(controls.length, 7);
});

test('calibration cases contain a gold spec and deliberate independent defects', () => {
  assert.equal(controls[0].generatedFiles[SPEC], goldenSpec);
  assert.ok(controls.every((control) => control.generatedFiles[SPEC]));
  assert.deepEqual(
    controls[0].expected,
    Object.fromEntries(
      Object.keys(controls[0].expected).map((id) => [id, 'pass']),
    ),
  );
  assert.equal(
    controls.slice(1).every((control) =>
      Object.values(control.expected).includes('fail'),
    ),
    true,
  );
  assert.ok(!specimens.omitted_cancellation.includes('### US-003:'));
  assert.match(specimens.vague_criteria, /handles their request correctly/);
  assert.match(specimens.horizontal_story, /only schema and storage changes/);
  assert.match(specimens.obsolete_waitlist, /placed on the waitlist/);
  assert.match(specimens.invented_email, /### US-004: Email/);
  assert.match(specimens.missing_assumption, /## Assumptions\n\nNone/);
  assert.notEqual(specimens.complete, specimens.missing_assumption);
});

test('valid output passes the exact path check', async (t) => {
  const { root, initial } = await setup(t);

  await put(root, SPEC, goldenSpec);
  const result = await checkCase({
    workspace: root,
    initialSnapshot: initial,
    caseId: 'complete',
    finalResponse: '',
  });

  assert.deepEqual(result, { status: 'pass', failures: [] });
});

const invalidOutput = [
  ['missing spec', async (_root: string) => {}],
  ['wrong folder', (root: string) => put(root, 'docs/workshop-rsvp.spec.md', goldenSpec)],
  ['wrong filename', (root: string) => put(root, 'specs/rsvp.spec.md', goldenSpec)],
  ['empty spec', (root: string) => put(root, SPEC, '  \n')],
  ['extra output', async (root: string) => {
    await put(root, SPEC, goldenSpec);
    await put(root, 'src/Unrequested.ts', 'export {};');
  }],
  ['modified fixture', async (root: string) => {
    await put(root, SPEC, goldenSpec);
    await put(root, 'README.md', 'Modified');
  }],
  ['symlink spec', async (root: string) => {
    await fs.mkdir(path.join(root, 'specs'), { recursive: true });
    await fs.symlink('../README.md', path.join(root, SPEC));
  }],
] as const;

for (const [name, mutate] of invalidOutput) {
  test('specify validator rejects ' + name, async (t) => {
    const { root, initial } = await setup(t);

    await mutate(root);
    const result = await checkCase({
      workspace: root,
      initialSnapshot: initial,
      caseId: 'complete',
      finalResponse: '',
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.length > 0);
  });
}
