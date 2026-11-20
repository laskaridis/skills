import type { Control } from '../../lib/types.ts';
import { SPEC } from './checks.ts';

// A fully conforming document is essential for testing judge false negatives.
// Defective variants change one category at a time where possible, so a
// calibration disagreement points to a concrete blind spot.
export const goldenSpec = `# Feature Specification: Workshop RSVP

## Purpose / Big Picture

Members can see availability and their own reservation on an existing published workshop detail page, reserve one seat before the workshop starts, and cancel it before the start. The page shows the remaining number of seats, calculated from fixed capacity minus active reservations, without requiring live push updates.

## User stories

### US-001: See available seats and my reservation

As a member, I want to see remaining workshop seats and my own reservation status on the workshop detail page, so that I can decide whether to reserve. The page reads the current workshop and active reservations on each visit and reflects a completed reservation or cancellation immediately.

#### Acceptance criteria

- **AC-001:** Given a published workshop with capacity 3, one active reservation, and no reservation for the viewing member, when that signed-in member opens its detail page, then remaining seats is 2 and status is "Not reserved".
- **AC-002:** Given a member reserves or cancels one seat before the start, when the action succeeds or that member reopens the detail page, then the displayed remaining seats and "Reserved"/"Not reserved" reflect the current active reservations; cancelled reservations never consume seats.
- **AC-003:** Given a workshop whose start instant has passed, when the member opens its detail page, then remaining seats and their current reservation status are still displayed.

### US-002: Reserve one available seat

As a member, I want to reserve one seat at a workshop before it starts, so that I can attend. Each member can hold only one active seat per workshop. A repeated reservation stays "Reserved", including when full, without using another seat. A first-time full request returns "Fully booked" without mutation. Competing requests for the last seat cannot both succeed.

#### Acceptance criteria

- **AC-004:** Given a workshop not yet started with capacity 3 and one active reservation, when another member reserves a seat, then their status becomes "Reserved", one active reservation is added, and remaining seats becomes 1.
- **AC-005:** Given a member already has an active reservation, even when remaining seats is zero, when that member retries reserving the same workshop before its start, then the result is "Reserved", no new reservation is created, and remaining seats is unchanged.
- **AC-006:** Given a workshop not yet started with zero remaining seats and a member without an active reservation, when that member tries to reserve, then the result is "Fully booked", with no change to reservations or remaining seats.
- **AC-007:** Given a workshop not yet started with exactly one seat left, when two different unreserved members request that last seat concurrently, then exactly one becomes "Reserved", the other receives "Fully booked", exactly one seat is consumed, and remaining seats never goes below zero.
- **AC-008:** Given a workshop at or after its exact start instant, when a member tries to create a reservation, then the result is "Registration closed" with no change to reservations or remaining seats.

### US-003: Cancel and later rebook my seat

As a member, I want to cancel my own active reservation before the workshop starts, so that somebody else can take the seat. The first cancellation releases one seat; repeats release no additional seats. A member can reserve again before the start if space is available. Members cannot cancel other members' reservations.

#### Acceptance criteria

- **AC-009:** Given a workshop not yet started and a member's active reservation with zero remaining seats, when that member cancels it, then the member's status becomes "Not reserved", that reservation is inactive, and remaining seats becomes 1.
- **AC-010:** Given a member has already cancelled a reservation before the start, when they repeat cancellation, then the result remains "Not reserved" and no further seat is released.
- **AC-011:** Given a member tries to cancel a different member's active reservation before the start, when cancellation is requested, then that reservation and remaining seats are unchanged and the requesting member cannot cancel it.
- **AC-012:** Given a member cancelled their reservation and the workshop has not started and a seat remains, when they reserve again, then they become "Reserved" with one active seat and remaining seats decreases by one.
- **AC-013:** Given a workshop at or after its exact start instant and a member's active reservation, when they try to cancel, then the result is "Registration closed" with no change to reservations or remaining seats.

## Assumptions

- Members arrive via an already signed-in dashboard; the existing session supplies the acting member identity used for own-status and ownership checks. Building login or authentication is not part of this feature.
- The existing published workshop records provide capacity and a start instant.

## Out of Scope

- Automatic waitlisting or queuing when workshops are full.
- Email RSVP confirmations or reminders.
- Creating, publishing, or editing workshops.
- Payments, tickets, and push/live updates.

## Clarifications needed

None.
`;

function replaceOnce(value: string, from: string, to: string): string {
  if (!value.includes(from)) {
    throw new Error('Calibration anchor absent: ' + from.slice(0, 50));
  }

  return value.replace(from, to);
}

