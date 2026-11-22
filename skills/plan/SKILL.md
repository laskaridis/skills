---
name: plan
description: Convert a specification document into a list of tasks that can be executed by a coding agent. Use this skill when you have a specification document and want to break it down into actionable tasks for a coding agent to implement.
argument-hint: <path to spec>
---

## Goal

Convert a specification file into an implementation task plan which coding agents can follow to produce a feature aligned to the given specifications. The task plan must assume that it will be implemented without the mediation of a human developer.

## User input

The user is REQUIRED to provide a specification file. If none has been provided then stop and ask the user.

Optionally, the user may explicitly provide additional context documents to further specify intent. If they do, reference them from the plan following the expected output rules.

## What does a good plan look like?

1. **Correctness.** It steers coding agents to produce the intended feature by specifying what must be true and what constraints must hold.

2. **Autonomy.** It does not prescribe how the code must be written. Agents can implement each task without asking for clarifications.

3. **Verifiability.** It explains how success for each task will be demonstrated in a practical and unambiguous way.

4. **Architectural alignment.** Aligns with the established (or desired) architectural decisions, constraints and conventions of the system.

## Core rules

1. Size tasks by cohesive capability, not by acceptance criterion. A task may cover many acceptance criteria and vice versa.
2. Each task must enable some story or acceptance criterion mentioned in the specification.
3. Each task must have clear, unambiguous and locally verifiable completion criteria which verify observable behavior.
4. Identify any decisions that cannot safely be delegated to an implementation agent, such as module boundaries in a codebase with no established architecture.
5. Do not resolve significant ambiguity yourself, instead ask the user for clarifications as needed.

## Workflow

### 1. Understand.

**Goal:** Gain enough knowledge so you can split the specification into a task plan that delivers the intended feature and complies with the project's domain language, architecture, conventions and quality characteristics.

Before you write any tasks:

- Read the user-provided spec file and all user-designated supporting context documents to understand the broader context.
- Inspect the relevant codebase as needed to build understanding. Treat observations about code as provisional as they may change during task execution.
- Make sure you look for and read any relevant context about:
  - Project architecture
  - Domain language used
  - Project conventions

### 2. Design.

**Goal:** Identify appropriate implementation boundaries around which tasks can be sliced.

- **Identify key architectural drivers:**

  * Determine which requirements, quality attributes or constraints materially influence the design.
  * If they cannot be assessed through the existing context verify with the user, don't invent them.
  * If the project or the specification already defines an architecture, use it.

- **Identify key architectural risks and uncertainties:**

  * Examine integration boundaries, dependencies, data consistency, compatibility, and testability.
  * Decide which assumptions require early validation, potentially through a tracer bullet.

- **Establish implementation boundaries:**

  * Identify the main axis of change in the system. These dictate boundaries that need to be kept minimal and stable to minimize friction.
  * Identify the minimal set of existing or new boundaries (modules, APIs, state ownership, consistency) that will need to change or be added to deliver the desired behaviour, including their responsibilities, interfaces and dependencies.
  * Prefer deep modules offering broad functionality through small, simple interfaces (minimise surface areas).
  * Prefer cohesive, loosely coupled modules with a single reason to change.
  * Add a module only when it isolates an external boundary or a responsibility that would otherwise be mixed into another, functionally unrelated module.

- **Explore design alternatives (when warranted):**

  * Do this only when a consequential decision is genuinely contestable, meaning more than one plausible approach exists and the choice materially affects the design. Otherwise skip it.
  * Compare the proposed approach against one plausible alternative, evaluate trade-offs and select the simplest approach that satisfies them.
  * Skip decisions already settled by established conventions or decisions, and decisions where one approach is clearly sufficient.
  * Record any alternative you weighed, and why it was not selected, in the design document.

- **Evaluate your design:**

  * Use guidelines found in `references/design-evaluation.md` to evaluate your design decisions.
  * This step is **MANDATORY** before proceeding to decomposing the plan.

- **Expected output:**

  * Capture your design findings in `<feature-name-slug>.design.md` located in the same folder as the specification.
  * Use the structure defined in `references/design-template.md`.

**IMPORTANT:** If the design requires a product or architectural choice the specification does not settle, ask the user.

### 3. Decompose.

**Goal:** Decompose the specification into a prioritized list of tasks that a code agent can implement.

- Follow the implementation boundaries established by the design.
- Focus each task on one cohesive, vertical slice of independently verifiable observable value. A task may cross architectural layers.
- Every task must contribute directly to at least one story or acceptance criterion, or be a necessary prerequisite for delivering one.
- Leave implementation details to the implementor. Include implementation guidance ONLY when critical to preserve established architectural decisions, contracts, or compatibility requirements.
- Schedule tasks with the highest technical risk as early as their dependencies allow.

**Expected output:**

- Write the plan into a valid JSON file - no markdown, no prose, no comments.
- Use `references/plan-template.json` schema EXACTLY.
- Unless instructed otherwise from the user:
  * Place the task plan in the same directory as the specification.
  * Base the task plan name on the specification. Example: if the spec is named `<feature-name-slug>.spec.md` then name the task plan as `<feature-name-slug>.plan.json`.
- Always emit `context_documents` as an array; use `[]` when no supporting documents apply.
- Populate `context_documents` ONLY with supporting files explicitly specified by the user.
- Give each entry in `context_documents` a repository-root-relative `path` and a non-empty, one-sentence `purpose` describing how it guides implementation. Do not restrict document types or copy document contents into the plan.
- Default `status` is always `pending`.

### 4. Verify.

**Goal:** Ensure that the task plan delivers the specified value following the project's architecture and conventions.

Before returning, verify that all of the following conditions are satisfied:

- Every specification acceptance criterion is covered by at least one task.
- All tasks collectively implement the specified feature.
- No task introduces behaviours unsupported by the specification.
- Output is valid JSON file, named appropriately and placed in the correct location.
- `specification_document`, `design_document` and all context document paths are repository-root-relative and resolve to existing, readable files.
- No material contradictions remain unresolved between the specification, design, supporting documents, and task plan.
- Each task enabled at least one user story or one acceptance criterion.
- Task dependencies reference valid IDs and there are no circular dependencies between tasks.
- Every task has one cohesive, specific and unambiguous outcome that aligns with the specification.
- Every task has clear, unambiguous completion criteria that can be locally verified.
- No task dictates low-level implementation details that constrain the implementor.
- The task plan can be executed by an autonomous coding agent without human steering.
