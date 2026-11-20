# Plan evaluations

Evaluates the `plan` skill with the [shared harness](../../README.md), which
documents prerequisites, options, artifacts, and results. Run from `evals/`:

```sh
pnpm eval plan --model gpt-6.1-sol --calibrate
pnpm eval plan --model gpt-6.1-sol --case complete
pnpm eval:plan --skill ../skills/plan --model gpt-6.1-sol \
  --compare skills/plan/artifacts/BASELINE_RUN_ID/results.json
pnpm test tests/plan.test.ts   # offline, no Codex calls
```

`--skill` defaults to the repository's `skills/plan`, independent of the working
directory.

## Cases

Each case has `fixtures/specs/seat-reservation.spec.md`. Each `prompt.md` asks
for a design and task plan, not an implementation.

| Case        | Spec                               | Expected outcome                                                                                                                                                                                 |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `complete`  | Full feature                       | Design and plan satisfy four quality IDs: intent fidelity, verifiability, actionability, dependency correctness (each with behavior, edge-case, exclusion, and architectural qualifications)     |
| `ambiguous` | Late cancellation policy left open | Single turn. Asks a specific late-cancellation policy question, including repeat cancellation. Presents no final design or plan. Leaves the workspace untouched (no new files, inputs unchanged) |

## Deterministic checks

[checks.ts](checks.ts) enforces the skill's output contract:

- Outputs are `specs/seat-reservation.design.md` and
  `specs/seat-reservation.plan.json` at safe, readable paths.
- The plan has exact JSON fields and types, empty designated context, pending
  statuses, and unique task IDs.
- Story and criterion references are valid, every criterion ID is covered, and
  dependencies are known and acyclic.
- Changed inputs, additional files, application code, and symlinks fail.

Criterion labels do not prove semantic coverage. The judge assesses that.

## Judge

The shared judge applies each case's `expected.md` with the
[rubric](../../grading/rubric.md) and [schema](../../grading/quality.schema.json). It
accepts alternative architectures, task counts, and decompositions. It allows
essential atomic-consistency and deterministic-test constraints and rejects
gratuitous implementation prescriptions. Judge execution failures are reported
separately from quality findings.

## Calibration

[judge-tests.ts](judge-tests.ts) holds a control plan that is structurally
valid, with labels covering every criterion, but whose content:

- omits behavior
- invents waitlists/email
- uses vague completion criteria
- dictates layout/algorithms
- orders verification before prerequisites

All four quality findings should fail. Disagreements are preserved.
