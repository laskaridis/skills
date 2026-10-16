---
name: tdd
description: Guide coding agents through test-driven development for code changes. Use when the user asks to implement, fix, refactor, or extend behavior using TDD, red-green-refactor, test-first development, characterization tests, regression tests, or when a change should be driven by failing tests before production code is edited.
---

# TDD

Use this skill to write production code with an executable description of the desired behavior.

## Core Rule

When writing production code start by writing a test that describes the intended behavior first, following a RED -> GREEN cycle.

## Workflow

1. Create a list of test scenarios

Before you write a single line of code:
- Identify the expected behavior.
- Inspect existing code and test conventions.
- Identify edge cases and failure modes.
- Create a list of test scenarios that cover the expected behavior and edge cases.

2. RED - Write a failing test for the next test scenario in the list.

- Pick a single, highest priority test scenario to implement from that list.
- Write a failing test slice following closely the instructions in `references/testing-guidelines.md`. 
- Don't assume it fails, run the narrowest relevant test command and capture the failure. Make sure it demonstrates the missing behavior not an unrelated failure.

3. GREEN - Make the test pass.

- Write the minimum code needed to make the test pass.
- Avoid broad rewrites, speculative abstractions, unrelated cleanup, or extra behavior not covered by the test.
- Don't assume it passes, verify by running the narrowest relevant test command.

4. Repeat:

- Continue to step 2 with the next test scenario from the list.
- Stop if there are no more test scenarios in the list.

## Test Selection

- Use unit tests for isolated business rules, parsing, validation, calculations, and branch-heavy logic.
- Use integration tests for persistence, API boundaries, framework wiring, auth, serialization, queues, or cross-module behavior.
- Use end-to-end tests only for critical user flows or when lower-level tests cannot observe the behavior reliably.
- Use regression tests for bug fixes. Reproduce the bug with a failing test before fixing it.

## Reporting

When summarizing TDD work, include:

- The failing test added and the behavior it captured.
- The narrow command used to observe red and green.
- The production change made to satisfy the test.
- Any broader verification run, or why broader verification was not possible.
