---
name: verify
description: Independently verify a coding agent's output against user intent, architectural constraints and existing project rules. Report evidence-backed findings without implementing fixes.
---

# Verify

## User input

User is expected to specify the **VERIFICATION SCOPE**:

- An explicit **CHANGE BOUNDARY** that scopes the output of the coding agent that needs to be
  verified. For example: a baseline revision and result revision or working-tree state.
- The input provided to the coding agent to produce the given output: an assigned task,
  specification, user prompt or other relevant context.
- Optionally, specific instructions the verifier agent **must** take into consideration before
  the verification.

Report missing inputs that prevent verification as blockers.

## Core rules

- Derive expected behaviour **independently** from user supplied **VERIFICATION SCOPE**
  (input provided to the coding agent to generate the output), applicable project
  rules and architectural constraints. Treat the coding agent's output as claims to verify.
- Verify the outcome against your derived expectations. Do not invent product requirements
  or flag potential future functionality as missing.
- Constrain your findings to the assigned task's changes, the **CHANGE BOUNDARY**
  specified by the user. Exclude unrelated or pre-existing problems.
- Leave implementation, tests, documents, and task status unchanged. You may run
  checks and create temporary, disposable probes which you must clean up afterwards.
- Return your findings to the caller. Do not implement fixes or make any permanent
  changes in the codebase.
- Inspect the codebase as needed using exploration subagents with fresh contexts.
- Run all relevant checks independently. Use targeted probes where existing evidence
  is insufficient using subagents.

## Verification scope

Verify the coding agent's output across the following dimensions. Assess each dimension
proportionately to the assigned task. If any is not applicable, briefly explain.

1. **Correctness:**
   - Check acceptance criteria, expected behavior, relevant edge cases, error
     handling, and domain invariants.
2. **Completeness:**
   - Trace every requirement, completion criterion and constraint in the user supplied
     implementation context (assigned task, specification or additional context), to
     verification **evidence**. Do not pass with any unaccounted for.
   - Trace each implemented behavior or restriction back to a requirement or necessary
     supporting behavior. Check for not implemented requirements, unsupported
     assumptions, and scope deviations.
3. **Test adequacy:**
   - Assess whether tests meaningfully verify intended behavior through appropriate
     interfaces and catch plausible defects.
   - Check expectations, assertions, and weakened coverage. Passing tests alone do
     not establish completion or correctness.
4. **Compatibility & constraints:**
   - Check affected existing behavior for regressions.
   - Verify compliance with architectural decisions, constraints, module boundaries,
     API contracts, and data integrity requirements.
   - Do not impose undocumented architectural preferences.
5. **Security & reliability:**
   - Check relevant vulnerabilities, concurrency issues, resource handling, and operational
     risks introduced by the changes.
6. **Maintainability & evolvability:**
   - Assess whether the implementation is easily readable and understandable by a human,
     and proportionate to the problem scope.
   - Identify changes that introduce friction or risk for foreseeable future changes:
     unnecessary complexity, excessive coupling, low cohesion, duplicated business logic,
     or unnecessary abstractions.
   - Ground maintainability findings in concrete maintenance scenarios which
     demonstrate substantial cost or risk. Exclude stylistic preferences and
     speculative refactors.

## Verdict and report

Report using concise Markdown:

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

Use `blocked` when material ambiguity or missing evidence prevents a verdict.

Use `pass` only when applicable requirements and dimensions are sufficiently
verified and no qualifying findings remain.

Omit empty findings and blockers. Do not report optional improvements.
