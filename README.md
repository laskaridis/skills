[![skills.sh](https://skills.sh/b/laskaridis/skills)](https://skills.sh/laskaridis/skills)

Opinionated skills for developers who want to steer coding agents to discover the domain, produce tighter specs, generate more executable task plans, write verifiable code, and independently verify the results.

## Installation

Run these in the target project where you want the skills to be available:

```bash
# Install everything
npx skills add laskaridis/skills

# Install specify
npx skills add laskaridis/skills@specify

# Install ddd
npx skills add laskaridis/skills@ddd

# Install plan
npx skills add laskaridis/skills@plan

# Install tdd
npx skills add laskaridis/skills@tdd

# Install verify
npx skills add laskaridis/skills@verify

# Install doc-gardening
npx skills add laskaridis/skills@doc-gardening

# Install gh-review-pr
npx skills add laskaridis/skills@gh-review-pr
```

## Recommended workflow

I usually use these skills when delivering non-trivial features:

1. Use a high-reasoning model to discuss the problem until the business process, scope, and tradeoffs are clear enough to start structured discovery.
2. Use `specify` to preserve the agreed product and technical context as a feature spec.
3. Use `ddd` to capture domain language following the linguistic boundaries imposed by the business model.
4. Use `plan` to break the spec into a task list plan.
5. Use `tdd` to implement each behavior in an AFK coding-loop.
6. Use `verify` to independently verify each task.
7. Use `doc-gardening` to verify that the project's documentation still matches the code, either ad hoc or on a schedule.
8. Use `gh-review-pr` to get a thorough, read-only review of a pull request posted directly as inline GitHub comments.

## Notes and caveats

- `specify` is effective when the current conversation context already contains meaningful product and technical context.
- `plan` is only as good as the spec you feed into it, so make sure you review `spec.md` before delegating implementation.
- `ddd` makes certain high-level (and reasonable) assumptions about your project structure. Make sure to read the skill before using it to establish compliance to your specific case.
- `gh-review-pr` never edits the codebase or the PR branch; it only reads and posts a GitHub review (inline comments plus a sign-off). It requires the `gh` CLI to be authenticated against the target repository.

## Evaluations

The [evaluation harness and setup guide](evals/README.md), [plan suite](evals/skills/plan/README.md),
and [evaluation specifications](evals/specs/) live under `evals/`, along with all
Node.js package metadata, dependencies, and development tooling.
