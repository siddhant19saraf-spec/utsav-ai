import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import type { CelebrationEvent } from '@/types/domain';
import {
  makeActivity,
  makeBudget,
  makeCateringEstimate,
  makeCategory,
  makeEvent,
  makeGuest,
  makeTask,
} from '@/test/fixtures';
import { analyzeEventRescue } from './rescueEngine';
import type {
  RescueProposal,
  RescueRequest,
  RescueResult,
} from './rescueTypes';
import { requirementsFromEvent } from './rescueValidation';

const TODAY = '2026-10-24';

function baseCategories(): BudgetCategory[] {
  return [
    makeCategory({
      id: 'venue',
      name: 'Venue',
      planned: rupees(6_000),
      actual: rupees(0),
      flexibility: { mode: 'protected' },
    }),
    makeCategory({
      id: 'catering',
      name: 'Catering',
      planned: rupees(2_000),
      actual: rupees(0),
      flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
    }),
    makeCategory({
      id: 'decor',
      name: 'Décor',
      planned: rupees(3_000),
      actual: rupees(0),
      flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
    }),
  ];
}

function rescueEvent(
  overrides: Partial<CelebrationEvent> = {},
): CelebrationEvent {
  return makeEvent({
    id: 'event-1',
    name: 'Wedding',
    startsAt: '2026-12-01',
    expectedGuests: 100,
    setting: 'indoor',
    theme: 'Garden',
    accessibilityRequired: true,
    accessibilityAddressed: true,
    contingencyPlanConfirmed: true,
    budget: makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(10_000),
      categories: baseCategories(),
    }),
    ...overrides,
  });
}

function makeRequest(
  event: CelebrationEvent,
  overrides: Partial<RescueRequest> = {},
): RescueRequest {
  const flexibleCategories = event.budget.categories.flatMap((category) =>
    category.flexibility.mode === 'flexible'
      ? [
          {
            categoryId: category.id,
            minimumPlanned: category.flexibility.minimumPlanned,
          },
        ]
      : [],
  );

  return {
    eventId: event.id,
    current: requirementsFromEvent(event),
    changes: {},
    protectedCategoryIds: [],
    flexibleCategories,
    ...overrides,
  };
}

function analyze(
  event: CelebrationEvent,
  request: RescueRequest,
  tasks: Parameters<typeof analyzeEventRescue>[0]['tasks'] = [],
): RescueResult {
  return analyzeEventRescue({
    event,
    tasks,
    request,
    todayIso: TODAY,
    now: new Date('2026-10-24T09:30:00.000Z'),
  });
}

function proposalOf(result: RescueResult): RescueProposal {
  if (!result.proposal) {
    throw new Error('Expected the rescue engine to return a proposal.');
  }

  return result.proposal;
}

function categoryPlan(
  proposal: RescueProposal,
  categoryId: string,
  side: 'original' | 'proposed',
): number | undefined {
  const event =
    side === 'original' ? proposal.originalEvent : proposal.proposedEvent;

  return event.budget.categories.find((category) => category.id === categoryId)
    ?.planned.amountMinor;
}

