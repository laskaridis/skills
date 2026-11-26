import type { CheckContext, CheckResult } from '../../lib/checks.ts';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  snapshot,
  readablePath,
  readJSON,
  nonempty,
  exactKeys,
  object,
  type Snapshot,
} from '../../lib/utils.ts';

const SPEC = 'specs/seat-reservation.spec.md';

const ARCHITECTURE = 'ARCHITECTURE.md';

const DESIGN = 'specs/seat-reservation.design.md';

const PLAN = 'specs/seat-reservation.plan.json';

export async function checkStructure(
  root: string,
  initial: Snapshot,
): Promise<CheckResult> {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const after = await snapshot(root);

  for (const [file, digest] of Object.entries(initial)) {
    if (after[file] !== digest) {
      fail(`Input modified or deleted: ${file}`);
    }
  }

  for (const file of Object.keys(after)) {
    if (!(file in initial) && ![PLAN, DESIGN].includes(file)) {
      fail(`Unexpected output (application code is forbidden): ${file}`);
    }

    if (after[file] === 'NON_REGULAR_FILE') {
      fail(`Non-regular file: ${file}`);
    }
  }

  for (const file of [SPEC, DESIGN, PLAN]) {
    try {
      if (!(await readablePath(root, file))) {
        fail(`Expected readable ordinary file: ${file}`);
      } else if (!(await fs.readFile(path.join(root, file), 'utf8')).trim()) {
        fail(`Empty file: ${file}`);
      }
    } catch {
      fail(`Missing or unreadable file: ${file}`);
    }
  }

  let plan;

  try {
    if (!(await readablePath(root, PLAN))) {
      throw new Error('unsafe path');
    }

    plan = await readJSON(path.join(root, PLAN));
  } catch (error: any) {
    fail(`Plan is not readable JSON: ${error.message}`);
    return { status: 'fail', failures };
  }

  const rootKeys = [
    'specification_document',
    'design_document',
    'context_documents',
    'tasks',
  ];

  if (!exactKeys(plan, rootKeys)) {
    fail(`Plan must have exactly: ${rootKeys.join(', ')}`);
  }

  if (!object(plan)) {
    return { status: 'fail', failures };
  }

  if (plan.specification_document !== SPEC) {
    fail(`specification_document must equal ${SPEC}`);
  }

  if (plan.design_document !== DESIGN) {
    fail(`design_document must equal ${DESIGN}`);
  }

  const docs = [plan.specification_document, plan.design_document];

  if (!Array.isArray(plan.context_documents)) {
    fail('context_documents must be an array');
  } else {
    // The user prompt designates ARCHITECTURE.md as the only context document.
    const entries = plan.context_documents;
    const [entry] = entries;

    if (
      entries.length !== 1 ||
      !exactKeys(entry, ['path', 'purpose']) ||
      entry.path !== ARCHITECTURE ||
      !nonempty(entry.purpose)
    ) {
      fail(
        `context_documents must be exactly one entry with path ${ARCHITECTURE} and a nonempty purpose`,
      );
    }

    for (const doc of entries) {
      docs.push(doc?.path);
    }
  }

  for (const doc of docs) {
    try {
      if (!(await readablePath(root, doc))) {
        fail(`Unsafe/unreadable document path: ${doc}`);
      }
    } catch {
      fail(`Unsafe/unreadable document path: ${doc}`);
    }
  }

  if (!Array.isArray(plan.tasks) || !plan.tasks.length) {
    fail('tasks must be a nonempty array');
    return { status: 'fail', failures };
  }

  let spec;

  try {
    spec = await fs.readFile(path.join(root, SPEC), 'utf8');
  } catch {
    return {
      status: 'fail',
      failures: [
        ...failures,
        'Specification unavailable for reference validation',
      ],
    };
  }

  const stories = new Set(
    [...spec.matchAll(/^## (US-\d+)\b/gm)].map((match) => match[1]),
  );
  const criteria = new Set(
    [...spec.matchAll(/^- (AC-\d+):/gm)].map((match) => match[1]),
  );
  const covered = new Set<string>();
  const ids = new Set<string>();
  const taskKeys = [
    'id',
    'objective',
    'status',
    'stories_enabled',
    'acceptance_criteria_addressed',
    'completion_criteria',
    'constraints',
    'dependencies',
  ];

  for (const [index, task] of plan.tasks.entries()) {
    const label =
      object(task) && nonempty(task.id) ? task.id : `task[${index}]`;

    if (!exactKeys(task, taskKeys)) {
      fail(`${label}: unexpected or missing fields`);
    }

    if (!object(task)) {
      continue;
    }

    if (!nonempty(task.id)) {
      fail(`${label}: id must be a nonempty string`);
    } else if (ids.has(task.id)) {
      fail(`${label}: duplicate task ID`);
    } else {
      ids.add(task.id);
    }

    if (!nonempty(task.objective)) {
      fail(`${label}: objective must be nonempty`);
    }

    if (task.status !== 'pending') {
      fail(`${label}: status must be pending`);
    }

    for (const field of [
      'stories_enabled',
      'acceptance_criteria_addressed',
      'completion_criteria',
      'constraints',
      'dependencies',
    ]) {
      if (
        !Array.isArray(task[field]) ||
        task[field].some((value: unknown) => !nonempty(value))
      ) {
        fail(`${label}: ${field} must be an array of nonempty strings`);
      }
    }

    if (!task.completion_criteria?.length) {
      fail(`${label}: completion_criteria must not be empty`);
    }

    if (
      !(Array.isArray(task.stories_enabled) && task.stories_enabled.length) &&
      !(
        Array.isArray(task.acceptance_criteria_addressed) &&
        task.acceptance_criteria_addressed.length
      )
    ) {
      fail(`${label}: must enable at least one story or criterion`);
    }

    for (const [field, allowed] of [
      ['stories_enabled', stories],
      ['acceptance_criteria_addressed', criteria],
    ] as const) {
      if (!Array.isArray(task[field])) {
        continue;
      }

      for (const ref of task[field]) {
        if (!allowed.has(ref)) {
          fail(`${label}: unknown ${field} reference ${ref}`);
        } else if (field === 'acceptance_criteria_addressed') {
          covered.add(ref);
        }
      }
    }
  }

  for (const criterion of criteria) {
    if (!covered.has(criterion)) {
      fail(`Uncovered criterion ID: ${criterion}`);
    }
  }

  const graph = new Map<string, string[]>();

  for (const task of plan.tasks) {
    if (!object(task) || !nonempty(task.id)) {
      continue;
    }

    const deps = Array.isArray(task.dependencies) ? task.dependencies : [];

    graph.set(task.id, deps.filter(nonempty));

    for (const dependency of deps) {
      if (!ids.has(dependency)) {
        fail(`${task.id}: unknown dependency ${dependency}`);
      }

      if (dependency === task.id) {
        fail(`${task.id}: self dependency`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): void {
    if (visiting.has(id)) {
      fail(`Dependency cycle involving ${id}`);
      return;
    }

    if (visited.has(id)) {
      return;
    }

    visiting.add(id);

    for (const dep of graph.get(id)!) {
      if (graph.has(dep)) {
        visit(dep);
      }
    }

    visiting.delete(id);
    visited.add(id);
  }

  for (const id of graph.keys()) {
    visit(id);
  }

  return { status: failures.length ? 'fail' : 'pass', failures };
}

// An unresolved product decision must stop the skill before it writes a design
// or plan, so the clarification case expects the workspace to be left untouched.
export async function checkNoOutput(
  root: string,
  initial: Snapshot,
): Promise<CheckResult> {
  const after = await snapshot(root);
  const failures = [
    ...Object.keys(after)
      .filter((file) => !(file in initial))
      .map((file) => `Unexpected output before clarification: ${file}`),
    ...Object.keys(initial)
      .filter((file) => after[file] !== initial[file])
      .map((file) => `Input modified or deleted: ${file}`),
  ];

  return { status: failures.length ? 'fail' : 'pass', failures };
}

export const checkCase = ({
  caseId,
  workspace,
  initialSnapshot,
}: Pick<CheckContext, 'workspace' | 'initialSnapshot'> &
  Partial<Pick<CheckContext, 'caseId'>>) =>
  caseId === 'ambiguous'
    ? checkNoOutput(workspace, initialSnapshot)
    : checkStructure(workspace, initialSnapshot);