function between(
  value: string,
  begin: string,
  end: string,
  replacement: string,
): string {
  const start = value.indexOf(begin);
  const finish = value.indexOf(end, start + begin.length);

  if (start < 0 || finish < 0) {
    throw new Error('Calibration section anchor absent: ' + begin);
  }

  return value.slice(0, start) + replacement + value.slice(finish);
}

export const specimens = {
  complete: goldenSpec,
  omitted_cancellation: between(
    goldenSpec,
    '### US-003: Cancel and later rebook my seat',
    '## Assumptions',
    '',
  ),
  vague_criteria: between(
    goldenSpec,
    '- **AC-004:**',
    '### US-003: Cancel and later rebook my seat',
    '- **AC-004:** When a member attempts to reserve, then the system handles their request correctly.\n\n',
  ),
  horizontal_story: between(
    goldenSpec,
    '### US-001: See available seats and my reservation',
    '### US-002: Reserve one available seat',
    `### US-001: Add availability storage

For the storage layer, create an availability summary table for future display work. This story delivers only schema and storage changes, not a usable workshop detail page.

#### Acceptance criteria

- **AC-001:** Given capacity 3 and one active reservation, when a stored summary is queried, then its remaining count is 2.
- **AC-002:** Given a stored reservation is marked cancelled, when the summary is recomputed, then the cancelled reservation is not included.
- **AC-003:** Given a workshop whose start has passed, when the summary is queried, then it still returns a count.

`,
  ),
  obsolete_waitlist: replaceOnce(
    replaceOnce(
      goldenSpec,
      'A first-time full request returns "Fully booked" without mutation.',
      'A first-time full request is automatically queued on a waitlist.',
    ),
    '- Automatic waitlisting or queuing when workshops are full.',
    '',
  )
    .replace(
      '- **AC-006:** Given a workshop not yet started with zero remaining seats and a member without an active reservation, when that member tries to reserve, then the result is "Fully booked", with no change to reservations or remaining seats.',
      '- **AC-006:** Given a full workshop and an unreserved member, when the member tries to reserve, then the member is placed on the waitlist.',
    )
    .replace(
      '- **AC-007:** Given a workshop not yet started with exactly one seat left, when two different unreserved members request that last seat concurrently, then exactly one becomes "Reserved", the other receives "Fully booked", exactly one seat is consumed, and remaining seats never goes below zero.',
      '- **AC-007:** Given a workshop with one remaining seat, when two different unreserved members request it concurrently, then exactly one becomes "Reserved", the other is placed on the waitlist, exactly one seat is consumed, and remaining seats never goes below zero.',
    ),
  invented_email: replaceOnce(
    goldenSpec,
    '## Assumptions',
    `### US-004: Email an RSVP confirmation

As a member, I want a confirmation email after reserving, so that I have a record of my seat.

#### Acceptance criteria

- **AC-014:** Given a member successfully reserves a seat, when the reservation completes, then a confirmation email is sent to that member.

## Assumptions`,
  ),
  missing_assumption: between(
    goldenSpec,
    '## Assumptions',
    '## Out of Scope',
    '## Assumptions\n\nNone.\n\n',
  ),
};

const ids = [
  'completeness',
  'verifiable_stories',
  'vertical_stories',
  'superseded_decisions',
  'out_of_scope',
  'captured_assumptions',
];

function statuses(...failing: string[]): Control['expected'] {
  return Object.fromEntries(
    ids.map((id) => [id, failing.includes(id) ? 'fail' : 'pass']),
  );
}

function control(
  id: string,
  generated: string,
  ...failing: string[]
): Control {
  return {
    id,
    caseId: 'complete',
    generatedFiles: { [SPEC]: generated },
    finalResponse: 'Created specs/workshop-rsvp.spec.md.',
    expected: statuses(...failing),
  };
}

export const controls: Control[] = [
  control('correct-spec', specimens.complete),
  control('missing-story', specimens.omitted_cancellation, 'completeness'),
  control('vague-acceptance', specimens.vague_criteria, 'verifiable_stories'),
  control(
    'horizontal-story',
    specimens.horizontal_story,
    'completeness',
    'vertical_stories',
  ),
  control(
    'obsolete-waitlist',
    specimens.obsolete_waitlist,
    'completeness',
    'superseded_decisions',
  ),
  control(
    'invented-emails',
    specimens.invented_email,
    'completeness',
    'out_of_scope',
  ),
  control(
    'uncaptured-assumption',
    specimens.missing_assumption,
    'captured_assumptions',
  ),
];
