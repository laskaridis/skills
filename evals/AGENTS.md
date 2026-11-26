# Evals code style

## Design

- Exported structures are part of the publused API of a module. Export anything that is
  used from an external module. Never export something simply to facilitate testing as
  this creates a leaky abstraction.

## Code style

- Prefix all functions private in a module by an underscore: `function _add(...)`.
- Place all exported constructs first in a module file, first types, then constants,
  then functions.
- Phrase names of functions that return boolean results (including type guards) as
  a question using prefixes such as "is", "has". Example: `isValidForm(...)`, `hasValidInput(...)`.

## Validation

- **ALWAYS** Run `pnpm check` before signing-off work.

## Documentation

- Use simple language and keep documents concise and short. No fluff or walls of text
  allowed. Use the least amount of text to convey the neccessary information.
- All moduels must have a comment on top of the file (before imports) that explains
  the modules purpose and responsibilities.
- Exported structures (classes, functions, types, etc) are part of the published API
  and must be documented using JDoc. Focus on intent and use, for instance: mention
  what a function does and what its arguments contain, what a type represents/encapsulates,
  any constraints, pre-conditions, post-conditions and invariants that meaningfully affect
  the caller.

## Tests

- Structure each test as arrange, act, assert. Do all setup first, then the action under test, then the assertions. Mark each section explicitly using BDD insired comments: `// Given`, `// When`, `// Then`.
- Separate those groups with a single blank line. Do not interleave setup between assertions.
- Group assertions by what they verify, and separate unrelated groups with a blank line.
- Declare one variable per statement (`const a = ...;` then `const b = ...;`).
- Separate top-level declarations and `test(...)` calls with a blank line.
