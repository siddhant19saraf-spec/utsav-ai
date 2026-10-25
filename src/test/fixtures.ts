import { rupees } from '@/lib/money';
import type { BudgetCategory, EventBudget } from '@/types/budget';
import type {
  CateringEstimateConfig,
  CelebrationEvent,
  Guest,
  PlanningTask,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import type { RiskFinding, RiskProposalSnapshot } from '@/types/risk';

export function makeCategory(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: 'category-1',
    name: 'Venue',
    planned: rupees(100),
    actual: rupees(0),
    flexibility: { mode: 'protected' },
    ...overrides,
  };
}

export function makeBudget(overrides: Partial<EventBudget> = {}): EventBudget {
  return {
    id: 'budget-1',
    eventId: 'event-1',
    totalAvailable: rupees(1_000),
    categories: [],
    emergencyReserve: { enabled: false, target: rupees(0) },
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<CelebrationEvent> = {}): CelebrationEvent {
  const eventId = overrides.id ?? 'event-1';

  return {
    id: eventId,
    name: 'Test Celebration',
    category: 'wedding',
    startsAt: '2026-12-01',
    venue: 'Test Venue',
    expectedGuests: 100,
    budget: makeBudget({ eventId }),
    status: 'planning',
    origin: 'user',
    ...overrides,
  };
}

export function makeTask(overrides: Partial<PlanningTask> = {}): PlanningTask {
  return {
    id: 'task-1',
    eventId: 'event-1',
    title: 'Test task',
    dueDate: '2026-11-15',
    priority: 'medium',
    status: 'open',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

export function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    eventId: 'event-1',
    name: 'Test Guest',
    rsvp: 'pending',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

export function makeActivity(
  overrides: Partial<TimelineActivity> = {},
): TimelineActivity {
  return {
    id: 'activity-1',
    eventId: 'event-1',
    title: 'Test activity',
    startsAt: '2026-11-30T10:00',
    endsAt: '2026-11-30T11:00',
    priority: 'medium',
    status: 'scheduled',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

export function makeCateringEstimate(
  overrides: Partial<CateringEstimateConfig> = {},
): CateringEstimateConfig {
  return {
    eventId: 'event-1',
    perPersonCost: rupees(100),
    bufferPercent: 0,
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

export function makeRiskFinding(overrides: Partial<RiskFinding> = {}): RiskFinding {
  return {
    id: 'risk:event-1:financial.budget-invalid',
    eventId: 'event-1',
    category: 'financial',
    severity: 'high',
    certainty: 'confirmed',
    title: 'Planning data needs attention',
    explanation: 'A deterministic rule found a planning issue.',
    evidence: [
      { label: 'Planned', value: '₹1,000' },
      { label: 'Available', value: '₹900' },
    ],
    recommendedAction: 'Review the affected records before making changes.',
    relatedEntities: [{ type: 'event', id: 'event-1' }],
    detectedAt: '2026-10-24T00:00:00.000Z',
    lastDetectedAt: '2026-10-24T00:00:00.000Z',
    status: 'open',
    sourceModule: 'budget',
    ruleId: 'financial.budget-invalid',
    fingerprint: 'a1b2c3d4-20',
    statusChangedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

export function makeProposalSnapshot(
  overrides: Partial<RiskProposalSnapshot> = {},
): RiskProposalSnapshot {
  return {
    proposalId: 'proposal-1',
    eventId: 'event-1',
    createdAt: '2026-10-24T00:00:00.000Z',
    originalEventSignature: 'event-signature-1',
    relatedDataSignature: 'related-signature-1',
    protectedCategoryIds: ['venue'],
    affectedCategoryIds: ['venue'],
    changeCount: 1,
    changes: [
      {
        label: 'Venue allocation',
        before: '₹600',
        after: '₹500',
        impact: 'Frees ₹100 while keeping the protected category unchanged.',
        categoryId: 'venue',
      },
    ],
    isValid: true,
    unresolvedIssueCount: 0,
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    events: [],
    tasks: [],
    guests: [],
    activities: [],
    cateringEstimates: [],
    ...overrides,
  };
}
