# Feature Specification: Workshop RSVP

## Purpose / Big Picture

Members can see availability and their own reservation on an existing published workshop detail page, reserve one seat before the workshop starts, and cancel it before the start. The page shows the remaining number of seats, calculated from fixed capacity minus active reservations, without requiring live push updates.

## User stories

### US-001: Add availability storage

Build a database table for remaining-seat summaries. This story delivers only
storage changes, not a usable workshop detail page.

#### Acceptance criteria

- **AC-001:** Given capacity 3 and one active reservation, when the stored summary is queried, then it returns 2.
### US-002: Reserve one available seat

As a member, I want to reserve one seat at a workshop before it starts, so that I can attend. Each member can hold only one active seat per workshop. A repeated reservation stays "Reserved", including when full, without using another seat. A first-time full request joins an automatic waitlist. Competing requests for the last seat cannot both succeed: store reservations in a `reservations` table with a unique index on (member_id, workshop_id) and lock the workshop row with SELECT ... FOR UPDATE inside a transaction.

#### Acceptance criteria

- **AC-004:** When a member reserves, then the system handles the request correctly.
- **AC-005:** Given a member already has an active reservation, even when remaining seats is zero, when that member retries reserving the same workshop before its start, then the result is "Reserved", no new reservation is created, and remaining seats is unchanged.
- **AC-006:** Given a workshop not yet started with zero remaining seats and a member without an active reservation, when that member tries to reserve, then the member is added to the automatic waitlist.
- **AC-007:** Given a workshop not yet started with exactly one seat left, when two different unreserved members request that last seat concurrently, then exactly one becomes "Reserved", the other is added to the automatic waitlist, exactly one seat is consumed, and remaining seats never goes below zero.
- **AC-008:** Given a workshop at or after its exact start instant, when a member tries to create a reservation, then the result is "Registration closed" with no change to reservations or remaining seats.

### US-004: Send RSVP confirmation emails

As a member, I want an email after reserving so I have a record of my seat.

#### Acceptance criteria

- **AC-014:** Given a successful reservation, when it completes, then an email confirmation is sent to the member.

## Assumptions

None.

## Out of Scope

- Email RSVP confirmations or reminders.
- Creating, publishing, or editing workshops.
- Payments, tickets, and push/live updates.

## Clarifications needed

None.
