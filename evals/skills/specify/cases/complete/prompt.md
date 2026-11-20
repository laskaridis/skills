# Context from the earlier product conversation

The following is the ordered Q&A between the product owner (User) and the discovery agent (Agent). Later decisions override earlier ones.

**Agent:** What are we trying to enable, and where will members use it?
**User:** Members should be able to reserve one seat at a published workshop from its existing detail page. They get there from their signed-in member dashboard. We already have workshop records with a start time and a fixed seat capacity.

**Agent:** What should the page show before somebody acts?
**User:** Show the remaining seats and whether this member already has an active reservation. Remaining seats means workshop capacity minus active reservations. Cancelled reservations do not use seats. Show the updated numbers and status after each action, and show the current state again when the page is reopened. No live push updates are needed.

**Agent:** What happens on a successful reservation?
**User:** A member can reserve at most one active seat for a workshop. While seats remain and the workshop has not started, reserve the seat, show "Reserved", and reduce remaining seats by one. Retrying when already reserved should remain "Reserved" without creating another reservation or using a second seat, including when the workshop is now full.

**Agent:** How should full workshops work?
**User:** Initially I thought we could place people on an automatic waitlist when full.

**Agent:** What happens if two people try for the last seat?
**User:** Only one should reserve it. The other gets "Fully booked". Remaining seats must never be negative. A first-time reservation when full gets "Fully booked" and leaves reservations and remaining seats unchanged.

**Agent:** Should we proceed with the automatic waitlist idea?
**User:** No, I am replacing that earlier decision. There is **no waitlist** in this feature. A full workshop rejects the attempt with "Fully booked". Do not queue anyone.

**Agent:** Can members cancel or reserve again?
**User:** Before the workshop starts, they can cancel their own active reservation; it switches to "Not reserved" and releases exactly one seat. Trying to cancel again is a no-op and does not release another seat. They can later reserve again if a seat remains. They cannot cancel another member's reservation.

**Agent:** What is the time boundary for actions?
**User:** Both new reservations and cancellations are allowed strictly before the workshop start. At the exact start instant or later, both are rejected with "Registration closed" and leave state unchanged. Reading the workshop's remaining seats and own status still works after the start.

**Agent:** Should RSVP confirmation trigger an email, and should we build workshop administration?
**User:** Email confirmations and reminders are **out of scope**. Workshop publishing and editing already exist and are not part of this change. Don't introduce payment, ticketing, or other capabilities.

**Agent:** Any open questions that would change these behaviors?
**User:** No. Use the behavior we agreed on. The implementation can choose normal internal details.

# Current request

Use the specify skill to capture this discussion in a specification at **specs/workshop-rsvp.spec.md**. Produce only that document, using the skill's template; do not implement code. The conversation above is the agreed context, not a request to restart discovery.
