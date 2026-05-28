---
name: refactor
description: Refactors code to improve its design, structure, and maintainability without changing its behavior. Use this skill when you identify code that could be improved in terms of readability, simplicity, or adherence to design principles, and you want to refactor it to enhance its quality.
---

# Refactor Skill

Use this skill when code is hard to understand, hard to test, duplicated, over-coupled, or structurally more complex than the problem requires.

Do not refactor merely because code is stylistically imperfect.

## Input

The caller must identify the code area subject to refactoring. If the caller does not provide this, stop and ask.

If the caller also provides additional context, you must **ALWAYS** take it into account before refactoring.

## Your workflow 

1. Scan the part of the codebase specified by the user to identify the smallest affected areas.
2. State the smell or maintainability problem for each.
3. Check if the affected areas are covered by existing tests.
4. If coverage is missing, add characterization tests first.
5. Prefer the smallest safe refactoring making one conceptual change at a time.
6. Run relevant tests.
7. Summarize what changed and why behavior is preserved.

## Constraints 

- Preserve behavior
- Refactor only if the resulting code is simpler, clearer or more succinct
- Avoid changing public APIs unless explicitly requested
- Avoid introducing design patterns only for aesthetics
- Avoid refactoring unrelated code opportunistically
- Avoid changing code formatting across large files unless required.
- Avoid optimizing performance unless the refactoring's scope is performance-oriented
- Safety first, simplicity and clarity next

## Code Smells

Treat code showing any of the following characteristics as a potential candidate for refactoring.

Note: Words in CAPITAL LETTERS in this document (i.e. FACTORY METHOD, STRATEGY, COMPOSITE, etc.) identify GoF design patterns.

### 1. Duplicated code

Identical code or code which is outwardly different yet serves the same intent and produces the same outcome.

Potential refactorings that fix it:

- Extract intention-revealing method/function
- Parameterize method/function.
- Pull-Up method/function to a common superclass or module.
- Chain constructors
- Form TEMPLATE METHOD
- Introduce polymorphic creation with FACTORY METHODs
- Extract COMPOSITE
- Unify interfaces with ADAPTER

### 2. Long method/function

A long method/function is problematic when it mixes abstraction levels, reasons to change, or responsibilities.

Potential refactorings that fix it:

- Extract intention-revealing method/function
- Replace temporary variable with named query
- Compose the method into a small sequence of clear steps
- Replace conditional logic with STRATEGY
- Move accumulation to collecting parameter or VISITOR
- Replace conditional dispatcher with COMMAND

### 3. Conditional complexity

Conditionals are problematic when they obscure intent or repeat the same branching logic.

Potential refactorings that fix it:

- Decompose conditional
- Extract predicates
- Consolidate equivalent conditional branches 
- Replace conditional with polymorphism or sealed variants
- Replace conditional logic with STRATEGY
- Move embellishment to DECORATOR
- Replace state-altering conditionals with STATE
- Introduce Null Object

Use Null Object only when “absence” has stable, well-defined behavior.

### 4. Primitive obsession

Primitive values are problematic when they represent domain concepts with invariants.

Potential refactorings that fix it:

- Introduce value object
- Introduce named constants for meaningful literals
- Introduce parameter objects for recurring argument groups
- Replace primitive closed type sets with enum/class
- Encapsulate collections
- Replace implicit tree with COMPOSITE
- Replace implicit language with INTERPRETER

Avoid wrapping primitives when no invariant, behavior, or clarity is gained.

### 5. Indecent exposure

Breach of information hiding. When methods or classes that ought not to be visible to clients are accessible to them. As a ground rule, always use the stricter visibility needed for classes and class members. Give access to them only when clients truly need them.

Potential refactorings that fix it:

- Reduce visibility
- Expose intention-revealing operations instead of raw state
- Hide collaborator chains
- Encapsulate classes with FACTORY

### 6. Solution sprawl

Violation of single responsibility principle. Responsibility becomes sprawled across numerous classes.

Potential refactorings that fix it:

- Move method/member/field to owner of responsibility
- Extract cohesive class
- Introduce FACADE
- Move creation knowledge to FACTORY

### 7. Alternative classes with different interfaces

Classes with similar roles but inconsistent interfaces increase cognitive load.

Potential refactorings that fix it:

- Align naming first if inconsistent
- Extract a shared interface when classes provide same capability
- Unify interfaces with ADAPTER

### 8. Lazy class

A class is lazy when it adds indirection without meaningful responsibility.

Potential refactorings that fix it:

- Inline class
- Merge trivial wrappers
- Remove obsolete abstractions
- Inline SINGLETON

Keep the class if it marks an important domain concept or protects an architectural boundary.

### 9. Large class

A large class is problematic when it has multiple responsibilities or unstable areas of change.

Potential refactorings that fix it:

- Extract class or superclass by responsibility
- Move behavior to appropriate collaborators
- Extract role-specific interfaces
- Replace state-altering conditionals with STATE
- Replace conditional dispatcher with COMMAND
- Replace implicit language with INTERPRETER

Avoid creating many anemic classes.

### 10. Switch statements

Repeated switches over the same type, status, or category often indicate misplaced behavior.

Potential refactorings that fix it:

- Replace with lookup tables
- Replace conditional with polymorphism or sealed variants
- Replace conditional logic with STRATEGY
- Replace conditional dispatcher with COMMAND
- Replace state-altering conditionals with STATE

Keep a switch when it is exhaustive, local, readable, and unlikely to change.

### 11. Combinatorial explosion

Combinatorial class or method variants indicate the model is encoding combinations poorly.

Potential refactorings that fix it:

- Replace inheritance with composition
- Introduce parameter, feature or configuration object
- Model each axis of behavior variation using an independent STRATEGY or FACTORY.

### 12. Oddball solution

One-off implementations are suspicious when the codebase already has a standard way to solve the same problem.

Potential refactorings that fix it:

- Substitute algorithm
- Extract shared abstraction
- Unify interfaces with ADAPTER

## Default Refactoring Priority

Prefer these first:

- Rename unclear identifiers.
- Extract function/method.
- Inline unnecessary indirection.
- Remove duplication.
- Split mixed responsibilities.
- Move behavior closer to the data it uses.
- Simplify conditionals.
- Replace primitive domain concepts with value objects.
- Introduce polymorphism or patterns only when simpler refactorings fail.

## Design Pattern Gate

Before introducing a design pattern, answer:

- What concrete duplication or volatility does it remove?
- Why are rename/extract/move/inline insufficient?
- Will the pattern reduce total complexity for future maintainers?
- Are there tests proving equivalent behavior?

If any answer is weak, do not introduce the pattern.

## Verification

After you finish the refactoring check that **all** of the following are true:

[ ] Relevant tests pass
[ ] Behavior is preserved
[ ] The diff is focused
[ ] Code is clearer
[ ] Responsibilities are better localized
[ ] No new abstraction exists without a clear purpose
