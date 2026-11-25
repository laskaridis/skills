# Plan evaluations

Evaluates the `plan` skill with the [shared harness](../../README.md), which
documents prerequisites, options, artifacts, and results. Run from `evals/`:

```sh
pnpm eval plan --model gpt-6.1-sol --calibrate
pnpm eval plan --model gpt-6.1-sol --case complete
pnpm eval plan --skill ../skills/plan --model gpt-6.1-sol \
  --compare skills/plan/artifacts/BASELINE_RUN_ID/results.json
pnpm test tests/plan.test.ts   # offline, no Codex calls
```

`--skill` defaults to the repository's `skills/plan`, independent of the working
directory.

## Cases

Each case has `fixtures/specs/seat-reservation.spec.md` and a
`fixtures/ARCHITECTURE.md` (identical across cases) holding the project's
standing conventions (language, concurrency, errors, time, testing, design).
It closes technical questions without prescribing this feature's modules. The `ambiguous` `prompt.md` is the single line
`Produce an implementation plan for specs/seat-reservation.spec.md`. The
`complete` prompt asks for a design document and a task plan saved alongside the
spec under the filenames the checks expect, with `ARCHITECTURE.md` as additional
context, so `--no-skill` runs know which artifacts to deliver. It leaves their
structure and content to the agent. The case therefore does not test whether the
skill produces a design, or chooses those filenames, unprompted.

| Case        | Spec                               | Expected outcome                                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `complete`  | Full feature                       | Design and plan satisfy ten requirements: `intent_fidelity`, `design_drivers_and_decisions`, `design_boundaries`, `design_document_contract`, `design_change_resilience`, `design_coupling_cohesion`, `design_simplicity`, `verifiability`, `actionability`, `dependency_correctness` |
| `ambiguous` | Late cancellation policy left open | Single turn. Asks a specific late-cancellation policy question, including repeat cancellation. Presents no final design or plan (`clarification_policy`). Leaves the workspace untouched (no new files, inputs unchanged)                                                             |

## Deterministic checks

[checks.ts](checks.ts) enforces the skill's output contract. For `complete`:

- Outputs are `specs/seat-reservation.design.md` and
  `specs/seat-reservation.plan.json`: readable, ordinary (non-symlink), and
  non-empty. Only the plan's structure is parsed. The design document's content
  and template structure are left to the judge.
- The plan has exactly the root fields `specification_document`,
  `design_document`, `context_documents` and `tasks`. The first two must equal
  the spec and design paths above, and every referenced path must be readable.
- `context_documents` is exactly one entry, for `ARCHITECTURE.md` (which the
  `complete` prompt names as additional context), with a nonempty purpose.
  `ARCHITECTURE.md` is an initial fixture, so it is not an unexpected output.
- Each task has exactly the template's fields and types, a unique nonempty ID,
  `pending` status, a nonempty objective and completion criteria, and at least
  one story or criterion.
- Story and criterion references exist in the spec, every criterion ID is
  covered, and dependencies are known, not self-referential, and acyclic.
- Changed or deleted inputs, additional files (including application code), and
  non-regular files fail.

For `ambiguous`, the only check is that the workspace is untouched: any new file
or any changed or deleted input fails, including a design or plan.

Criterion labels do not prove semantic coverage. The judge assesses that.

## Judge

The shared judge applies each case's `expected.md` with the
[rubric](../../grading/rubric.md) and [schema](../../grading/quality.schema.json).
Each `- [id]` bullet is one requirement and its continuation lines are grading
qualifications.

For `complete`, the judge reads both the design document and the plan against
the spec:

- `intent_fidelity` covers behavior across both artifacts, with no unsupported
  additions such as a waitlist or notifications.
- `design_drivers_and_decisions`, `design_boundaries`,
  `design_document_contract`, `design_change_resilience`,
  `design_coupling_cohesion` and `design_simplicity` assess the design
  document: drivers with architectural consequences, risks, module
  responsibilities and interfaces, template conformance, whether the
  boundaries support change (locality, information hiding, testability,
  incremental evolution), whether modules are cohesive with explicit,
  acyclic dependencies on stable contracts, and whether the design is no larger
  than the in-process, in-memory feature needs. They judge the observable design
  and do not require a self-evaluation transcript.
- `verifiability`, `actionability` and `dependency_correctness` assess the
  plan's tasks.

It accepts alternative architectures, module counts, task counts, and
decompositions. It allows essential atomic-consistency and deterministic-test
constraints and rejects gratuitous implementation prescriptions. Judge execution
failures are reported separately from quality findings.

## Calibration

[judge-tests.ts](judge-tests.ts) holds two controls for `complete`. Each is a
prepared output (design document, plan JSON and final response) with an expected
verdict for every requirement. A calibrated `complete` run therefore makes four
LLM calls: the agent, the judge, and one judge call per control.

`degraded-plan` is a plan that is structurally valid, with labels covering every
criterion, plus a one-paragraph design. Their content:

- omits behavior (two tasks stand in for the whole feature)
- invents waitlists/email, in both the plan and the design
- uses vague completion criteria
- dictates layout/algorithms (file, method and data structure names)
- orders verification before prerequisites
- has a design with no drivers, decisions, risks, or module boundaries

All ten requirements are expected to fail.

`over-layered-design` pairs a good plan (`goodPlan()`) with a design that is
complete and well formed but adds speculative layers the spec does not require:
a repository abstraction with a pluggable storage interface, a pluggable
policy/strategy layer, and an internal event bus with no subscribers, each
justified only by flexibility or extensibility. State ownership, the atomic
coordination boundary, the preloaded event data and the time source stay
identifiable, and the policy layer's input view has a defined contract. Only
`design_simplicity` is expected to fail; the other nine are expected to pass. It
shows the judge passes a good plan and a clear, well-formed design, and fails an
over-engineered one for its content rather than for missing structure. Every
dependency in the design is explicit and every responsibility described, so
boundary and coupling findings would indicate accidental gaps in the control.
`goodDesign()` is the
proportionate single-module counterpart of that design; the offline tests
check it with the plan's structure checks.

Disagreements are preserved.
