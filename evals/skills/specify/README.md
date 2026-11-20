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
pnpm test tests/specify.test.ts             # offline checks
pnpm eval specify --model YOUR_MODEL --case complete
pnpm eval specify --model YOUR_MODEL --case complete --calibrate
```

The seven [calibration controls](judge-tests.ts) include one fully correct
reference spec and six intentionally defective variants. The expected results
include multi-criterion failures where a defect necessarily changes scope.
They run with `--calibrate` and consume seven additional judge calls.
Check for `grader_disagreement` in the report; these controls detect specific
judge errors but do not establish general judge accuracy or reproducibility.
A live evaluation and calibration require an authenticated Codex or Claude CLI.