describe('analyzeEventRescue budget findings', () => {
  it('detects a confirmed overrun and proposes a deterministic flexible reduction without applying it', () => {
    const event = rescueEvent();
    const snapshot = JSON.parse(JSON.stringify(event)) as unknown;
    const result = analyze(event, makeRequest(event));
    const proposal = proposalOf(result);

    expect(result.feasible).toBe(true);
    expect(result.shortfall).toEqual(rupees(0));
    expect(result.findings.map((finding) => finding.code)).toContain(
      'budget-overrun',
    );

    const overrun = result.findings.find(
      (finding) => finding.code === 'budget-overrun',
    );
    expect(overrun?.severity).toBe('critical');
    expect(overrun?.certainty).toBe('confirmed');
    expect(overrun?.explanation).toMatch(/integer-paise/i);

    expect(proposal.originalBudget.planned).toEqual(rupees(11_000));
    expect(proposal.proposedBudget.planned).toEqual(rupees(10_000));
    expect(proposal.proposedBudget.totalBudget).toEqual(rupees(10_000));
    expect(proposal.proposedBudget.isOverBudget).toBe(false);
    expect(categoryPlan(proposal, 'venue', 'proposed')).toBe(600_000);
    expect(categoryPlan(proposal, 'decor', 'original')).toBe(300_000);
    expect(categoryPlan(proposal, 'decor', 'proposed')).toBe(200_000);

    const decorChange = proposal.changes.find(
      (change) => change.id === 'change-planned-decor',
    );
    expect(decorChange).toMatchObject({
      kind: 'category-planned',
      before: '₹3,000',
      after: '₹2,000',
      reversible: true,
    });

    // Analysis is pure: the saved event and the proposal's snapshot are untouched.
    expect(event).toEqual(snapshot);
    expect(proposal.originalEvent).toEqual(snapshot);
    expect(proposal.proposedEvent).not.toEqual(snapshot);
    expect(result.explanation).toMatch(/nothing has been applied/i);
    expect(result.explanation).toMatch(/not a claim of optimality/i);
  });

  it('never changes the total budget or guest count to make a plan appear feasible', () => {
    const event = rescueEvent();
    const result = analyze(event, makeRequest(event));
    const proposal = proposalOf(result);

    expect(proposal.proposedEvent.budget.totalAvailable).toEqual(
      event.budget.totalAvailable,
    );
    expect(proposal.proposedEvent.expectedGuests).toBe(event.expectedGuests);
    expect(
      proposal.changes.some((change) => change.kind === 'total-budget'),
    ).toBe(false);
    expect(
      proposal.changes.some((change) => change.kind === 'guest-count'),
    ).toBe(false);
  });

  it('honors a request to raise the total budget and reports the explicit change', () => {
    const event = rescueEvent();
    const result = analyze(
      event,
      makeRequest(event, {
        changes: { totalAvailable: rupees(11_500) },
      }),
    );
    const proposal = proposalOf(result);

    expect(result.feasible).toBe(true);
    expect(proposal.proposedEvent.budget.totalAvailable).toEqual(rupees(11_500));
    expect(proposal.proposedBudget.planned).toEqual(rupees(11_000));
    expect(
      proposal.changes.find((change) => change.kind === 'total-budget'),
    ).toMatchObject({ before: '₹10,000', after: '₹11,500' });
    expect(proposal.changes.some((change) => change.kind === 'category-planned'))
      .toBe(false);
  });

  it('keeps additional protections and reports an infeasible repair instead of reducing them', () => {
    const event = rescueEvent();
    const result = analyze(
      event,
      makeRequest(event, {
        protectedCategoryIds: ['decor'],
        flexibleCategories: [
          { categoryId: 'catering', minimumPlanned: rupees(1_500) },
        ],
      }),
    );
    const proposal = proposalOf(result);

    expect(result.feasible).toBe(false);
    expect(result.shortfall).toEqual(rupees(500));
    expect(proposal.protectedCategoryIds).toEqual(
      expect.arrayContaining(['venue', 'decor']),
    );
    expect(categoryPlan(proposal, 'decor', 'proposed')).toBe(300_000);
    expect(categoryPlan(proposal, 'catering', 'proposed')).toBe(150_000);
    expect(proposal.proposedBudget.isOverBudget).toBe(true);
    expect(proposal.validation.isValid).toBe(false);
    expect(
      proposal.validation.issues.some((issue) => issue.code === 'budget-overrun'),
    ).toBe(true);
    expect(
      result.findings.find((finding) => finding.code === 'repair-infeasible')
        ?.description,
    ).toMatch(/₹500 over budget/i);
    expect(result.explanation).toMatch(/no feasible plan passed validation/i);
    expect(result.explanation).toMatch(/nothing was changed/i);
  });

  it('does not generate a proposal for an invalid rescue request', () => {
    const event = rescueEvent();
    const snapshot = JSON.parse(JSON.stringify(event)) as unknown;
    const result = analyze(
      event,
      makeRequest(event, { changes: { expectedGuests: 0 } }),
    );

    expect(result.feasible).toBe(false);
    expect(result.proposal).toBeNull();
    expect(result.proposedChanges).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'invalid-request',
      severity: 'critical',
      certainty: 'confirmed',
    });
    expect(result.explanation).toMatch(/nothing was changed/i);
    expect(event).toEqual(snapshot);
  });
});

