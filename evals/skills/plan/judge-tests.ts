import type { Control } from '../../lib/types.ts';

const SPEC = 'specs/seat-reservation.spec.md';

const DESIGN = 'specs/seat-reservation.design.md';

const PLAN = 'specs/seat-reservation.plan.json';

// Structurally plausible but semantically bad: criterion labels deliberately hide omissions.
export function degradedPlan() {
  const task = (id: string, objective: string, dependencies: string[]) => ({
    id,
    objective,
    status: 'pending',
    stories_enabled: ['US-001', 'US-002', 'US-003'],
    acceptance_criteria_addressed: Array.from(
      { length: 11 },
      (_, i) => `AC-${String(i + 1).padStart(3, '0')}`,
    ),
    completion_criteria: ['Implement correctly; all tests pass.'],
    constraints: [],
    dependencies,
  });
  return {
    specification_document: SPEC,
    design_document: DESIGN,
    context_documents: [
      {
        path: 'ARCHITECTURE.md',
        purpose:
          "Project's standing conventions for language, errors and testing.",
      },
    ],
    tasks: [
      task(
        'TASK-001',
        'Verify rebooking and cancellation of existing reservations in isolation before reservation creation exists.',
        [],
      ),
      {
        ...task(
          'TASK-002',
          'Create reservations and add a waitlist with notification emails.',
          ['TASK-001'],
        ),
        constraints: [
          'Create src/ReservationManager.js with exactly three public methods reserveSeat(eventId, attendeeId), enqueueWaitlist(eventId, email), sendEmail(email). Use a two-pass for loop and a Map named seatIndex; no alternative layout is allowed.',
        ],
      },
    ],
  };
}

const REQUIREMENTS = [
  'covers_reservation',
  'covers_cancellation',
  'covers_testability',
  'no_unsupported_scope',
  'design_plan_consistent',
  'drivers_have_consequences',
  'decisions_have_rationale',
  'risks_have_mitigation',
  'module_responsibilities',
  'state_and_atomicity_ownership',
  'policy_change_local',
  'time_rule_testable',
  'storage_hidden',
  'incremental_evolution',
  'design_coupling_cohesion',
  'design_simplicity',
  'criteria_concrete_per_task',
  'edge_cases_verified',
  'tasks_cohesive_slices',
  'not_overprescribed',
  'required_edges_present',
  'no_spurious_edges',
  'risky_work_early',
  'design_document_contract',
];

const DRIVERS = `## References

* specs/seat-reservation.spec.md
* ARCHITECTURE.md

## Key architectural drivers

* In-process service with in-memory state for one process lifetime (spec overview, exclusions): no transport, persistence or external-service boundary exists, so none is designed.
* Atomic capacity and duplicate guarantees (AC-002, AC-003, AC-004): checking capacity, looking up an active reservation and creating one must be a single indivisible step, so the reservation state has exactly one owner that exposes whole operations only.
* Event-start rules and controlled time (AC-002, AC-005, AC-009, AC-011): every operation reads one instant from an injectable time source, so tests can place time exactly on the start instant without sleeps.
* Stable outcomes with no mutation on failure (AC-010): every outcome is decided before any state change is applied, so a failed operation cannot leave partial state.
`;

const RISKS = `## Key risks and uncertainties

* Concurrent attempts for the last seat or duplicate requests for one attendee could both succeed if the check and the update are separable. This is mitigated by making them one indivisible step and by validating it early with deterministic, reproducible interleavings in the first capacity-bearing slices rather than at the end.
* Boundary-time behaviour (at, just before and just after the start instant) differs between reserve and cancel, and an inconsistent comparison would break AC-005 and AC-009. This is mitigated by a single time-comparison rule and exact-boundary checks driven by the controlled time source.
`;

