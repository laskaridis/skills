# Add your own case

A case is a directory under an existing skill (`skills/<skill>/`, or pass
`--skill DIR`):

```text
evals/skills/<skill>/cases/<case>/
  fixtures/     # Small repository copied into the agent workspace
  prompt.md     # The user's task
  expected.md   # Evaluator's checklist, withheld from the agent
```

Scaffold a new case with `pnpm eval <skill> --case <case> --create`. It creates
`prompt.md`, `expected.md` (placeholders that already parse) and
`fixtures/.gitkeep`. It fails without changing anything if the skill directory
is missing (a mistyped skill is not created) or the case already exists.

Suites live under `evals/skills/<skill>/`, one per skill in the repository-root
`skills/<skill>/`. To add a suite for a skill that has none, create the empty
directory first (`mkdir -p evals/skills/<skill>`), then scaffold its first case
with `--create`. Optional `checks.ts`, `judge-tests.ts`, `run.ts` and `README.md`
sit next to `cases/`; their imports of the harness use `../../lib/` and
`../../run.ts`.

No manifest, schema, rubric, or validator is required. Keep fixtures small and
write expectations before looking at outputs. The harness prefixes `prompt.md`
with an explicit invocation of the skill; put the task in the prompt and
assessment criteria in `expected.md`.

Fixture rules: ordinary files and directories only. Symlinks, `.git`, unsafe
paths, and collisions with `.agents/skills/<skill>/` are rejected. For
intentionally empty fixtures directory, commit `fixtures/.gitkeep` (omitted from agent inputs).
Fixture edits are allowed, so express protected files or required outputs in the
checklist or a validator. Case and skill names use the identifier rules below.

## Example: correct a stale documentation command

The fixture's README mentions a script absent from `package.json`; success means
fixing that command while preserving everything else.

```sh
# Run from evals/
mkdir -p skills/skills/doc-gardening/cases/stale-command/fixtures
cat > skills/doc-gardening/cases/stale-command/fixtures/package.json <<'JSON'
{"scripts":{"test":"node --test"}}
JSON
cat > skills/doc-gardening/cases/stale-command/fixtures/README.md <<'MD'
# Example
Run the tests with `pnpm check`.
MD
cat > skills/doc-gardening/cases/stale-command/prompt.md <<'MD'
Review README.md against package.json and fix the documented test command.
MD
cat > skills/doc-gardening/cases/stale-command/expected.md <<'MD'
- [accurate_command] README.md tells readers to run pnpm test, consistent with package.json.
  Accept pnpm run test as an equivalent command.
- [focused_change] Preserve package.json and unrelated documentation content.
MD
pnpm eval doc-gardening --model YOUR_MODEL --case stale-command
```

This example is illustrative, not a maintained suite.

## Write the expectation checklist (non-deterministic results)

`expected.md` is graded by an independent judge that assesses meaning, accepts
valid alternatives, and must cite evidence for every finding (see the
[rubric](../grading/rubric.md) and [response schema](../grading/quality.schema.json)).
Use it for anything whose correct form can vary in wording.

- Start each item at column one: `- [id] requirement text`.
- IDs use letters, digits, hyphens, underscores, beginning with a letter or digit.
- Indent continuation lines by two spaces or a tab, for examples, exceptions, and
  grading qualifications. Blank lines are allowed.
- Headings, ordinary bullets, duplicate IDs, empty requirements, and other syntax
  are rejected with file and line number.
- Keep an ID when rewording the same requirement; use a new ID for a new one.
  Comparisons key on IDs.

The harness verifies that every expected ID appears exactly once in the judge's
response and that no unexpected IDs appear. The checklist is covered by
`inputs_hash`.

## Test that a skill asks instead of guessing

A case is a single turn, so a skill that should stop and ask is graded on its
question. Leave the unresolved decision out of `fixtures/`, tell the agent in
`prompt.md` to raise consequential decisions, and write `expected.md` for the
question:

```markdown
- [ask_policy] Ask whether reservations can be cancelled after the event starts.
  Do not finalize a design or task plan or silently choose a policy.
```

Pair it with a `checks.ts` rule that no output files were written. See the
[ambiguous plan case](../skills/plan/cases/ambiguous/) and its [check](../skills/plan/checks.ts).

## Add deterministic checks

Use `evals/skills/<skill>/checks.ts` for conditions better verified exactly: valid JSON,
required paths, unchanged fixtures. Export `checkCase`:

```ts
import type { CheckContext } from '../../lib/types.ts';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function checkCase({
  caseId,
  workspace,
  initialSnapshot,
  finalResponse,
}: CheckContext) {
  const failures: string[] = [];
  if (caseId === 'stale-command') {
    const content = await readFile(path.join(workspace, 'package.json')).catch(
      () => null,
    );
    const hash =
      content === null
        ? null
        : createHash('sha256').update(content).digest('hex');
    if (hash !== initialSnapshot['package.json']) {
      failures.push(
        'package.json changed or became unreadable; only documentation should change.',
      );
    }
  }
  return { status: failures.length ? 'fail' : 'pass', failures };
}
```

- `workspace`: path of the temporary repository.
- `initialSnapshot`: initial repository-relative paths mapped to SHA-256 hashes.
- `finalResponse`: the agent's last response.
- Return exactly `status` (`pass` | `fail`) and `failures` (array of nonempty
  strings): empty when passing, at least one entry when failing.

Checks run after execution, and on early exits when feasible. Throwing or
returning an invalid shape is a harness failure (exit 2); a deliberate failure
should return `fail` with explanations. A failed check does not suppress judging
when usable evidence exists. Without the module, checks report `not_run`. See the
[plan validator](../skills/plan/checks.ts) for a larger example.

## Check the judge with controls

Controls are prepared outputs with findings you have chosen, used to test the
judge itself:

```sh
pnpm eval plan --model YOUR_MODEL --calibrate
```

This also runs the agent cases. All suite controls run even with `--case`, using
the judge model without an agent, so it adds model calls and usage. A suite
without controls reports calibration as `unavailable`.

Provide controls by exporting a nonempty `controls` array from
`evals/skills/<skill>/judge-tests.ts`:

```ts
import type { Control } from '../lib/types.ts';

export const controls: Control[] = [
  {
    id: 'unchanged-readme',
    caseId: 'stale-command',
    generatedFiles: {},
    finalResponse: 'Done; no changes needed.',
    expected: { accurate_command: 'fail', focused_change: 'pass' },
  },
];
```

Each control needs a unique safe `id`, an existing `caseId`, `generatedFiles`
(paths to prepared text, overlaid on the case fixtures in the judge's evidence),
a `finalResponse` string, and an `expected` status (`pass`, `fail`, or
`ungradable`) for every requirement ID. A mismatch is reported as
`grader_disagreement` with expected and observed statuses; judge failures remain
separate. Passing controls alone does not establish judge reliability. See the
[degraded plan control](../skills/plan/judge-tests.ts), which looks plausible but should
fail all four semantic requirements.