describe('analyzeEventRescue guest and catering handling', () => {
  function roomyEvent(overrides: Partial<CelebrationEvent> = {}) {
    return rescueEvent({
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(20_000),
        categories: baseCategories(),
      }),
      ...overrides,
    });
  }

  it('recalculates catering from the saved per-guest baseline when guests increase', () => {
    const event = roomyEvent();
    const result = analyze(
      event,
      makeRequest(event, { changes: { expectedGuests: 150 } }),
    );
    const proposal = proposalOf(result);

    expect(result.feasible).toBe(true);
    expect(proposal.proposedEvent.expectedGuests).toBe(150);
    expect(event.expectedGuests).toBe(100);
    expect(categoryPlan(proposal, 'catering', 'proposed')).toBe(300_000);
    expect(proposal.proposedBudget.planned).toEqual(rupees(12_000));
    expect(proposal.proposedBudget.isOverBudget).toBe(false);

    const guestFinding = result.findings.find(
      (finding) => finding.code === 'guest-increase',
    );
    expect(guestFinding?.certainty).toBe('confirmed');
    expect(guestFinding?.description).toMatch(/100 to 150/i);

    const cateringFinding = result.findings.find(
      (finding) => finding.code === 'catering-recalculation',
    );
    expect(cateringFinding?.certainty).toBe('assumption');
    expect(cateringFinding?.description).toMatch(/₹2,000 to ₹3,000/);
    expect(cateringFinding?.explanation).toMatch(/saved per-guest baseline/i);
    expect(cateringFinding?.constraints.join(' ')).toMatch(
      /not a vendor quote or invoice/i,
    );
  });

  it('holds a protected catering plan when the guest count decreases', () => {
    const event = roomyEvent({
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(20_000),
        categories: [
          makeCategory({
            id: 'venue',
            name: 'Venue',
            planned: rupees(6_000),
            flexibility: { mode: 'protected' },
          }),
          makeCategory({
            id: 'catering',
            name: 'Catering',
            planned: rupees(2_000),
            flexibility: { mode: 'protected' },
          }),
          makeCategory({
            id: 'decor',
            name: 'Décor',
            planned: rupees(3_000),
            flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
          }),
        ],
      }),
    });
    const result = analyze(
      event,
      makeRequest(event, { changes: { expectedGuests: 50 } }),
    );
    const proposal = proposalOf(result);

    expect(result.feasible).toBe(true);
    expect(proposal.proposedEvent.expectedGuests).toBe(50);
    expect(categoryPlan(proposal, 'catering', 'proposed')).toBe(200_000);
    expect(
      proposal.changes.some(
        (change) => change.id === 'change-planned-catering',
      ),
    ).toBe(false);
    expect(
      result.findings.find(
        (finding) => finding.code === 'protected-catering-held',
      )?.certainty,
    ).toBe('confirmed');
  });

  it('clamps a flexible catering reduction at its minimum', () => {
    const event = roomyEvent({
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(20_000),
        categories: [
          makeCategory({
            id: 'venue',
            name: 'Venue',
            planned: rupees(6_000),
            flexibility: { mode: 'protected' },
          }),
          makeCategory({
            id: 'catering',
            name: 'Catering',
            planned: rupees(2_000),
            flexibility: { mode: 'flexible', minimumPlanned: rupees(1_800) },
          }),
        ],
      }),
    });
    const result = analyze(
      event,
      makeRequest(event, { changes: { expectedGuests: 50 } }),
    );
    const proposal = proposalOf(result);

    expect(categoryPlan(proposal, 'catering', 'proposed')).toBe(180_000);
    expect(
      result.findings.find(
        (finding) => finding.code === 'catering-recalculation',
      )?.description,
    ).toMatch(/held at the flexible minimum/i);
  });

  it('reports missing catering data instead of inventing a per-guest rate', () => {
    const event = roomyEvent({
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(20_000),
        categories: [
          makeCategory({
            id: 'venue',
            name: 'Venue',
            planned: rupees(6_000),
            flexibility: { mode: 'protected' },
          }),
        ],
      }),
    });
    const result = analyze(
      event,
      makeRequest(event, { changes: { expectedGuests: 150 } }),
    );
    const proposal = proposalOf(result);

    expect(result.feasible).toBe(true);
    expect(
      result.findings.find((finding) => finding.code === 'catering-missing'),
    ).toMatchObject({ certainty: 'missing-data', severity: 'warning' });
    expect(
      proposal.unresolvedIssues.some((issue) =>
        /catering could not be recalculated/i.test(issue),
      ),
    ).toBe(true);
    expect(proposal.proposedEvent.budget.categories).toHaveLength(1);
  });
});

