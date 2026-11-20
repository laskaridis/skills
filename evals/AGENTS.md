# Evals code style

Run `pnpm lint:fix && pnpm format`, then `pnpm lint`, `pnpm typecheck`, and
`pnpm test` before finishing. ESLint enforces blank-line and one-declaration
rules; the conventions below are not machine-checkable.

## Tests

- Structure each test as arrange, act, assert. Do all setup first, then the action under test, then the assertions. Mark each section explicitly using BDD insired comments: `// Given`, `// When`, `// Then`.
- Separate those groups with a single blank line. Do not interleave setup between assertions.
- Group assertions by what they verify, and separate unrelated groups with a blank line.
- Declare one variable per statement (`const a = ...;` then `const b = ...;`).
- Separate top-level declarations and `test(...)` calls with a blank line.
