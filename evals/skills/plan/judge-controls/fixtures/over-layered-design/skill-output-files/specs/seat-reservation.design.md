# Seat reservation service design

## References

* specs/seat-reservation.spec.md
* ARCHITECTURE.md

## Key architectural drivers

* In-process service with in-memory state for one process lifetime (spec overview, exclusions): no transport, persistence or external-service boundary exists, so none is designed.
* Atomic capacity and duplicate guarantees (AC-002, AC-003, AC-004): checking capacity, looking up an active reservation and creating one must be a single indivisible step, so the reservation state has exactly one owner that exposes whole operations only.
* Event-start rules and controlled time (AC-002, AC-005, AC-009, AC-011): every operation reads one instant from an injectable time source, so tests can place time exactly on the start instant without sleeps.
* Stable outcomes with no mutation on failure (AC-010): every outcome is decided before any state change is applied, so a failed operation cannot leave partial state.

## Key decisions and trade-offs

- A reservation facade is the only entry point and holds the atomic step: it decides the outcome from consistent state and applies the whole change as one step, so failures never mutate state; the trade-off is that every call goes through the facade.
- Reservation records and seat counts live behind a repository abstraction with a pluggable storage interface, for flexibility; the trade-off is an extra contract with the in-memory implementation as the only one provided.
- Capacity, duplicate and event-start rules are expressed as interchangeable policy strategies behind a policy layer, for extensibility, with one default strategy each; the trade-off is that the rules are spread across strategies.
- The facade publishes internal reservation-created and reservation-cancelled events on an internal event bus, so future components can react without changing the facade, for extensibility; the trade-off is an extra delivery step with no subscribers today.
- Current time comes from an injected time source read once per operation, so tests set exact boundaries; the trade-off is that callers must always provide a time source.
- Reservations are never reused: cancelled reservations stay as history and a rebooking creates a fresh ID, so history stays accurate; the trade-off is that cancelled records remain in memory.
- Outcomes are returned as values from a closed set of success states and the stable error codes EVENT_NOT_FOUND, EVENT_STARTED, CAPACITY_EXCEEDED and RESERVATION_NOT_FOUND, so callers can distinguish them; the trade-off is that callers must check every result.

## Module changes

### Reservation Facade (new)

**Responsibility:** Single entry point that runs each reserve or cancel as one atomic step across the repository and policies, and owns the atomic capacity and duplicate coordination boundary.

**Collaborators:**

- Reservation Repository: reads and writes reservation state and looks up the preloaded events (ID, capacity, UTC start instant) through its storage interface.
- Reservation Policy Layer: asks the strategies for capacity, duplicate and event-start decisions.
- Internal Event Bus: publishes internal reservation events after a change is applied.
- Time source: supplies the current UTC instant through a one-method contract.

**Interfaces:**

- Reserve seat (event ID, attendee ID): returns the new or existing active reservation, or a stable error code.
- Cancel reservation (reservation ID): returns the cancelled reservation or a stable error code.
- Inspect reservations (read-only, for tests): reports reservation states and occupied seats.

**Scope of change and rationale:**

- New module that fronts the other modules so callers use one small interface and never touch state, policies or the bus directly.

### Reservation Repository (new)

**Responsibility:** Own the mutable reservation records and per-event occupied-seat counts, and hold the preloaded event data (event ID, positive capacity, UTC start instant) that it is given when created and never changes, behind a storage interface.

**Collaborators:**

- Reservation Facade: the only caller, through the storage interface.

**Interfaces:**

- Storage interface (find event by ID, find active reservation, find by ID, add, mark cancelled, count occupied seats): the contract the facade uses, with one in-memory implementation. Find event by ID returns the event's ID, capacity and UTC start instant, or reports that the event is unknown so the facade can return EVENT_NOT_FOUND.

**Scope of change and rationale:**

- New abstraction so the storage representation can be swapped for flexibility. Representation changes stay inside the repository and do not propagate to the facade's callers.

### Reservation Policy Layer (new)

**Responsibility:** Provide the interchangeable capacity, duplicate and event-start decision strategies.

**Collaborators:**

- Reservation Facade: the only caller, passing it a decision view built from the repository and the time source.

**Interfaces:**

- Decision view (read-only, built by the facade for each operation): exposes the event's capacity and UTC start instant, the current UTC instant, the number of occupied seats for the event, and the attendee's active reservation for the event if any. It is the only input strategies receive, so they never depend on how the repository represents state.
- Capacity strategy, duplicate strategy and start-time strategy: each takes the decision view and returns a decision for the facade to apply.

**Scope of change and rationale:**

- New layer so the rules can be replaced for extensibility. Each strategy has one default implementation that encodes the specified rule.

### Internal Event Bus (new)

**Responsibility:** Deliver internal reservation-created and reservation-cancelled events from the facade to any registered handlers.

**Collaborators:**

- Reservation Facade: the only publisher.

**Interfaces:**

- Publish event and register handler: one-way delivery with no return value to the publisher.

**Scope of change and rationale:**

- New bus so future components can extend behaviour without modifying the facade. No handlers are registered in this feature.

## Key risks and uncertainties

* Concurrent attempts for the last seat or duplicate requests for one attendee could both succeed if the check and the update are separable. This is mitigated by making them one indivisible step and by validating it early with deterministic, reproducible interleavings in the first capacity-bearing slices rather than at the end.
* Boundary-time behaviour (at, just before and just after the start instant) differs between reserve and cancel, and an inconsistent comparison would break AC-005 and AC-009. This is mitigated by a single time-comparison rule and exact-boundary checks driven by the controlled time source.
