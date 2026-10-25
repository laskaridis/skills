---
name: create-tasks
description: Convert a specification document into a list of tasks that can be executed by a coding agent. Use this skill when you have a specification document and want to break it down into actionable tasks for a coding agent to implement.
argument-hint: Where is the specification document located that you want to convert into tasks?
---

## Goal

Convert a specification file into an implementation task plan which coding agents can follow to produce a feature aligned to the given specifications.

The task plan must assume that it will be implemented without the mediation of a human developer.

The output must contain coherent, tightly bounded, implementation-ready tasks with clear verifiable acceptance criteria.

## Prerequisite

The user is required to provide a specification file. If none has been provided then stop and ask the user to provide one.

## Core rules

1. Stories are broken down into tasks. Each task must be traced back to one story and at least one acceptance criterion.
2. Each task must have one clear, specific and unambiguous objective. Avoid unclear, vague and ambiguous task goals that would allow the model to interpret.
3. Each task must include clear, unambiguous and locally verifiable acceptance criteria which verify observable behavior.
4. Do not resolve ambiguity yourself. Ask the user for clarifications as needed:
  * If you identify ambiguity in the specs which materially affects architecture, behavior, or task decomposition, stop and ask the user for clarification.
  * If you identify a gap in the specifications that would make it impossible to implement or verify a task, stop and ask the user for clarification.
  * Otherwise, make conservative assumptions and explicitly document them in `assumptions`.

## Workflow

### 1. Understand.

Goal: Gain enough knowledge so you can split the specification into a task plan that delivers the intended feature and complies to the project's domain language, architecture, conventions and quality characteristics.

Before you write any tasks:

- Read the user-provided spec file and task list to understand the broader context.
- Inspect the relevant codebase as needed to build understanding. Treat observations about code as provisional as they may change during task execution.
- Make sure you look for and read any relevant context about:
  - Project architecture
  - Ubiquitous domain language used
  - Coding and testing guidelines
  - Project conventions

### 2. Decompose.

Goal: Decompose the spec into a prioritized list of tasks.

- Break down each user story into prioritized tasks.
- Derive tasks directly from a story's acceptance criteria. If a task cannot be directly traced back to a specific user story and acceptance criterion reject it.
- For each task prefer the smallest coherent slice of independently verifiable behavior.
- A task may cross architectural layers to implement and verify that behavior end-to-end.
- Leave implementation choices to the implementor.
- Include implementation guidance ONLY when critical to preserve established architectural decisions, contracts, or compatibility requirements.
- Write the plan into a valid JSON file - no markdown, no prose, no comments.
- Unless instructed otherwise from the user:
  - Place the task plan in the same directory as the specification.
  - Base the task plan name on the specification. Example: if the spec is named `<spec name>.spec.md` then name the task plan as `<spec name>.plan.json`.
- Use the following schema EXACTLY:
  ```json
  {
    "spec_path": "<path to the specification file relative to current repo root>",
    "tasks": [
      {
        "id": "TASK-001",
        "title": "<less or equal to 80 characters, imperative>",
        "objective": "<1 sentence description of what needs to be accomplished>",
        "status": "<pending|completed>",
        "story_addressed": "<the id of the user story or requirement this task traces back to>",
        "acceptance_criteria_addressed": [
          "<the id of the functional or non-functional acceptance criterion this task traces back to>"
        ],
        "acceptance_criteria": [
          "<clear and locally verifiable condition for this task to be complete>"
        ],
        "out_of_scope": [
          "<description of anything that is explicitly out of scope for this task>"
        ],
        "existing_context": [
          "<description of any relevant existing code, architecture, or design that should be taken into account when implementing this task>"
        ],
        "constraints": [
          "<description of anything critical that must constrain this implementation>"
        ],
        "assumptions": [
          "<any assumptions you are making about the implementation, the codebase, or the specifications that should be documented for future reference>"
        ],
        "verified_by": [
          "Automated test verifying that duplicate wishlist additions do not create duplicate entries",
          "Existing regression tests pass"
        ],
        "dependencies": []
      }
    ]
  }
  ```

### 3. Verify.

Goal: Ensure that the task plan delivers the specified value following the project's architecture and conventions.

Before returning, verify that all of the following conditions are satisfied:

- Every specification acceptance criterion is covered by at least one task.
- The combined tasks preserve the specified behaviour, including failure cases, invariants and boundary conditions.
- Reject tasks that introduce behaviour unsupported by the specification.
- Output is valid JSON file, named appropriately and placed in the correct location.
- Each task can be traced back directly to a user story and acceptance criterion explicitly mentioned in the task.
- Task dependencies reference valid IDs and there are no circular dependencies between tasks.
- Every task has one clear, specific and unambiguous outcome that aligns with the specification.
- Every task has a small, clear and tightly bounded file scope.
- Every task has clear, unambiguous and verifiable acceptance criteria.
- No task dictated low-level implementation details that constraint the implementor.
- The task plan can be executed by an autonomous coding agent without human steering.
