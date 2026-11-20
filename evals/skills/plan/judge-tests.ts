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
    context_documents: [],
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
    expected: Object.fromEntries(
      [
        'intent_fidelity',
        'verifiability',
        'actionability',
        'dependency_correctness',
      ].map((id) => [id, 'fail' as const]),
    ),
  },
];