describe('analyzeEventRescue readiness and schedule findings', () => {
  it('detects unconfirmed outdoor contingency, unaddressed accessibility, and scheduling conflicts', () => {
    const event = makeEvent({
      id: 'event-1',
      name: 'Wedding',
      startsAt: '2026-12-01',
      expectedGuests: 100,
      setting: 'outdoor',
      theme: 'Garden',
      accessibilityRequired: true,
      accessibilityAddressed: false,
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(10_000),
        categories: baseCategories(),
      }),
    });
    const tasks = [
      makeTask({
        id: 'task-overdue',
        eventId: event.id,
        title: 'Pay venue deposit',
        dueDate: '2026-10-01',
        status: 'open',
      }),
      makeTask({
        id: 'task-after',
        eventId: event.id,
        title: 'Send thank-you notes',
        dueDate: '2026-12-10',
        status: 'open',
      }),
    ];
    const result = analyze(event, makeRequest(event), tasks);
    const codes = result.findings.map((finding) => finding.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'outdoor-contingency-missing',
        'accessibility-unaddressed',
        'tasks-open',
        'task-after-event',
      ]),
    );
    expect(
      result.findings.find((finding) => finding.code === 'tasks-open')
        ?.description,
    ).toMatch(/Pay venue deposit/);
    expect(
      result.findings.find(
        (finding) => finding.code === 'outdoor-contingency-missing',
      )?.certainty,
    ).toBe('missing-data');
    expect(
      result.findings.find(
        (finding) => finding.code === 'accessibility-unaddressed',
      )?.certainty,
    ).toBe('confirmed');
    expect(
      result.proposal?.unresolvedIssues.some((issue) =>
        /due after the event date/i.test(issue),
      ),
    ).toBe(true);
    expect(
      result.proposal?.unresolvedIssues.some((issue) => /past due/i.test(issue)),
    ).toBe(true);
  });

  it('reports missing task data without inventing tasks', () => {
    const event = rescueEvent();
    const noTaskData = analyze(event, makeRequest(event), []);

    expect(
      noTaskData.findings.find(
        (finding) => finding.code === 'schedule-data-missing',
      ),
    ).toMatchObject({ certainty: 'missing-data', area: 'schedule' });

    const otherEventTask = makeTask({
      id: 'other-task',
      eventId: 'other-event',
      title: 'Other celebration task',
      dueDate: '2026-11-01',
    });
    const unrelatedTaskData = analyze(
      event,
      makeRequest(event),
      [otherEventTask],
    );

    expect(
      unrelatedTaskData.findings.find(
        (finding) => finding.code === 'tasks-missing',
      ),
    ).toMatchObject({ certainty: 'missing-data', area: 'tasks' });
  });

  it('does not treat actual spend as reversible money', () => {
    const event = rescueEvent({
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(10_000),
        categories: [
          makeCategory({
            id: 'venue',
            name: 'Venue',
            planned: rupees(6_000),
            actual: rupees(10_500),
            flexibility: { mode: 'protected' },
          }),
          makeCategory({
            id: 'decor',
            name: 'Décor',
            planned: rupees(3_000),
            actual: rupees(0),
            flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
          }),
        ],
      }),
    });
    const result = analyze(event, makeRequest(event));

    expect(
      result.findings.find(
        (finding) => finding.code === 'budget-actual-overrun',
      )?.description,
    ).toMatch(/cannot reverse money/i);
    expect(result.proposal?.unresolvedIssues.some((issue) => /actual spend/i.test(issue))).toBe(
      true,
    );
    expect(normalizeTotals(result)).toMatchObject({
      actual: 1_050_000,
    });
  });
});

