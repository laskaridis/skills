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
assesses eight independent semantic properties: scope completeness, verifiable
acceptance criteria, vertical stories, superseded decisions, out-of-scope
capture, implicit assumptions, flagging the two open items under
"Clarifications needed" instead of silently resolving them, and avoiding
implementation details.

## Run

From `evals/`:

```sh
pnpm eval specify --model YOUR_MODEL --case complete
pnpm eval specify --model YOUR_MODEL --case complete --calibrate
```

The two [calibration controls](judge-tests.ts) include one fully correct
reference spec (all eight criteria pass) and one combined defective spec (all
eight criteria fail). They run with `--calibrate` and consume two additional judge
calls instead of nine. Check for `grader_disagreement` in the report. Because
all defects are combined, failures identify misgraded criteria but do not isolate
a specific defect; these controls do not establish judge accuracy or reproducibility.
A live evaluation and calibration require an authenticated Codex or Claude CLI.
