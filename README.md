[![skills.sh](https://skills.sh/b/laskaridis/skills)](https://skills.sh/laskaridis/skills)

Opinionated skills for developers who want coding agents to discover the domain, produce tighter specs, generate more executable task plans, and perform safer refactors.

These skills are built for a practical workflow with the following characteristics:

1. Uses a stronger reasoning model to explore the domain and think through the feature.
2. Locks that context into usable domain documents and a specification document.
3. Turns the spec into tightly scoped tasks for low reasoning coding agents.
4. Implements tasks using a TDD loop, optionally within a ralph loop (AFK).
5. Review and clean-up the final implementation with behavior-preserving refactorings.

## Why use these skills

Most agent workflows fail in one of two ways: either the intent stays vague, or the implementation tasks are too broad for a low-reasoning model to execute reliably.

This repo solves that by giving you a small pipeline of reusable skills:

- `event-storming` to discover the business domain, bounded contexts, events, commands, policies, and hotspots before implementation.
- `create-spec` to turn a long design discussion into a structured feature specification.
- `create-tasks` to turn that specification into small, verifiable implementation tasks.
- `tdd` to drive implementation with failing tests before production code changes.
- `refactor` to help you improve the final design without changing behavior.

The result is a workflow that is easier to review, easier to delegate, and less dependent on a single expensive model session.

## Installation

Run these in the target project where you want the skills to be available:

```bash
# Install event-storming
npx skills add https://github.com/laskaridis/skills --skill event-storming

# Install create-spec
npx skills add https://github.com/laskaridis/skills --skill create-spec

# Install create-tasks
npx skills add https://github.com/laskaridis/skills --skill create-tasks

# Install tdd
npx skills add https://github.com/laskaridis/skills --skill tdd

# Install refactor
npx skills add https://github.com/laskaridis/skills --skill refactor
```

If you need help with the CLI:

```bash
npx skills --help
```

## Recommended workflow

I usually use these skills when delivering non-trivial features:

1. Use a high-reasoning model to discuss the problem until the business process, scope, and tradeoffs are clear enough to start structured discovery.
2. Run `event-storming` to capture the domain model, language, decisions, and open questions under `docs/domain/`.
3. Run `create-spec` to preserve the agreed product and technical context as a feature spec.
4. Run `create-tasks` to break the spec into small implementation tasks for lower-reasoning coding agents.
5. Run `tdd` while implementing each behavior change so tests capture the intended behavior before production code changes.
6. Execute the tasks in your preferred agent loop.
7. Review the result and run `refactor` on the areas that need structural cleanup.

This is a good fit for feature work where you want a repeatable handoff between planning and implementation.

## Skills

### event-storming

Use `event-storming` when you need to discover or clarify the business domain before writing a spec or implementation plan.

What it does:

- facilitates a domain-driven design discussion one question at a time
- discovers bounded contexts, domain events, commands, actors, policies, read models, aggregates, external systems, hotspots, decisions, and ubiquitous language
- writes and continuously updates domain documents under `docs/domain/`
- keeps assumptions and unresolved questions explicit instead of silently inventing domain rules

Required input:

- a problem or business process to model
- enough user or repository context to answer domain questions accurately

Output:

- a `docs/domain/` structure containing shared and context-specific domain artifacts

Why it is useful:

- creates a durable domain model before implementation details take over the discussion
- exposes ambiguity, missing business rules, and ownership boundaries early
- gives downstream specification and task-generation steps better raw material

Example prompt:

```text
Use the event-storming skill to model the order cancellation flow and document the domain under docs/domain.
```

Best used when:

- the business workflow is still fuzzy or contested
- multiple actors, systems, or policy decisions are involved
- you want to identify bounded contexts and domain language before writing a feature spec

### create-spec

Use `create-spec` after you already have enough conversation context to describe a feature clearly.

**NOTE:** You may want to avoid using the agent's planning mode to build the context. Aligning with the model across all aspects of the implementation is critical and agents in planning mode are usually too eager to jump into implementation. Instead, I would advise to use a skill like [grill-me](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me), [grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) or something similar.

What it does:

- synthesizes the current session context into a specification document
- follows a fixed structure instead of dumping freeform notes
- pushes the output toward user value, constraints, requirements, assumptions, edge cases, and clarifications

Required input:

- a target directory where the spec should be created

Output:

- a `spec.md` file in the directory you provide

Why it is useful:

- gives you a durable artifact you can review with humans or agents
- reduces loss of context between planning and implementation
- makes downstream task generation much more reliable

Example prompt:

```text
Use the create-spec skill and write the specification under docs/checkout-redesign.
```

Best used when:

- the feature has already been discussed in depth
- the current session contains important product and technical context
- you want a spec that can be reviewed before implementation starts

### create-tasks

Use `create-tasks` when you already have a specification and want implementation-ready tasks.

What it does:

- reads a specification document in full
- converts it into a prioritized `tasks.json`
- creates small, tightly bounded tasks with explicit file scope, constraints, dependencies, assumptions, and acceptance criteria

Required input:

- the path to the specification file you want to convert

Output:

- a `tasks.json` file next to the specification

Why it is useful:

- produces tasks that are easier for low-reasoning agents to execute correctly
- makes review easier because each task is traceable to a story or requirement
- forces clearer scope boundaries and verification criteria

Example prompt:

```text
Use the create-tasks skill to split docs/checkout-redesign/spec.md into tasks.
```

Best used when:

- you want to hand work to a low-reasoning or faster coding model
- you want explicit acceptance criteria instead of vague implementation prompts
- you need a task plan that can be executed incrementally (for example within a ralph loop)

### tdd

Use `tdd` when you want implementation to follow a red-green-refactor loop.

What it does:

- clarifies the smallest observable behavior change
- finds the existing test pattern before adding new tests
- writes or identifies a failing test before production code changes
- implements only enough code to make the failing test pass
- refactors only while tests are green

Required input:

- the behavior to implement, fix, or change
- enough repository context to locate the relevant code and tests

Output:

- a code change driven by tests
- a summary of the red test, green implementation, and verification commands

Why it is useful:

- prevents agents from editing production code before behavior is specified
- catches regressions with executable examples
- keeps implementation slices small and reviewable

Example prompt:

```text
Use the tdd skill to fix duplicate line items being added to an order.
```

Best used when:

- you are implementing a new behavior
- you are fixing a bug and want a regression test first
- you are changing legacy code and need characterization tests before editing it
- you want refactoring to happen only after tests are green

### refactor

Use `refactor` when you want to identify improvement opportunities in a part of the codebase, or when you already know a specific area is hard to understand, duplicated, over-coupled, or structurally more complex than it needs to be.

What it does:

- helps identify concrete refactoring targets in a designated area of code
- refactors a designated area of code without changing behavior
- checks whether the area is covered by tests
- adds characterization tests first when coverage is missing
- prefers the smallest safe refactoring over broad cleanup

Required input:

- the code area to refactor
- any extra context that should shape the refactor

Output:

- a focused behavior-preserving refactor in the specified area

Why it is useful:

- keeps cleanup work disciplined instead of turning into opportunistic rewrites
- pushes the agent to justify structural changes
- emphasizes test-backed safety over aesthetics

Example prompt:

```text
Use the refactor skill to review src/orders/price-calculator.ts. Identify and fix the 3 most critical maintainability issues.
```

Best used when:

- you want the model to identify potential refactoring targets in a specific file, module, or subsystem
- you already know the area that needs improvement
- you want safer refactors with explicit scope control
- you want the model to optimize for maintainability

## Notes and caveats

- `event-storming` is for discovery and modeling. It should not be used to write code or invent missing business rules.
- `create-spec` is effective when the current conversation already contains meaningful product and technical context.
- `create-tasks` is only as good as the spec you feed into it, so make sure you review `spec.md` before delegating implementation.
- `tdd` works best when the expected behavior is concrete enough to express as a failing test.
- `refactor` works best when you point it at a concrete file, module, or subsystem instead of saying "clean up the codebase".
