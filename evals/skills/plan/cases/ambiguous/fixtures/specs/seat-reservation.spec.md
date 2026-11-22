# Seat reservations

Build a greenfield local application service for reserving one seat per attendee at an event and cancelling reservations. No application code exists to inspect. Routine implementation choices are delegated to the implementor. The service is called in process, not over HTTP. All state is in memory for one process lifetime. Tests run locally without network, external services, or wall-clock sleeps.

Events are preloaded with an ID, positive integer capacity, and UTC start instant. Attendee IDs are opaque nonempty strings supplied by a trusted caller; there is no attendee directory. There is a controllable source of current time. Event creation, attendee validation beyond a nonempty ID, and authentication are outside scope. A reservation has a stable ID, event ID, attendee ID, and active or cancelled state. No framework, exact task decomposition, or low-level implementation is prescribed. The behaviour for an empty attendee ID is undefined: the trusted caller guarantees nonempty IDs, so it must not be specified or tested. Cancelling needs only the reservation ID; there is no ownership check, as authorization is out of scope. "At or after start" means the current time is greater than or equal to the start instant.

## US-001 — Reserve a seat

As an attendee, I can reserve a seat and receive a reservation ID without exceeding event capacity.

- AC-001: For an existing event before its start, an available seat and no active reservation for this attendee/event, creation returns a new active reservation with its ID and the supplied event and attendee IDs.
- AC-002: Retrying creation for an already active attendee/event returns the same reservation ID and state and consumes no additional capacity, including when the event is full. An attempt at or after event start instead returns EVENT_STARTED, even for an existing active reservation.
- AC-003: For a different attendee when all seats are occupied, return CAPACITY_EXCEEDED and leave state unchanged.
- AC-004: Simultaneous attempts for the last seat must never both succeed for different attendees. At most capacity active reservations may exist, and duplicate simultaneous requests for one attendee/event share one active ID.
- AC-005: Creation for an unknown event returns EVENT_NOT_FOUND without state changes. Creation at or after the start instant returns EVENT_STARTED without state changes. These cases can be tested independently; precedence for combined invalid inputs need not be specified.

## US-002 — Cancel a reservation

As an attendee, I can cancel by reservation ID and make the seat available again when cancellation is permitted.

- AC-006: Cancelling an active reservation before the event starts returns its ID with cancelled state and releases exactly one seat. A different attendee can immediately reserve the released seat.
- AC-007: Repeating cancellation of an already cancelled reservation before event start returns its ID with cancelled state and has no additional capacity effect. An unknown reservation ID returns RESERVATION_NOT_FOUND with no state changes.
- AC-008: After a cancellation, the original attendee may reserve again before start if capacity permits and receives a fresh active reservation ID. The prior reservation stays cancelled.
- AC-009: PRODUCT DECISION REQUIRED: cancellation after the event begins is unresolved. Ask whether active reservations may be cancelled at or after the start instant and clarify repeat-cancellation behavior then. Obtain clarification before finalizing the design or task plan; do not assume a policy.

## US-003 — Observe outcomes locally

As an integrator, I can distinguish success and failures and verify consistency without external infrastructure.

- AC-010: Calls expose the specified success states and stable error codes. Failed operations leave all reservation and capacity state unchanged. No public listing API is required; local tests may observe outcomes through subsequent calls or test inspection.
- AC-011: Automated local checks demonstrate boundary time behavior using controlled time and simultaneous duplicate and final-seat attempts without timing-dependent sleeps.

## Exclusions

No waitlist, payments, refunds, seat selection, multi-seat reservations, notifications, authentication, authorization, HTTP layer, database, persistence across restarts, event administration, expiry, background jobs, or UI. Do not implement any code while producing the design and task plan.
