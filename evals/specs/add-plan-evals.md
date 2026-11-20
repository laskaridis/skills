# Spec-only PoC for evaluating the `plan` skill

## Summary

Implement a small local eval suite under `evals/` that helps compare revisions of `skills/plan`. Use two fixture specifications, explicit `$plan` invocation, deterministic checks, and a separate Codex judge.

Evaluate generated design documents and task plans. Do not implement the generated tasks, create application fixtures, add CI, or change the skill.

## Fixtures and expected behavior

Use a greenfield seat-reservation feature with two specification variants:

1. **Complete specification:** Define creating and cancelling reservations, capacity limits, duplicate-request behavior, and observable error outcomes. Include numbered stories and acceptance criteria, explicit exclusions, and enough context to make architectural decisions without inspecting application code.
2. **Ambiguous specification:** Use the same feature but leave one consequential product decision unresolved: whether cancellation is allowed after an event begins. Require clarification before finalizing. Prepare a scripted answer establishing the policy.

Keep evaluator expectations separate from inputs visible to the planning agent. For each fixture, record:

- Required behaviors and constraints, including easily overlooked conditions.
- Unsupported additions the plan must avoid.
- Logical prerequisites that task dependencies must preserve.
- What makes completion criteria observable and locally verifiable.
- For the ambiguous case, the unresolved decision and prepared reply.

Do not prescribe an exact task count, task breakdown, or reference architecture. Judge valid alternative decompositions on their merits.

## Runner and grading

Implement one Node.js script using the standard library, with a short usage README.

**Run interface:** Accept the skill directory and model as arguments. Allow a separate judge model, defaulting to the planning model. Default reasoning effort to `high` and record the actual settings. Optionally accept a previous results file for comparison.

For each case:

- Create a fresh temporary Git workspace containing only the selected skill and fixture spec. Keep evaluator expectations outside this workspace.
- Invoke `$plan` explicitly through `codex exec --json`. Capture the trace, final response, generated files, errors, and available usage data.
- For the ambiguous case, use a read-only judge to check that the first response identifies the unresolved policy and requests clarification without finalizing a plan. If it passes, resume that specific session with the prepared reply and evaluate the finished artifacts. Otherwise, record a failure.
- Limit the ambiguous case to one scripted reply. Record additional clarification requests as incomplete, with their text available for review.
- Use a ten-minute timeout per Codex invocation. Report timeouts and execution errors separately from quality failures.

Run deterministic checks against the skill's output contract: exact JSON structure and field types, expected output locations, readable repository-relative document paths, pending statuses, unique task IDs, valid story and criterion references, criterion-ID coverage, valid dependencies, and absence of cycles. Check that no application code was created.

Run a separate, read-only Codex judge against the spec, generated design, plan, and evaluator expectations. Require structured findings for four dimensions:

| Dimension | What the judge assesses |
|---|---|
| Intent fidelity | Required behavior is covered and unsupported behavior is absent. |
| Verifiability | Each task has concrete, observable completion criteria. |
| Actionability | Tasks form cohesive vertical slices traceable to the spec and preserve implementation autonomy. |
| Dependency correctness | Necessary prerequisites are represented without unjustified ordering constraints. |

Score each dimension `pass` or `fail`, with specific evidence referencing task IDs and specification requirements. Permit an `ungradable` result for missing or unusable artifacts. Listing an acceptance-criterion ID alone must not count as semantic coverage. Essential architectural constraints must not be mistaken for excessive implementation prescription.

## Reports and comparison

Save results under an ignored `evals/skills/plan/artifacts/<run-id>/` directory:

- Inputs and exact skill snapshot used.
- Traces, generated artifacts, and judge responses.
- Machine-readable results and a concise Markdown report.
- Model, reasoning settings, CLI version, and skill content hash.

Show structural failures and all four quality dimensions separately. When a previous results file is provided, show improvements and regressions by case and dimension. Flag differing inputs or runtime settings as comparison limitations.

Use one run per case for the PoC. Explain that a single comparison is exploratory evidence; repeat runs before trusting a marginal improvement. Do not introduce a weighted aggregate score or automated release gate.

## Validation and handoff

The implementation is complete when:

- Both fixtures run from one documented command and preserve inspectable artifacts.
- The ambiguous case can resume its own session with the scripted answer.
- Structural checks reject malformed output and broken dependency graphs.
- A deliberately degraded plan is detected for omitted or invented behavior, vague completion criteria, excessive coding prescriptions, and incorrect prerequisites.
- Judge execution failures remain distinguishable from failed plans.
- A saved baseline can be compared with a subsequent run.

Run the PoC once against the current skill and inspect the findings manually. Report grader disagreements and skill failures without modifying the skill to improve its scores.

The handoff deliverables are the two specs, private evaluator expectations, runner, grading rubric and response schema, usage instructions, and initial run report.