export function goodDesign() {
  return `# Seat reservation service design

${DRIVERS}
## Key decisions and trade-offs

- One cohesive module owns all reservation state, the capacity and duplicate rules and the event-start rule. These share a single atomic invariant, so splitting them would force cross-module coordination for no gain; the trade-off is that the module must keep these concerns internally separated.
- Current time comes from a time source supplied by the caller at construction and read once per operation. Tests set the time to exact boundaries; the trade-off is that callers must always provide a time source.
- Each operation decides its outcome from consistent state first and applies the whole change as one step. Failures therefore never mutate state, at the cost of resolving the outcome before touching anything.
- Reservations are never reused: cancelled reservations stay as history and a rebooking creates a fresh ID. Duplicate detection considers only the active reservation for an attendee and event.
- Outcomes are returned as values (never thrown, per ARCHITECTURE.md) from a closed set of success states and the stable error codes EVENT_NOT_FOUND, EVENT_STARTED, CAPACITY_EXCEEDED and RESERVATION_NOT_FOUND, so callers and tests can distinguish them without parsing messages.

## Alternatives considered

- Separate modules for state, rules and time: rejected because the atomic invariant spans state and rules, and a single in-process feature does not justify extra boundaries.

## Module changes

### Seat Reservations (new)

**Responsibility:** Own reservation and capacity state and apply the reserve and cancel rules atomically against event capacity and start time.

**Collaborators:**

- Time source: supplies the current UTC instant through a one-method contract; injected so tests control it.
- Preloaded events: the module is given each event's ID, positive capacity and UTC start when it is created; it reads them but never changes them.
- Callers (integrators and tests): invoke the published interfaces below in process.

**Interfaces:**

- Reserve seat (event ID, attendee ID): returns the new or existing active reservation, or a stable error code.
- Cancel reservation (reservation ID): returns the cancelled reservation or a stable error code.
- Inspect reservations (read-only, for tests): reports reservation states and occupied seats without exposing mutable internals.

**Scope of change and rationale:**

- New module, because no application code exists. It is the single place where capacity, duplicate and event-start rules change, and callers never touch seat counts or reservation records directly.
- Its internal representation of reservations may change without altering published outcomes, cancellation history or fresh-ID rebooking.

${RISKS}`;
}

// The good design plus speculative layers the specification never asks for.
export function overLayeredDesign() {
  return `# Seat reservation service design

${DRIVERS}
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

${RISKS}`;
}

