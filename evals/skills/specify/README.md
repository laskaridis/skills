# Specify evaluations

One positive case, [complete](cases/complete/), exercises the real `specify`
skill with a Q&A about a hypothetical workshop RSVP feature that is settled
except for two deliberately open items.

The harness supports one agent turn. To simulate preceding conversation context,
`prompt.md` embeds the ordered Q&A, including an early waitlist idea later
rejected, a scope exclusion, a sign-in assumption, two conflicting stakeholder
positions on whether the dashboard changes, and an unanswered question about
limiting concurrent reservations. The small fixture README
describes the existing application. This does **not** test multi-turn memory.

The skill is asked to write only `specs/workshop-rsvp.spec.md`. The
[check](checks.ts) requires that exact, nonempty, ordinary file, unchanged
inputs, and no other outputs. The [judge checklist](cases/complete/expected.md)
assesses nine independent semantic properties: scope completeness, required
story structure (stories with their own criteria, not themed requirements and a
pooled scenario list), verifiable acceptance criteria, vertical stories, superseded decisions, out-of-scope
capture, implicit assumptions, flagging the two open items under
"Clarifications needed" instead of silently resolving them, and avoiding
implementation details.

## Run

From `evals/`:

```sh
pnpm eval specify --model YOUR_MODEL --case complete
pnpm eval specify --model YOUR_MODEL --case complete --calibrate
```

The three [calibration controls](judge-tests.ts) are one fully correct
reference spec (all eight criteria pass), one combined defective spec (all
criteria fail), and one flat-requirements spec that is behaviorally correct but
has no stories (`verifiable_stories` and `vertical_stories` fail). They run with `--calibrate` and consume
three additional judge calls instead of ten. Check for `grader_disagreement` in the report. Because
all defects are combined, failures identify misgraded criteria but do not isolate
a specific defect; these controls do not establish judge accuracy or reproducibility.
A live evaluation and calibration require an authenticated Codex or Claude CLI.
