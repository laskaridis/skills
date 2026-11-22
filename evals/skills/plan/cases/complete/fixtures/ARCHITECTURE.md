# Architecture

Standing conventions for this project. They apply to all features.

## Language and tooling

- TypeScript on Node 22 (installed in the workspace), ES modules.
- Tests use the built-in `node:test` runner.
- No runtime dependencies and no frameworks.

## Concurrency

- One process with a single-threaded runtime and no worker threads.
- Public operations are asynchronous and return promises. Callers may overlap calls on one service instance, so "simultaneous" means overlapping in-flight asynchronous calls.
- Any check-then-change sequence must remain atomic across awaits.

## Errors

- Domain failures are returned as values that carry a stable error code. They are never thrown.
- Thrown errors are reserved for programmer mistakes, such as violated preconditions.

## Time

- Current time comes from an injected clock. Domain code never reads ambient wall-clock time.
- Tests control the clock.

## Testing

- Tests are deterministic: no sleeps, no network, no external services.
- Concurrent scenarios are coordinated with explicit deferred promises or latches, not timing.

## Design

- Prefer small, cohesive modules.
- Dependencies point inward toward stable contracts.
- Modules do not import another module's internals; they use its published interface.
- Add a module only for a real boundary, not for speculative flexibility.
