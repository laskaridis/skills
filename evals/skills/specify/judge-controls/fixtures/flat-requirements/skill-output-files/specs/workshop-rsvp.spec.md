# Feature Specification: Workshop RSVP

## Purpose / Big Picture

Members can see availability and their own reservation on an existing published workshop detail page, reserve one seat before the workshop starts, and cancel it before the start. The page shows the remaining number of seats, calculated from fixed capacity minus active reservations, without requiring live push updates.

## Requirements

### Display

- **R1:** The detail page shows remaining seats, calculated as capacity minus active reservations, and the viewing member's status ("Reserved" or "Not reserved"). Both reflect current reservations on each visit and after each action, and remain displayed after the start instant.

### Reserving

- **R2:** A member can hold at most one active reservation per workshop. Reserving before the start adds one active reservation.
- **R3:** A repeated reservation stays "Reserved", including when full, and uses no extra seat.
- **R4:** A first-time request on a full workshop returns "Fully booked" with no change.
- **R5:** When two members compete for the last seat, exactly one succeeds and remaining seats never goes below zero.

### Cancelling

- **R6:** A member can cancel their own active reservation before the start, releasing one seat. Repeated cancellation releases no further seat.
- **R7:** A member can reserve again before the start if a seat remains.
- **R8:** A member cannot cancel another member's reservation.

### Start time

- **R9:** At or after the exact start instant, reserving and cancelling return "Registration closed" with no change.

## Acceptance scenarios

- **S1:** Given capacity 3 and one active reservation, when an unreserved member opens the page, then remaining seats is 2 and status is "Not reserved".
- **S2:** Given capacity 3 and one active reservation, when another member reserves before the start, then they are "Reserved" and remaining seats is 1.
- **S3:** Given a member with an active reservation on a full workshop, when they reserve again, then they stay "Reserved" and remaining seats is unchanged.
- **S4:** Given zero remaining seats and an unreserved member, when they reserve, then the result is "Fully booked" with no change.
- **S5:** Given one seat left and two unreserved members, when both reserve concurrently, then exactly one is "Reserved", the other gets "Fully booked", and remaining seats is 0.
- **S6:** Given an active reservation, when the member cancels before the start, then they are "Not reserved" and remaining seats increases by one.
- **S7:** Given a cancelled reservation, when the member cancels again, then no further seat is released.
- **S8:** Given another member's active reservation, when a different member tries to cancel it, then it is unchanged.
- **S9:** Given a cancelled reservation and a free seat before the start, when the member reserves again, then they are "Reserved" and remaining seats decreases by one.
- **S10:** Given the exact start instant, when a member reserves or cancels, then the result is "Registration closed" with no change.
- **S11:** Given the start instant has passed, when a member opens the page, then remaining seats and their status are still displayed.
## Assumptions

- Members arrive via an already signed-in dashboard; the existing session supplies the acting member identity used for own-status and ownership checks. Building login or authentication is not part of this feature.
- The existing published workshop records provide capacity and a start instant.

## Out of Scope

- Automatic waitlisting or queuing when workshops are full.
- Email RSVP confirmations or reminders.
- Creating, publishing, or editing workshops.
- Payments, tickets, and push/live updates.

## Clarifications needed

- **Dashboard "My workshops" list:** Support asked that a reserved workshop appear in the dashboard's "My workshops" list right after reserving, while the platform team said the dashboard must not change in this release. These positions conflict, so this spec defines no dashboard behavior until the product owner decides.
- **Concurrent reservation limit:** It is unanswered whether a member should be limited in how many workshops they can hold reservations for at the same time. This spec imposes no limit until the community team answers.
