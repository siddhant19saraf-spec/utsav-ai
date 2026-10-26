import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import {
  makeActivity,
  makeBudget,
  makeCategory,
  makeEvent,
  makeRiskFinding,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import { makeAiPlan, makeAiRequest } from '@/test/aiFixtures';
import {
  selectionHasBlockingIssues,
  validateAiPlan,
} from './planValidation';

const todayIso = '2026-10-24';

function makeValidationWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const event = makeEvent({
    id: 'event-1',
    name: 'Test Celebration',
    startsAt: '2030-12-01',
    expectedGuests: 100,
    budget: makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(100_000),
      categories: [
        makeCategory({
          id: 'cat-venue',
          name: 'Venue',
          planned: rupees(40_000),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'cat-catering',
          name: 'Catering',
          planned: rupees(20_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(15_000) },
        }),
      ],
    }),
  });

  return makeWorkspace({
    events: [event],
    ...overrides,
  });
}

describe('AI plan validation', () => {
  it('accepts a consistent plan and shows app-calculated comparisons', () => {
    const validation = validateAiPlan(
      makeAiPlan(),
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(validation.errorCount).toBe(0);
    expect(validation.warningCount).toBe(0);
    expect(validation.applyableTimelineIndexes).toEqual([0]);
    expect(validation.applyableTaskIndexes).toEqual([0]);
    expect(validation.budget).toEqual({
      suggestedTotalMinor: 6_000_000,
      eventTotalMinor: 10_000_000,
      differenceMinor: -4_000_000,
      overBudget: false,
      advisory: true,
    });
    expect(validation.catering).toMatchObject({
      baseAttendees: 100,
      bufferAttendees: 10,
      totalAttendees: 110,
      totalCostMinor: 5_500_000,
      overBudget: false,
    });
  });

  it('blocks invalid timeline values and reports overlaps without blocking them', () => {
    const invalid = makeAiPlan();
    invalid.timeline[0] = {
      ...invalid.timeline[0]!,
      startsAt: '2030-12-01T18:00',
      endsAt: '2030-12-01T17:00',
    };
    const invalidValidation = validateAiPlan(
      invalid,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(
      invalidValidation.issues.some((issue) => issue.code === 'timeline-invalid'),
    ).toBe(true);
    expect(invalidValidation.applyableTimelineIndexes).toEqual([]);

    const overlap = makeAiPlan();
    overlap.timeline.push({
      ...overlap.timeline[0]!,
      title: 'Speeches',
      startsAt: '2030-12-01T17:15',
      endsAt: '2030-12-01T17:45',
    });
    const overlapValidation = validateAiPlan(
      overlap,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(
      overlapValidation.issues.filter((issue) => issue.code === 'timeline-overlap'),
    ).toHaveLength(2);
    expect(overlapValidation.applyableTimelineIndexes).toEqual([0, 1]);
    expect(
      selectionHasBlockingIssues(overlapValidation, [0, 1], []),
    ).toBe(false);
  });

  it('blocks duplicate timeline items and duplicate saved activities', () => {
    const duplicateWithinPlan = makeAiPlan();
    duplicateWithinPlan.timeline.push({ ...duplicateWithinPlan.timeline[0]! });
    const withinPlan = validateAiPlan(
      duplicateWithinPlan,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(
      withinPlan.issues.filter((issue) => issue.code === 'timeline-duplicate'),
    ).toHaveLength(2);
    expect(withinPlan.applyableTimelineIndexes).toEqual([]);

    const savedDuplicate = validateAiPlan(
      makeAiPlan(),
      makeAiRequest(),
      makeValidationWorkspace({
        activities: [
          makeActivity({
            id: 'activity-existing',
            eventId: 'event-1',
            title: 'Guest welcome',
            startsAt: '2030-12-01T17:00',
            endsAt: '2030-12-01T17:30',
          }),
        ],
      }),
      todayIso,
    );

    expect(
      savedDuplicate.issues.some(
        (issue) => issue.code === 'timeline-duplicate',
      ),
    ).toBe(true);
    expect(savedDuplicate.applyableTimelineIndexes).toEqual([]);

    const completedDuplicate = validateAiPlan(
      makeAiPlan(),
      makeAiRequest(),
      makeValidationWorkspace({
        activities: [
          makeActivity({
            id: 'activity-completed',
            eventId: 'event-1',
            title: 'Guest welcome',
            startsAt: '2030-12-01T17:00',
            endsAt: '2030-12-01T17:30',
            status: 'completed',
          }),
        ],
      }),
      todayIso,
    );

    expect(
      completedDuplicate.issues.some(
        (issue) => issue.code === 'timeline-duplicate',
      ),
    ).toBe(true);
    expect(completedDuplicate.applyableTimelineIndexes).toEqual([]);
  });

  it('blocks invalid and duplicate tasks while allowing past-due review notes', () => {
    const invalidTask = makeAiPlan();
    invalidTask.tasks[0] = {
      ...invalidTask.tasks[0]!,
      dueDate: '2030-02-31',
    };
    const invalidValidation = validateAiPlan(
      invalidTask,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(
      invalidValidation.issues.some((issue) => issue.code === 'task-invalid'),
    ).toBe(true);
    expect(invalidValidation.applyableTaskIndexes).toEqual([]);

    const pastDue = makeAiPlan();
    pastDue.tasks[0] = { ...pastDue.tasks[0]!, dueDate: '2030-01-01' };
    const pastDueValidation = validateAiPlan(
      pastDue,
      makeAiRequest(),
      makeValidationWorkspace(),
      '2030-03-01',
    );
    expect(
      pastDueValidation.issues.some((issue) => issue.code === 'task-past-due'),
    ).toBe(true);
    expect(pastDueValidation.applyableTaskIndexes).toEqual([0]);

    const duplicate = validateAiPlan(
      makeAiPlan(),
      makeAiRequest(),
      makeValidationWorkspace({
        tasks: [
          makeTask({
            id: 'task-existing',
            eventId: 'event-1',
            title: 'Confirm final seating plan',
          }),
        ],
      }),
      todayIso,
    );
    expect(
      duplicate.issues.some((issue) => issue.code === 'task-duplicate'),
    ).toBe(true);
    expect(
      selectionHasBlockingIssues(duplicate, [], [0]),
    ).toBe(true);
  });

  it('reports over-budget allocation and protected or minimum violations as blockers', () => {
    const overBudget = makeAiPlan();
    overBudget.budgetCategories[1] = {
      ...overBudget.budgetCategories[1]!,
      plannedMinor: 8_000_000,
    };
    const overBudgetValidation = validateAiPlan(
      overBudget,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(
      overBudgetValidation.issues.some(
        (issue) => issue.code === 'budget-over-total' && issue.severity === 'error',
      ),
    ).toBe(true);
    expect(overBudgetValidation.budget.overBudget).toBe(true);
    expect(overBudgetValidation.budget.suggestedTotalMinor).toBe(12_000_000);

    const protectedReduction = makeAiPlan();
    protectedReduction.budgetCategories[0] = {
      ...protectedReduction.budgetCategories[0]!,
      plannedMinor: 3_000_000,
    };
    const protectedValidation = validateAiPlan(
      protectedReduction,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );
    expect(
      protectedValidation.issues.some(
        (issue) =>
          issue.code === 'budget-protected' && issue.severity === 'error',
      ),
    ).toBe(true);

    const belowMinimum = makeAiPlan();
    belowMinimum.budgetCategories[1] = {
      ...belowMinimum.budgetCategories[1]!,
      plannedMinor: 1_000_000,
    };
    const minimumValidation = validateAiPlan(
      belowMinimum,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );
    expect(
      minimumValidation.issues.some(
        (issue) =>
          issue.code === 'budget-minimum' && issue.severity === 'error',
      ),
    ).toBe(true);
  });

  it('uses the app calculator for catering and labels unsupported assumptions', () => {
    const expensiveCatering = makeAiPlan();
    expensiveCatering.catering = {
      recommendedAttendeeCount: 100,
      perPersonCostMinor: 200_000,
      bufferPercent: 10,
      notes: [],
    };
    const validation = validateAiPlan(
      expensiveCatering,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(validation.catering?.totalAttendees).toBe(110);
    expect(validation.catering?.totalCostMinor).toBe(22_000_000);
    expect(validation.catering?.overBudget).toBe(true);
    expect(
      validation.issues.some((issue) => issue.code === 'catering-over-budget'),
    ).toBe(true);

    const request = makeAiRequest();
    if (request.event) {
      request.event.catering = {
        perPersonCostMinor: 50_000,
        bufferPercent: 10,
        baseAttendees: 80,
        estimatedAttendees: 88,
        estimatedCostMinor: 4_400_000,
        attendeeSource: 'confirmed',
        plannedCateringMinor: 2_000_000,
      };
    }
    const changed = validateAiPlan(
      makeAiPlan(),
      request,
      makeValidationWorkspace(),
      todayIso,
    );
    expect(changed.catering?.headcountDifference).toBe(20);
    expect(
      changed.issues.some(
        (issue) => issue.code === 'catering-headcount-differs',
      ),
    ).toBe(true);
  });

  it('uses only saved open findings for risk summaries', () => {
    const workspace = makeValidationWorkspace({
      riskFindings: [
        makeRiskFinding({
          id: 'risk-open',
          eventId: 'event-1',
          status: 'open',
        }),
        makeRiskFinding({
          id: 'risk-resolved',
          eventId: 'event-1',
          status: 'resolved',
        }),
      ],
    });
    const known = makeAiPlan();
    known.riskSummary = {
      overview: 'One open finding.',
      items: [{ findingId: 'risk-open', summary: 'Review the open finding.' }],
    };
    const knownValidation = validateAiPlan(
      known,
      makeAiRequest(),
      workspace,
      todayIso,
    );
    expect(
      knownValidation.issues.some((issue) => issue.area === 'risks'),
    ).toBe(false);

    const unknown = makeAiPlan();
    unknown.riskSummary = {
      overview: 'One open finding.',
      items: [{ findingId: 'risk-invented', summary: 'Invented summary.' }],
    };
    const unknownValidation = validateAiPlan(
      unknown,
      makeAiRequest(),
      workspace,
      todayIso,
    );
    expect(
      unknownValidation.issues.some((issue) => issue.code === 'risk-unknown'),
    ).toBe(true);

    const missing = makeAiPlan();
    missing.riskSummary = { overview: null, items: [] };
    const missingValidation = validateAiPlan(
      missing,
      makeAiRequest({ mode: 'summarize-risks' }),
      workspace,
      todayIso,
    );
    expect(
      missingValidation.issues.some((issue) => issue.code === 'risk-missing'),
    ).toBe(true);
  });

  it('handles removed, advisory, and empty plans without inventing feasibility', () => {
    const removedEvent = validateAiPlan(
      makeAiPlan(),
      makeAiRequest(),
      makeWorkspace({ events: [] }),
      todayIso,
    );
    expect(
      removedEvent.issues.some(
        (issue) =>
          issue.code === 'no-actionable-suggestions' &&
          issue.severity === 'error',
      ),
    ).toBe(true);

    const advisory = validateAiPlan(
      makeAiPlan(),
      { mode: 'create-plan', message: 'Plan a birthday for 30 guests.', event: null },
      makeWorkspace({ events: [] }),
      todayIso,
    );
    expect(advisory.errorCount).toBe(0);
    expect(advisory.applyableTaskIndexes).toEqual([0]);

    const empty = validateAiPlan(
      {
        overview: 'No actionable content.',
        assumptions: [],
        timeline: [],
        budgetCategories: [],
        tasks: [],
        catering: null,
        gaps: [],
        alternatives: [],
        tradeOffs: [],
        riskSummary: null,
      },
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );
    expect(
      empty.issues.some(
        (issue) =>
          issue.code === 'no-actionable-suggestions' &&
          issue.severity === 'warning',
      ),
    ).toBe(true);
  });

  it('does not treat AI-provided values as the event budget total', () => {
    const plan = makeAiPlan();
    plan.budgetCategories = [
      {
        name: 'Flexible extras',
        plannedMinor: 2_500_000,
        rationale: 'Suggested for review.',
        priority: 'optional',
      },
    ];
    const validation = validateAiPlan(
      plan,
      makeAiRequest(),
      makeValidationWorkspace(),
      todayIso,
    );

    expect(validation.budget.suggestedTotalMinor).toBe(2_500_000);
    expect(validation.budget.eventTotalMinor).toBe(10_000_000);
    expect(validation.budget.advisory).toBe(true);
  });
});
