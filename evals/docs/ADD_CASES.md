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
with `--create`. Optional `checks.ts`, `judge-controls/`, `run.ts` and `README.md`
sit next to `cases/`; the TypeScript files' imports of the harness use `../../lib/` and
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
mkdir -p skills/doc-gardening/cases/stale-command/fixtures
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

Declare controls in `evals/skills/<skill>/judge-controls/`. The folder layout is
the fixture specification:

```
evals/skills/<skill>/judge-controls/
  controls.yml
  fixtures/
    <control-id>/
      final-message.md          # required: the skill's final response
      skill-output-files/       # optional: files the skill produced
        <workspace path>        # e.g. README.md
```

`controls.yml` holds one YAML document with a map of controls keyed by ID:

```yaml
version: 1
controls:
  unchanged-readme:
    case: stale-command
    description: Leaves the stale command in place but claims success.
    default: pass # verdict for every criterion not listed under expect
    expect:
      accurate_command: fail
```

Each control needs a safe ID with a matching folder under `fixtures/` (and every
folder needs a control), an existing `case`, and a `default` status (`pass`,
`fail`, or `ungradable`). `expect` overrides the default for individual
requirement IDs of that case, so adding a requirement needs no edits to the
controls. `description` is optional but recommended: record why the specimen is
good or bad. `final-message.md` must be nonempty and becomes the final response
exactly as written. Files under `skill-output-files/` are keyed by their path
relative to it and overlaid on the case fixtures in the judge's evidence; omit
the folder when the skill produces no files. Case inputs come from the case's
own `fixtures/`, so do not copy them here. Fixtures are frozen specimens:
editing a case's inputs does not update them.

A mismatch is reported as `grader_disagreement` with expected and observed
statuses; judge failures remain separate. Passing controls alone does not
establish judge reliability. See the
[degraded plan control](../skills/plan/judge-controls/controls.yml), which looks
plausible but should fail every requirement except design and plan consistency.
