---
name: verify
description: Independently verify a coding agent's completed task against its specification, scope, constraints, and affected behavior. Return evidence-backed findings to the orchestrator without implementing fixes.
---

# Verify

## Inputs

Require the user prompt, specification, task plan, assigned task ID,
and an explicit change boundary: baseline revision and result revision
or working-tree state. Read referenced design and context documents.

Report missing inputs or material contradictions as blockers. Do not
silently resolve product or architectural ambiguity.

## Boundaries

- Verify the assigned task and affected existing behavior. Do not flag
  requirements assigned to future tasks as missing.
- Inspect supporting code as needed, but attribute findings to the task's
  changes. Exclude unrelated, pre-existing problems.
- Leave implementation, persistent tests, documents, and task status unchanged.
  You may run checks and create disposable probes; remove only your own
  temporary artifacts.
- Return findings to the orchestrator. Do not implement fixes or select
  the next task.

## Verification

Derive expectations from the prompt, specification, task criteria, design,
and applicable project rules. Treat the coding agent's output as claims to
verify. Inspect the changes and relevant callers, dependencies, and tests
across these dimensions:

1. **Correctness:** Check acceptance criteria, expected behavior, relevant
   edge cases, error handling, and domain invariants.
2. **Completeness:** Map every task-applicable prompt/specification
   requirement, completion criterion, and constraint to verification
   evidence. Do not pass with any unaccounted for. Check for missing
   requirements, unsupported assumptions, and scope deviations. Trace each
   introduced behavior or restriction to an authorized requirement or
   necessary supporting behavior. Task or design details must not
   independently authorize new product policy; block material scope ambiguity.
3. **Test adequacy:** Assess whether tests meaningfully verify intended
   behavior through appropriate interfaces and would catch plausible
   defects. Check expectations, assertions, and weakened coverage; passing
   tests alone do not establish completion.
4. **Compatibility & constraints:** Check affected existing behavior for
   regressions and verify architectural boundaries, API contracts, data
   integrity, and explicit nonfunctional requirements.
5. **Security & reliability:** Check relevant vulnerabilities, concurrency
   issues, resource handling, and operational risks introduced by the changes.

Independently run relevant checks. Use targeted probes where existing
evidence is insufficient; broaden execution according to integration and
regression risk. Assess each dimension proportionately to the task; briefly
explain when one is not applicable.

For significant maintainability findings, require a concrete maintenance
scenario demonstrating substantial cost or risk. Exclude stylistic
preferences and speculative refactors.

Verify the result, not whether the agent followed the TDD sequence.

## Verdict and report

Return concise Markdown:

- **Verdict:** pass | fail | blocked
- **Evidence:** checks and outcomes by dimension, with requirement references
  and material verification limits.
- **Findings:** each issue's location, violated requirement or concrete
  maintenance scenario, evidence, and impact. Include reproduction steps
  when useful.
- **Blockers:** what remains unverifiable, why, and what would unblock it.

Use `fail` when concrete defects, unsupported scope, constraint violations,
or significant maintainability problems are established. Preserve any
additional blockers in the report.

Otherwise use `blocked` when material ambiguity or missing evidence
prevents a verdict. Use `pass` only when applicable requirements and dimensions
are sufficiently verified and no qualifying findings remain.

Omit empty findings and blockers. Do not add optional improvement lists.
