# Local plan evaluations

This suite uses the [shared skill evaluation harness](../README.md). Requires
Node.js 22.21+, pnpm 9.15.1, Git, and an authenticated Codex CLI. From the `evals/` directory:

```sh
pnpm eval plan --model gpt-6.1-sol --calibrate
pnpm eval plan --model gpt-6.1-sol --case complete
pnpm test tests/plan.test.ts
```

The plan-specific TypeScript entry point supports the same evaluation options
and skill-directory override:

```sh
pnpm eval:plan --skill ../skills/plan --model gpt-6.1-sol \
  --compare plan/artifacts/BASELINE_RUN_ID/results.json
pnpm test:coverage
```

`--skill` defaults to the repository’s `skills/plan`, independently of the working directory. See the shared guide for model/reasoning
overrides, timeouts, authentication, artifact layout, result interpretation, and
baseline limitations. Model calls may take several minutes; offline
Vitest unit tests make no Codex calls.

## Cases and grading

`cases/complete/input/specs/seat-reservation.spec.md` defines the full feature.
`cases/ambiguous/input/specs/seat-reservation.spec.md` leaves late cancellation
unresolved. Each case's `prompt.md` requests design and task-plan output without
application implementation. `expected.md` retains the four stable quality IDs:
intent fidelity, verifiability, actionability, and dependency correctness, with
complete behavior, edge-case, exclusion, and architectural qualifications.

The ambiguous case is a single turn. Its `expected.md` has one requirement: the
response must ask a specific late-cancellation policy question, including repeat
cancellation, and present no final design/plan. Its deterministic check requires
the workspace to be left untouched (no design or plan files, inputs unchanged).

The optional [checks module](checks.ts) enforces the skill's output contract:
`specs/seat-reservation.design.md` and `specs/seat-reservation.plan.json`, exact JSON
fields/types, safe readable document paths, empty designated context, pending
statuses, unique task IDs, valid story/criterion references, complete criterion-ID
coverage, known dependencies, and acyclicity. It rejects changed inputs, additional
files, application code, and symlinks. Criterion labels do not prove semantic coverage.

The shared judge reads each case's checklist using the [shared rubric](../grading/rubric.md)
and [schema](../grading/quality.schema.json). It accepts valid alternative architectures,
task counts, and decompositions. Essential atomic consistency and deterministic-test
constraints are allowed; gratuitous implementation prescriptions are not. Judge
execution failures remain separate from quality findings.

[Prepared calibration controls](judge-tests.ts) include a structurally plausible
plan whose labels cover every criterion while its meaning omits behavior, invents
waitlists/email, uses vague completion criteria, dictates layout/algorithms, and
orders verification before prerequisites. All four findings should fail;
disagreements are preserved. Targeted Vitest tests cover malformed plans, transport handling, shared case
validation, isolation, interaction, and comparison. The removed `--self-test` option
is replaced by `pnpm test`; see the shared guide for coverage and type checking.

The former `fixtures/`, `private/`, and `grading/` files remain as historical
material; active runs use `cases/` and shared grading. Existing artifacts
are unchanged. The skill is not changed
to improve evaluation results.