describe('analyzeEventRescue timeline, guest, and catering integration', () => {
  function balancedBudget(): CelebrationEvent['budget'] {
    return makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(10_000),
      categories: [
        makeCategory({
          id: 'venue',
          name: 'Venue',
          planned: rupees(6_000),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'catering',
          name: 'Catering',
          planned: rupees(2_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
        }),
        makeCategory({
          id: 'decor',
          name: 'Décor',
          planned: rupees(1_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(500) },
        }),
      ],
    });
  }

  function analyzeWithData(
    event: CelebrationEvent,
    request: RescueRequest,
    data: {
      readonly tasks?: Parameters<typeof analyzeEventRescue>[0]['tasks'];
      readonly activities?: Parameters<typeof analyzeEventRescue>[0]['activities'];
      readonly guests?: Parameters<typeof analyzeEventRescue>[0]['guests'];
      readonly cateringEstimate?: Parameters<
        typeof analyzeEventRescue
      >[0]['cateringEstimate'];
    } = {},
  ): RescueResult {
    return analyzeEventRescue({
      event,
      tasks: data.tasks ?? [],
      activities: data.activities ?? [],
      guests: data.guests ?? [],
      cateringEstimate: data.cateringEstimate ?? null,
      request,
      todayIso: TODAY,
      now: new Date('2026-10-24T09:30:00.000Z'),
    });
  }

  it('flags confirmed RSVPs above the expected guest count without changing them', () => {
    const event = rescueEvent({ expectedGuests: 2, budget: balancedBudget() });
    const guests = [
      makeGuest({ id: 'guest-1', eventId: 'event-1', name: 'Ananya', rsvp: 'confirmed' }),
      makeGuest({ id: 'guest-2', eventId: 'event-1', name: 'Bhavna', rsvp: 'confirmed' }),
      makeGuest({ id: 'guest-3', eventId: 'event-1', name: 'Chirag', rsvp: 'confirmed' }),
      makeGuest({ id: 'guest-4', eventId: 'event-1', name: 'Diya', rsvp: 'pending' }),
      makeGuest({ id: 'guest-other', eventId: 'event-2', name: 'Other', rsvp: 'confirmed' }),
    ];
    const snapshot = JSON.stringify({ event, guests });
    const result = analyzeWithData(event, makeRequest(event), {
      tasks: [makeTask({ dueDate: '2026-11-15' })],
      guests,
      cateringEstimate: makeCateringEstimate({
        perPersonCost: rupees(10),
        bufferPercent: 0,
      }),
    });
    const finding = result.findings.find(
      (entry) => entry.code === 'confirmed-attendance',
    );

    expect(finding).toMatchObject({
      certainty: 'confirmed',
      severity: 'warning',
      area: 'guests',
    });
    expect(finding?.description).toMatch(/3 guests are confirmed/);
    expect(finding?.description).toMatch(/1 guest above the 2 expected guests/);
    expect(finding?.constraints.join(' ')).toMatch(
      /Invited guests are not the same as confirmed attendees/,
    );
    expect(
      result.findings.filter((entry) => entry.code === 'confirmed-attendance'),
    ).toHaveLength(1);
    expect(
      result.findings.some((entry) => entry.code === 'catering-estimate-overrun'),
    ).toBe(false);
    expect(JSON.stringify({ event, guests })).toBe(snapshot);
  });

  it('reports overlapping activities as a review warning without rescheduling them', () => {
    const event = rescueEvent({ budget: balancedBudget() });
    const activities = [
      makeActivity({
        id: 'activity-ceremony',
        eventId: 'event-1',
        title: 'Ceremony',
        startsAt: '2026-12-01T10:00',
        endsAt: '2026-12-01T12:00',
      }),
      makeActivity({
        id: 'activity-photos',
        eventId: 'event-1',
        title: 'Photos',
        startsAt: '2026-12-01T11:00',
        endsAt: '2026-12-01T13:00',
      }),
      makeActivity({
        id: 'activity-other',
        eventId: 'event-2',
        title: 'Other event',
        startsAt: '2026-12-01T10:00',
        endsAt: '2026-12-01T14:00',
      }),
    ];
    const snapshot = JSON.stringify(activities);
    const result = analyzeWithData(event, makeRequest(event), {
      tasks: [makeTask({ dueDate: '2026-11-15' })],
      activities,
    });
    const finding = result.findings.find(
      (entry) => entry.code === 'activity-overlap',
    );

    expect(finding).toMatchObject({
      certainty: 'potential',
      severity: 'warning',
      area: 'schedule',
    });
    expect(finding?.title).toMatch(/1 activity overlap needs review/);
    expect(finding?.description).toContain('“Ceremony”');
    expect(finding?.description).toContain('“Photos”');
    expect(finding?.constraints.join(' ')).toMatch(/may be intentional/);
    expect(finding?.constraints.join(' ')).toMatch(
      /does not move, merge, or delete activities/,
    );
    expect(
      result.findings.filter((entry) => entry.code === 'activity-overlap'),
    ).toHaveLength(1);
    expect(result.proposal?.unresolvedIssues.join(' ')).toMatch(
      /overlaps may be intentional/,
    );
    expect(JSON.stringify(activities)).toBe(snapshot);
  });

  it('compares the saved per-person catering assumption with the planned allocation', () => {
    const event = rescueEvent({ expectedGuests: 10, budget: balancedBudget() });
    const guests = Array.from({ length: 8 }, (_, index) =>
      makeGuest({
        id: `guest-${index + 1}`,
        eventId: 'event-1',
        name: `Guest ${index + 1}`,
        rsvp: 'confirmed',
      }),
    );
    const budgetSnapshot = JSON.stringify(event.budget);
    const result = analyzeWithData(event, makeRequest(event), {
      tasks: [makeTask({ dueDate: '2026-11-15' })],
      guests,
      cateringEstimate: makeCateringEstimate({
        perPersonCost: rupees(300),
        bufferPercent: 0,
      }),
    });
    const finding = result.findings.find(
      (entry) => entry.code === 'catering-estimate-overrun',
    );

    expect(finding).toMatchObject({
      certainty: 'assumption',
      severity: 'warning',
      area: 'catering',
      affectedCategoryIds: ['catering'],
    });
    expect(finding?.description).toMatch(/8 confirmed guests with 0 buffer guests/);
    expect(finding?.description).toMatch(/₹2,400 planning estimate/);
    expect(finding?.description).toMatch(/₹400 above the ₹2,000 planned/);
    expect(finding?.constraints.join(' ')).toMatch(
      /not a vendor quote or current market rate/,
    );
    expect(finding?.explanation).toMatch(/No external price or AI-generated amount/);
    expect(
      result.findings.filter(
        (entry) => entry.code === 'catering-estimate-overrun',
      ),
    ).toHaveLength(1);
    expect(
      result.proposedChanges.some((change) => change.kind === 'category-planned'),
    ).toBe(false);
    expect(JSON.stringify(event.budget)).toBe(budgetSnapshot);
  });

  it('reports missing catering estimate data instead of inventing a rate', () => {
    const event = rescueEvent({ expectedGuests: 10, budget: balancedBudget() });
    const guests = [
      makeGuest({ id: 'guest-1', eventId: 'event-1', name: 'Ananya', rsvp: 'confirmed' }),
      makeGuest({ id: 'guest-2', eventId: 'event-1', name: 'Bhavna', rsvp: 'confirmed' }),
      makeGuest({ id: 'guest-3', eventId: 'event-1', name: 'Chirag', rsvp: 'confirmed' }),
    ];
    const withoutConfig = analyzeWithData(event, makeRequest(event), {
      tasks: [makeTask({ dueDate: '2026-11-15' })],
      guests,
    });
    const missingConfig = withoutConfig.findings.find(
      (entry) => entry.code === 'catering-estimate-missing',
    );

    expect(missingConfig).toMatchObject({
      certainty: 'missing-data',
      severity: 'info',
      area: 'catering',
    });
    expect(missingConfig?.description).toMatch(
      /3 guests are confirmed, but no per-person catering assumption is saved/,
    );
    expect(missingConfig?.constraints.join(' ')).toMatch(
      /No vendor price or market rate is invented/,
    );
    expect(
      withoutConfig.findings.some(
        (entry) => entry.code === 'catering-estimate-overrun',
      ),
    ).toBe(false);

    const noCateringCategory = rescueEvent({
      expectedGuests: 10,
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(10_000),
        categories: [
          makeCategory({
            id: 'venue',
            name: 'Venue',
            planned: rupees(6_000),
            flexibility: { mode: 'protected' },
          }),
        ],
      }),
    });
    const withoutCategory = analyzeWithData(
      noCateringCategory,
      makeRequest(noCateringCategory),
      {
        tasks: [makeTask({ dueDate: '2026-11-15' })],
        guests,
        cateringEstimate: makeCateringEstimate({
          perPersonCost: rupees(100),
          bufferPercent: 0,
        }),
      },
    );
    const missingCategory = withoutCategory.findings.find(
      (entry) => entry.code === 'catering-estimate-missing',
    );

    expect(missingCategory?.title).toMatch(/no budget allocation to compare/i);
    expect(missingCategory?.description).toMatch(/budget has no catering category/);
    expect(
      withoutCategory.findings.some(
        (entry) => entry.code === 'catering-estimate-overrun',
      ),
    ).toBe(false);
  });

  it('suppresses the saved estimate comparison when the guest count changes and applies nothing', () => {
    const event = rescueEvent({ expectedGuests: 10, budget: balancedBudget() });
    const guests = Array.from({ length: 12 }, (_, index) =>
      makeGuest({
        id: `guest-${index + 1}`,
        eventId: 'event-1',
        name: `Guest ${index + 1}`,
        rsvp: 'confirmed',
      }),
    );
    const request = makeRequest(event, { changes: { expectedGuests: 20 } });
    const snapshot = JSON.stringify({ event, guests });
    const result = analyzeWithData(event, request, {
      tasks: [makeTask({ dueDate: '2026-11-15' })],
      guests,
      cateringEstimate: makeCateringEstimate({
        perPersonCost: rupees(500),
        bufferPercent: 0,
      }),
    });
    const codes = result.findings.map((entry) => entry.code);

    expect(result.findings.some((entry) => entry.code === 'guest-increase')).toBe(
      true,
    );
    expect(
      result.findings.find((entry) => entry.code === 'catering-recalculation')
        ?.certainty,
    ).toBe('assumption');
    expect(
      result.findings.some(
        (entry) => entry.code === 'catering-estimate-overrun',
      ),
    ).toBe(false);
    expect(
      result.findings.some(
        (entry) => entry.code === 'catering-estimate-missing',
      ),
    ).toBe(false);
    expect(new Set(codes).size).toBe(codes.length);
    expect(result.proposal?.proposedEvent.expectedGuests).toBe(20);
    expect(event.expectedGuests).toBe(10);
    expect(JSON.stringify({ event, guests })).toBe(snapshot);
  });

  it('marks high-priority overdue work as critical without completing or rescheduling it', () => {
    const event = rescueEvent({ budget: balancedBudget() });
    const task = makeTask({
      id: 'task-critical',
      eventId: 'event-1',
      title: 'Confirm catering vendor',
      dueDate: '2026-10-20',
      priority: 'high',
      status: 'open',
    });
    const snapshot = JSON.stringify(task);
    const result = analyzeWithData(event, makeRequest(event), { tasks: [task] });
    const finding = result.findings.find((entry) => entry.code === 'tasks-open');

    expect(finding).toMatchObject({
      certainty: 'confirmed',
      severity: 'critical',
      area: 'tasks',
    });
    expect(finding?.title).toMatch(/overdue, including high-priority work/);
    expect(finding?.description).toMatch(/Confirm catering vendor/);
    expect(finding?.constraints.join(' ')).toMatch(
      /does not reschedule or complete tasks/,
    );
    expect(
      result.proposal?.unresolvedIssues.some((issue) => /past due/.test(issue)),
    ).toBe(true);
    expect(JSON.stringify(task)).toBe(snapshot);
  });
});

function normalizeTotals(result: RescueResult) {
  const proposal = proposalOf(result);

  return {
    actual: proposal.proposedBudget.actual.amountMinor,
    planned: proposal.proposedBudget.planned.amountMinor,
  };
}
