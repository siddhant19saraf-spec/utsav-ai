import type {
  AiEventContext,
  AiPlan,
  AiPlanEnvelope,
  AiPlanRequest,
} from '../features/ai/contracts';

/**
 * Shared Step 8 fixtures. They contain no real credentials or provider calls.
 * Values are deliberately far in the future so date rules stay stable.
 */
export function makeAiEventContext(
  overrides: Partial<AiEventContext> = {},
): AiEventContext {
  return {
    id: 'event-1',
    name: 'Test Celebration',
    category: 'wedding',
    startsAt: '2030-12-01',
    venue: 'Test Venue',
    setting: 'indoor',
    theme: 'Garden lights',
    status: 'planning',
    expectedGuests: 100,
    dietaryRequirementCount: 0,
    accessibilityRequestCount: 0,
    accessibilityRequired: false,
    accessibilityAddressed: false,
    contingencyPlanConfirmed: true,
    budget: {
      totalAvailableMinor: 10_000_000,
      plannedMinor: 6_000_000,
      remainingMinor: 4_000_000,
      overBudget: false,
      reserveEnabled: false,
      reserveTargetMinor: 0,
      reserveAllocatedMinor: 0,
      reserveShortfallMinor: 0,
      categories: [
        {
          id: 'cat-venue',
          name: 'Venue',
          plannedMinor: 4_000_000,
          actualMinor: 0,
          protection: 'protected',
          minimumMinor: null,
        },
        {
          id: 'cat-catering',
          name: 'Catering',
          plannedMinor: 2_000_000,
          actualMinor: 0,
          protection: 'flexible',
          minimumMinor: 1_500_000,
        },
      ],
    },
    guestCounts: { invited: 100, confirmed: 60, pending: 40, declined: 0 },
    catering: null,
    tasks: [],
    activities: [],
    openRisks: [],
    ...overrides,
  };
}

export function makeAiPlan(overrides: Partial<AiPlan> = {}): AiPlan {
  return {
    overview:
      'A practical wedding outline that separates confirmed facts from assumptions.',
    assumptions: [
      'The venue is available for the full day and the host has not confirmed final access times.',
    ],
    timeline: [
      {
        title: 'Guest welcome',
        startsAt: '2030-12-01T17:00',
        endsAt: '2030-12-01T17:30',
        priority: 'medium',
        location: null,
        description: null,
      },
    ],
    budgetCategories: [
      {
        name: 'Venue',
        plannedMinor: 4_000_000,
        rationale: 'Keeps the protected venue allocation unchanged.',
        priority: 'essential',
      },
      {
        name: 'Catering',
        plannedMinor: 2_000_000,
        rationale: 'A planning allocation to confirm with the caterer.',
        priority: 'essential',
      },
    ],
    tasks: [
      {
        title: 'Confirm final seating plan',
        description: null,
        dueDate: '2030-11-20',
        priority: 'high',
        milestone: true,
      },
    ],
    catering: {
      recommendedAttendeeCount: 100,
      perPersonCostMinor: 50_000,
      bufferPercent: 10,
      notes: ['Confirm dietary requirements with the caterer.'],
    },
    gaps: [
      {
        title: 'Final guest count is not confirmed',
        detail:
          'The saved guest records still have pending RSVPs, so the caterer needs a confirmed count before the event.',
        question: 'When will the final RSVP deadline be?',
      },
    ],
    alternatives: [
      {
        title: 'Reduce the buffer',
        summary: 'Use a smaller catering buffer if the final headcount is firm.',
        tradeOff: 'Lower potential waste, but less cover for last-minute guests.',
      },
    ],
    tradeOffs: [
      'A tighter catering buffer reduces potential waste but leaves less room for late confirmations.',
    ],
    riskSummary: null,
    ...overrides,
  };
}

export function makeAiRequest(overrides: Partial<AiPlanRequest> = {}): AiPlanRequest {
  return {
    mode: 'create-plan',
    message: 'Plan a wedding for 100 guests within the saved budget.',
    event: makeAiEventContext(),
    ...overrides,
  };
}

export function makeAiEnvelope(
  overrides: Partial<AiPlanEnvelope> = {},
): AiPlanEnvelope {
  return {
    requestId: 'req-test-1',
    generatedAt: '2026-10-24T10:00:00.000Z',
    source: 'provider',
    provider: { name: 'Test Provider', model: 'test-model' },
    plan: makeAiPlan(),
    ...overrides,
  };
}
