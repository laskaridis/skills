- [intent_fidelity] Assess the actual meaning of BOTH the design and plan against the specification. Cover all required behaviors, error outcomes, constraints, and easily missed edge cases; introduce no unsupported behavior. Excluded capabilities mentioned only as exclusions are acceptable.
  A criterion ID in an array is not evidence that its behavior is implemented or verified. Cite specific task IDs, specification criterion IDs, and relevant text. Explain materially conflicting design/plan statements. Missing or unusable design/plan artifacts are ungradable.
  AC-001: new active reservation returns stable ID and correct event/attendee.
  AC-002: duplicate active attendee/event reuses ID and never consumes another seat even at capacity; EVENT_STARTED takes precedence at/after start.
  AC-003/004: full rejection is nonmutating; atomic capacity and duplicate handling under simultaneous calls.
  AC-005: unknown event and exact start boundary yield specified errors without mutation.
  AC-006/007: cancellation releases one seat, repeat releases none, missing ID has specified error.
  AC-008: original attendee rebooks with a fresh ID while cancelled history stays cancelled.
  AC-009: late active cancellation is refused without mutation; late repeat of cancelled is success; missing ID remains not found.
  AC-010/011: observable stable outcomes; controlled time; reproducible concurrency checks, no sleeps or network.
  In-process local service with in-memory state for one process; no application code exists.
  Architecture and low-level implementation choices belong to the implementor except constraints essential for atomicity, stable outcomes, and deterministic testing.
  Unsupported additions: waitlist; payments or refunds; seat selection or multi-seat reservations; notifications; authentication or authorization; HTTP endpoints or UI; database or restart persistence; event administration; expiry or background jobs.
- [verifiability] Every task has concrete, observable, locally verifiable completion criteria tailored to its outcome. “Works”, “tests pass”, “implement correctly”, or a list of criterion IDs is insufficient. Check boundary time, state nonmutation, duplicate/capacity, and deterministic concurrency evidence.
  Task-specific concrete inputs, outputs, invariants, and local checks; not merely criterion IDs or tests pass.
  Every task states its own observable outcome even when multiple criteria share a task.
  Checks collectively distinguish reuse versus fresh IDs, exact start boundaries, nonmutation on failure, released capacity, and concurrency consistency.
- [actionability] Tasks are cohesive vertical slices of value, traceable to the specification and executable autonomously. Necessary prerequisites are acceptable. Gratuitous file names, helper signatures, algorithms, code snippets, class layouts, or framework choices that constrain the implementor fail this requirement.
  Essential architectural constraints (atomic updates, small coherent interfaces, in-memory state, controllable time) are not excessive prescription. Architecture and low-level implementation choices belong to the implementor except constraints essential for atomicity, stable outcomes, and deterministic testing.
  Accept valid alternative architectures and decompositions: there is no reference architecture, required task count, or mandated task order. Do not penalize an implementation-neutral boundary or infer a missing prerequisite from a preferred decomposition.
- [dependency_correctness] Required prerequisites are explicit or transitively reachable. A task may provide its own prerequisite within one cohesive slice. Missing edges and unjustified ordering constraints both count as failures. Do not assume numbering, array order, or prose implies a dependency edge.
  Tasks exercising cancellation need creation/state capability, either within the same cohesive task or through transitive dependencies.
  Rebooking, released-seat, duplicate-at-capacity and concurrent final-seat checks need their corresponding reservation/capacity capabilities.
  Cross-capability verification must depend on capabilities it verifies, or be included with those capabilities.
  Do not require a fixed task count, architecture, layers, or order of independent capabilities. Judge transitive dependencies and alternative decompositions on their merits.
