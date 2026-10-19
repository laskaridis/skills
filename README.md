[![skills.sh](https://skills.sh/b/laskaridis/skills)](https://skills.sh/laskaridis/skills)

Opinionated skills for developers who want coding agents to discover the domain, produce tighter specs, generate more executable task plans, and perform safer refactors.

These skills are built for workflow with the following characteristics:

1. Use a strong reasoning model to explore the domain and think through a feature.
2. Lock that context into usable domain documents and a specification document.
3. Turn the spec into tightly scoped tasks to be implemented by low reasoning coding agents.
4. Disstill the business model and capture domain language and linguistic boundaries directly in the codebase.
5. Implement tasks using TDD (including refactoring), optionally within an AFK coding loop.
6. Review and clean-up the final implementation.

## Installation

Run these in the target project where you want the skills to be available:

```bash
# Install everything
npx skills add laskaridis/skills

# Install create-spec
npx skills add laskaridis/skills@create-spec

# Install ddd
npx skills add laskaridis/skills@ddd

# Install create-tasks
npx skills add laskaridis/skills@create-tasks

# Install tdd
npx skills add laskaridis/skills@tdd

# Install code
npx skills add laskaridis/skills@code
```

## Recommended workflow

I usually use these skills when delivering non-trivial features:

1. Use a high-reasoning model to discuss the problem until the business process, scope, and tradeoffs are clear enough to start structured discovery.
2. Use `create-spec` to preserve the agreed product and technical context as a feature spec.
3. Use `ddd` to capture domain language following the lingustic boundaries imposed by the business model.
4. Use `create-tasks` to break the spec into small implementation tasks for lower-reasoning coding agents.
5. Use `tdd` and `code` to safely implement each behavior in an AFK coding-loop.

## Notes and caveats

- `create-spec` is effective when the current conversation context already contains meaningful product and technical context.
- `create-tasks` is only as good as the spec you feed into it, so make sure you review `spec.md` before delegating implementation.
- `tdd` works best when the expected behavior is concrete enough to express as a failing test.
- `ddd` makes certain high-level (and reasonable) assumptions about your project strucutre. Make sure to read the skill before using it to establish compliance to your specific case.
- `code` assumes the presence of a task list.