export function goodPlan() {
  const task = (
    id: string,
    objective: string,
    stories: string[],
    criteria: string[],
    completion: string[],
    constraints: string[],
    dependencies: string[],
  ) => ({
    id,
    objective,
    status: 'pending',
    stories_enabled: stories,
    acceptance_criteria_addressed: criteria,
    completion_criteria: completion,
    constraints,
    dependencies,
  });
  return {
    specification_document: SPEC,
    design_document: DESIGN,
    context_documents: [
      {
        path: 'ARCHITECTURE.md',
        purpose:
          "Project's standing conventions for language, errors and testing.",
      },
    ],
    tasks: [
      task(
        'TASK-001',
        'A caller can reserve a seat for a preloaded event before it starts, and unknown or started events are refused, all under a test-controlled clock.',
        ['US-001'],
        ['AC-001', 'AC-005', 'AC-010', 'AC-011'],
        [
          'With a controlled time one second before the start instant, reserving for an event with free seats returns an active reservation with a new ID and the supplied event and attendee IDs.',
          'Reserving for an unknown event returns EVENT_NOT_FOUND and leaves the set of reservations and free seats unchanged.',
          'Reserving at exactly the start instant and one second after it returns EVENT_STARTED, creates no reservation and consumes no seat; reserving one second before the start still succeeds on the same event.',
          'All checks run locally by setting the controlled time directly, with no sleeps, wall-clock reads or network.',
        ],
        [
          'Current time must come only from a time source the test can set; events are preloaded with an ID, positive capacity and UTC start instant.',
        ],
        [],
      ),
      task(
        'TASK-002',
        'Capacity and duplicate rules hold for sequential calls: a full event refuses new attendees while an active attendee can safely retry.',
        ['US-001'],
        ['AC-002', 'AC-003'],
        [
          'On an event with capacity 1 holding one active reservation, a different attendee receives CAPACITY_EXCEEDED, no reservation is added and the existing reservation is unchanged.',
          'Retrying for an attendee who already has an active reservation returns the same reservation ID and active state, including when the event is full.',
          'On an event with capacity 2, a retry by the first attendee consumes no extra seat: a second attendee still succeeds and a third receives CAPACITY_EXCEEDED.',
          'At and after the start instant, a retry for an attendee with an active reservation returns EVENT_STARTED instead of the existing reservation, and the reservation stays active and unchanged.',
        ],
        [],
        ['TASK-001'],
      ),
      task(
        'TASK-003',
        'Simultaneous attempts cannot oversell the last seat or create two active reservations for one attendee, and this is demonstrated deterministically.',
        ['US-001'],
        ['AC-004', 'AC-011'],
        [
          'With one seat left, simultaneous attempts by two different attendees yield exactly one success and one CAPACITY_EXCEEDED, and active reservations never exceed capacity.',
          'Simultaneous duplicate requests by one attendee for one event all return the same reservation ID and together occupy exactly one seat.',
          'The checks force overlapping calls through a reproducible, deterministic interleaving and are repeated across several interleavings, with no sleeps, timing assumptions or network.',
        ],
        [
          'The capacity check, duplicate check and creation of the reservation must behave as one indivisible step with respect to other calls.',
        ],
        ['TASK-002'],
      ),
      task(
        'TASK-004',
        'A caller can cancel an active reservation before the event starts, which releases exactly one seat; repeats and unknown IDs are handled safely.',
        ['US-002'],
        ['AC-006', 'AC-007'],
        [
          'On a full event with capacity 2, cancelling one active reservation returns the same ID in cancelled state, then a different attendee can immediately reserve and the next new attendee receives CAPACITY_EXCEEDED, showing exactly one seat was released.',
          'Repeating the cancellation before the start returns the same ID in cancelled state and releases no additional seat: a further new attendee still receives CAPACITY_EXCEEDED.',
          'Cancelling an unknown reservation ID returns RESERVATION_NOT_FOUND and leaves all reservations and free seats unchanged.',
        ],
        [],
        ['TASK-002'],
      ),
      task(
        'TASK-005',
        'An attendee whose reservation was cancelled can book again and receives a fresh reservation while the old one stays cancelled.',
        ['US-002'],
        ['AC-008'],
        [
          'After cancelling, the original attendee reserving the same event before the start receives an active reservation whose ID differs from the cancelled one.',
          'Inspecting the earlier reservation afterwards shows it is still cancelled, and a further reserve by the attendee returns the fresh ID, not the cancelled one.',
          'When the event is full after cancellation, the original attendee rebooking receives CAPACITY_EXCEEDED and no reservation is added.',
        ],
        [],
        ['TASK-004'],
      ),
      task(
        'TASK-006',
        'Cancellation at or after the event start is refused for active reservations, remains idempotent for cancelled ones, and still reports unknown IDs.',
        ['US-002'],
        ['AC-009'],
        [
          'At exactly the start instant and one second after it, cancelling an active reservation returns EVENT_STARTED, the reservation stays active and the occupied seat count is unchanged.',
          'One second before the start instant, cancelling the same kind of active reservation still succeeds.',
          'Retrying the cancellation of an already cancelled reservation at and after the start returns the same ID in cancelled state with no capacity effect.',
          'Cancelling an unknown ID at and after the start returns RESERVATION_NOT_FOUND with no state change.',
        ],
        [],
        ['TASK-004'],
      ),
      task(
        'TASK-007',
        'Every success state and error code is distinguishable and every failure is shown not to change reservation or capacity state.',
        ['US-003'],
        ['AC-010', 'AC-011'],
        [
          'A table of failing calls covering EVENT_NOT_FOUND, EVENT_STARTED, CAPACITY_EXCEEDED and RESERVATION_NOT_FOUND for both reserve and cancel shows each returns its own stable code.',
          'For each failing call, the reservation records and free seats observed through the test inspection are identical before and after the call.',
          'The whole suite runs locally using only the controlled time source and deterministic concurrency checks, with no sleeps, network or external services.',
        ],
        [],
        ['TASK-003', 'TASK-005', 'TASK-006'],
      ),
    ],
  };
}

export const controls: Control[] = [
  {
    id: 'degraded-plan',
    caseId: 'complete',
    generatedFiles: {
      [PLAN]: JSON.stringify(degradedPlan(), null, 2),
      [DESIGN]:
        '# Design\nAn in-memory reservation service with a waitlist and email delivery. Cancellation tests ship before creation capability.',
    },
    finalResponse: 'The design and plan are finalized.',
    // The design and plan are both bad but agree with each other (waitlist,
    // email, cancellation checks before creation), so only their consistency
    // is expected to pass.
    expected: Object.fromEntries(
      REQUIREMENTS.map((id) => [
        id,
        id === 'design_plan_consistent' ? ('pass' as const) : ('fail' as const),
      ]),
    ),
  },
  {
    id: 'over-layered-design',
    caseId: 'complete',
    generatedFiles: {
      [PLAN]: JSON.stringify(goodPlan(), null, 2),
      [DESIGN]: overLayeredDesign(),
    },
    finalResponse:
      'The design and plan are written to specs/seat-reservation.design.md and specs/seat-reservation.plan.json.',
    // The design is complete and well formed, with identifiable state ownership,
    // coordination, event data and time source, and explicit contracts between
    // layers. Only the speculative layers are wrong, so only design_simplicity
    // is expected to fail.
    expected: Object.fromEntries(
      REQUIREMENTS.map((id) => [
        id,
        id === 'design_simplicity' ? ('fail' as const) : ('pass' as const),
      ]),
    ),
  },
];
