# Specify evaluations

One positive case, [complete](cases/complete/), exercises the real `specify`
skill with a resolved Q&A about a hypothetical workshop RSVP feature.

The harness supports one agent turn. To simulate preceding conversation context,
`prompt.md` embeds the ordered Q&A, including an early waitlist idea later
rejected, a scope exclusion, and a sign-in assumption. The small fixture README
describes the existing application. This does **not** test multi-turn memory.

The skill is asked to write only `specs/workshop-rsvp.spec.md`. The
[check](checks.ts) requires that exact, nonempty, ordinary file, unchanged
inputs, and no other outputs. The [judge checklist](cases/complete/expected.md)
assesses six independent semantic properties: scope completeness, verifiable
acceptance criteria, vertical stories, superseded decisions, out-of-scope
capture, and implicit assumptions.

## Run

From `evals/`:

```sh
pnpm eval specify --model YOUR_MODEL --case complete
pnpm eval specify --model YOUR_MODEL --case complete --calibrate
```

The two [calibration controls](judge-tests.ts) include one fully correct
reference spec (all six criteria pass) and one combined defective spec (all six
criteria fail). They run with `--calibrate` and consume two additional judge
calls instead of seven. Check for `grader_disagreement` in the report. Because
all defects are combined, failures identify misgraded criteria but do not isolate
a specific defect; these controls do not establish judge accuracy or reproducibility.
A live evaluation and calibration require an authenticated Codex or Claude CLI.
