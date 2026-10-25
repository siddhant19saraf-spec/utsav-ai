import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/date';
import { rupees } from '@/lib/money';
import type { CelebrationEvent, Workspace } from '@/types/domain';
import type { RiskProposalSnapshot } from '@/types/risk';
import {
  makeActivity,
  makeBudget,
  makeCateringEstimate,
  makeCategory,
  makeEvent,
  makeGuest,
  makeProposalSnapshot,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import { EMERGENCY_RESERVE_CATEGORY_ID } from '@/features/budget/budgetConstants';
import { createEventSnapshotSignature } from '@/lib/eventSnapshot';
import { analyzeWorkspaceRisks } from './riskEngine';
import {
  DEFAULT_RISK_THRESHOLDS,
  resolveRiskThresholds,
  type RiskThresholds,
} from './riskConfig';
import { createProposalDataSignature } from './riskSignatures';
import type { RiskAnalysisResult } from './riskTypes';

const TODAY = '2026-10-24';
const FAR_EVENT_DATE = '2099-06-01';

function analyze(
  workspace: Workspace,
  thresholds?: Partial<RiskThresholds>,
): RiskAnalysisResult {
  return analyzeWorkspaceRisks({
    workspace,
    todayIso: TODAY,
    ...(thresholds ? { thresholds } : {}),
  });
}

function rule(result: RiskAnalysisResult, ruleId: string) {
  return result.detections.find((detection) => detection.ruleId === ruleId);
}

function ruleIds(result: RiskAnalysisResult): string[] {
  return result.detections.map((detection) => detection.ruleId);
}

function cleanEvent(overrides: Partial<CelebrationEvent> = {}): CelebrationEvent {
  return makeEvent({
    startsAt: FAR_EVENT_DATE,
    expectedGuests: 0,
    venue: 'Test Venue',
    setting: 'indoor',
    ...overrides,
  });
}

function overrunEvent(percent: number): CelebrationEvent {
  const total = 100_000;
  const planned = total + Math.round((total * percent) / 100);

  return cleanEvent({
    budget: makeBudget({
      totalAvailable: rupees(1_000),
      categories: [
        makeCategory({
          planned: { amountMinor: planned, currency: 'INR' },
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_000) },
        }),
      ],
    }),
  });
}

describe('risk engine financial checks', () => {
  it('detects a planned overrun and raises it to critical at the configured boundary', () => {
    const critical = analyze(makeWorkspace({ events: [overrunEvent(10)] }));
    const finding = rule(critical, 'financial.planned-overrun');

    expect(finding?.severity).toBe('critical');
    expect(finding?.category).toBe('financial');
    expect(finding?.certainty).toBe('confirmed');
    expect(finding?.evidence).toContainEqual({
      label: 'Overrun share',
      value: '10%',
    });
    expect(finding?.relatedEntities).toContainEqual({
      type: 'event',
      id: 'event-1',
    });

    const high = analyze(makeWorkspace({ events: [overrunEvent(9)] }));
    expect(rule(high, 'financial.planned-overrun')?.severity).toBe('high');

    const boundary = analyze(
      makeWorkspace({ events: [overrunEvent(10)] }),
      { criticalOverrunPercent: 11 },
    );
    expect(rule(boundary, 'financial.planned-overrun')?.severity).toBe('high');
  });

  it('flags when the overrun cannot be closed without cutting a protected category', () => {
    const result = analyze(
      makeWorkspace({
        events: [
          cleanEvent({
            budget: makeBudget({
              totalAvailable: rupees(1_000),
              categories: [
                makeCategory({
                  planned: rupees(1_100),
                  flexibility: { mode: 'protected' },
                }),
              ],
            }),
          }),
        ],
      }),
    );
    const finding = rule(result, 'financial.protected-reduction-required');

    expect(finding?.severity).toBe('high');
    expect(finding?.evidence).toContainEqual({
      label: 'Maximum flexible reduction',
      value: '₹0',
    });
    expect(finding?.recommendedAction).toMatch(/will not reduce protected/i);
  });

  it('detects actual spending above the total budget', () => {
    const result = analyze(
      makeWorkspace({
        events: [
          cleanEvent({
            budget: makeBudget({
              totalAvailable: rupees(1_000),
              categories: [makeCategory({ planned: rupees(0), actual: rupees(1_200) })],
            }),
          }),
        ],
      }),
    );
    const finding = rule(result, 'financial.actual-overrun');

    expect(finding?.severity).toBe('high');
    expect(finding?.title).toMatch(/actual spend exceeds/i);
  });

  it('grades reserve shortfalls at the configured percentage boundary', () => {
    const medium = analyze(
      makeWorkspace({
        events: [
          cleanEvent({
            budget: makeBudget({
              totalAvailable: rupees(1_000),
              categories: [
                makeCategory({
                  id: EMERGENCY_RESERVE_CATEGORY_ID,
                  name: 'Emergency reserve',
                  planned: rupees(60),
                  flexibility: { mode: 'protected' },
                }),
              ],
              emergencyReserve: { enabled: true, target: rupees(100) },
            }),
          }),
        ],
      }),
    );
    expect(rule(medium, 'financial.reserve-shortfall')?.severity).toBe('medium');

    const high = analyze(
      makeWorkspace({
        events: [
          cleanEvent({
            budget: makeBudget({
              totalAvailable: rupees(1_000),
              categories: [
                makeCategory({
                  id: EMERGENCY_RESERVE_CATEGORY_ID,
                  name: 'Emergency reserve',
                  planned: rupees(0),
                  flexibility: { mode: 'protected' },
                }),
              ],
              emergencyReserve: { enabled: true, target: rupees(100) },
            }),
          }),
        ],
      }),
    );
    expect(rule(high, 'financial.reserve-shortfall')?.severity).toBe('high');
  });

  it('reports invalid totals as a critical finding with a safe analysis error', () => {
    const result = analyze(
      makeWorkspace({
        events: [
          cleanEvent({
            name: 'Private Wedding Name',
            budget: makeBudget({
              totalAvailable: { amountMinor: -1, currency: 'INR' },
            }),
          }),
        ],
      }),
    );
    const finding = rule(result, 'financial.budget-invalid');

    expect(finding?.severity).toBe('critical');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.ruleId).toBe('financial.budget-invalid');
    expect(result.errors[0]?.message).not.toMatch(/Private Wedding Name/);
  });
});

describe('risk engine scheduling checks', () => {
  it('scales overdue-task severity with event proximity and task priority', () => {
    function workspaceFor(daysAhead: number, priority: 'high' | 'medium'): Workspace {
      return makeWorkspace({
        events: [
          cleanEvent({
            startsAt: addDays(TODAY, daysAhead),
            budget: makeBudget(),
          }),
        ],
        tasks: [
          makeTask({
            dueDate: addDays(TODAY, -2),
            priority,
          }),
        ],
      });
    }

    expect(
      rule(
        analyze(workspaceFor(8, 'high')),
        'scheduling.task-overdue',
      )?.severity,
    ).toBe('high');
    expect(
      rule(
        analyze(workspaceFor(7, 'high')),
        'scheduling.task-overdue',
      )?.severity,
    ).toBe('critical');
    expect(
      rule(
        analyze(workspaceFor(60, 'medium')),
        'scheduling.task-overdue',
      )?.severity,
    ).toBe('medium');
  });

  it('detects open tasks due after the event date', () => {
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent({ startsAt: '2099-06-01' })],
        tasks: [
          makeTask({
            dueDate: '2099-06-02',
            priority: 'medium',
          }),
        ],
      }),
    );

    expect(rule(result, 'scheduling.tasks-due-after-event')?.severity).toBe(
      'medium',
    );
  });

  it('raises high-priority work near the event and at the critical boundary', () => {
    function workspaceFor(daysAhead: number): Workspace {
      return makeWorkspace({
        events: [cleanEvent({ startsAt: addDays(TODAY, daysAhead) })],
        tasks: [
          makeTask({
            dueDate: addDays(TODAY, 3),
            priority: 'high',
          }),
        ],
      });
    }

    expect(
      rule(
        analyze(workspaceFor(10)),
        'scheduling.critical-tasks-open-near-event',
      )?.severity,
    ).toBe('high');
    expect(
      rule(
        analyze(workspaceFor(7)),
        'scheduling.critical-tasks-open-near-event',
      )?.severity,
    ).toBe('critical');
  });

  it('flags a near event with no preparation tasks, escalating inside the critical window', () => {
    function workspaceFor(daysAhead: number): Workspace {
      return makeWorkspace({
        events: [cleanEvent({ startsAt: addDays(TODAY, daysAhead) })],
      });
    }

    const medium = analyze(workspaceFor(10));
    expect(rule(medium, 'scheduling.no-tasks-near-event')?.severity).toBe('medium');

    const high = analyze(workspaceFor(7));
    expect(rule(high, 'scheduling.no-tasks-near-event')?.severity).toBe('high');
  });

  it('uses the configured minimum preparation window exactly', () => {
    function workspaceFor(daysAvailable: number): Workspace {
      return makeWorkspace({
        events: [cleanEvent({ startsAt: FAR_EVENT_DATE })],
        tasks: [
          makeTask({
            dueDate: addDays(TODAY, daysAvailable),
            priority: 'high',
          }),
        ],
      });
    }

    const tight = analyze(workspaceFor(2));
    expect(rule(tight, 'scheduling.preparation-window-tight')?.severity).toBe(
      'high',
    );

    const allowed = analyze(workspaceFor(3));
    expect(rule(allowed, 'scheduling.preparation-window-tight')).toBeUndefined();

    const custom = analyze(workspaceFor(3), { minimumPreparationDays: 4 });
    expect(rule(custom, 'scheduling.preparation-window-tight')?.severity).toBe(
      'high',
    );
  });

  it('surfaces overlapping activities as a review prompt without changing them', () => {
    const first = makeActivity({
      id: 'activity-a',
      title: 'Ceremony',
      startsAt: '2099-05-31T10:00',
      endsAt: '2099-05-31T11:00',
      priority: 'high',
    });
    const second = makeActivity({
      id: 'activity-b',
      title: 'Photos',
      startsAt: '2099-05-31T10:30',
      endsAt: '2099-05-31T11:30',
      priority: 'high',
    });
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent()],
        activities: [first, second],
      }),
    );
    const finding = rule(result, 'scheduling.activity-overlap');

    expect(finding?.severity).toBe('high');
    expect(finding?.certainty).toBe('confirmed');
    expect(finding?.recommendedAction).toMatch(/nothing was moved/i);
    expect(finding?.relatedEntities).toContainEqual({
      type: 'activity',
      id: 'activity-a',
    });

    const medium = analyze(
      makeWorkspace({
        events: [cleanEvent()],
        activities: [
          first,
          makeActivity({
            ...second,
            priority: 'medium',
          }),
        ],
      }),
    );
    expect(rule(medium, 'scheduling.activity-overlap')?.severity).toBe('medium');
  });

  it('skips date-based scheduling checks when the event date is invalid', () => {
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent({ startsAt: '2026-13-01' })],
        tasks: [makeTask({ dueDate: addDays(TODAY, -1), priority: 'high' })],
      }),
    );

    expect(result.errors).toContainEqual(
      expect.objectContaining({ ruleId: 'scheduling.invalid-event-date' }),
    );
    expect(ruleIds(result)).not.toContain('scheduling.task-overdue');
    expect(result.errors[0]?.message).toMatch(/date-based checks were skipped/i);
  });

  it('does not report scheduling risks for a past event', () => {
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent({ startsAt: addDays(TODAY, -1) })],
        tasks: [makeTask({ dueDate: addDays(TODAY, -5), priority: 'high' })],
      }),
    );

    expect(result.detections.filter((entry) => entry.category === 'scheduling')).toHaveLength(
      0,
    );
  });
});

describe('risk engine guest and catering checks', () => {
  it('labels a large event with no guest records as an information gap', () => {
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent({ expectedGuests: 20 })],
      }),
    );
    const finding = rule(result, 'guest-catering.guest-list-missing');

    expect(finding?.severity).toBe('low');
    expect(finding?.certainty).toBe('missing-data');
    expect(finding?.title).toMatch(/not recorded/i);

    const belowThreshold = analyze(
      makeWorkspace({ events: [cleanEvent({ expectedGuests: 19 })] }),
    );
    expect(rule(belowThreshold, 'guest-catering.guest-list-missing')).toBeUndefined();
  });

  it('uses the pending RSVP threshold and event proximity', () => {
    function workspaceFor(daysAhead: number): Workspace {
      return makeWorkspace({
        events: [
          cleanEvent({
            startsAt: addDays(TODAY, daysAhead),
            expectedGuests: 8,
          }),
        ],
        guests: Array.from({ length: 8 }, (_, index) =>
          makeGuest({
            id: `guest-${index}`,
            rsvp: 'pending',
          }),
        ),
      });
    }

    expect(
      rule(analyze(workspaceFor(30)), 'guest-catering.rsvp-incomplete')?.severity,
    ).toBe('medium');
    expect(
      rule(analyze(workspaceFor(10)), 'guest-catering.rsvp-incomplete')?.severity,
    ).toBe('high');

    const belowThreshold = analyze(
      makeWorkspace({
        events: [cleanEvent({ expectedGuests: 8 })],
        guests: [
          ...Array.from({ length: 8 }, (_, index) =>
            makeGuest({ id: `confirmed-${index}`, rsvp: 'confirmed' }),
          ),
          ...Array.from({ length: 2 }, (_, index) =>
            makeGuest({ id: `pending-${index}`, rsvp: 'pending' }),
          ),
        ],
      }),
    );
    expect(
      rule(belowThreshold, 'guest-catering.rsvp-incomplete'),
    ).toBeUndefined();
  });

  it('applies the attendance deviation boundary in both directions', () => {
    const above = analyze(
      makeWorkspace({
        events: [cleanEvent({ expectedGuests: 10 })],
        guests: Array.from({ length: 12 }, (_, index) =>
          makeGuest({ id: `guest-${index}`, rsvp: 'confirmed' }),
        ),
      }),
    );
    const aboveFinding = rule(above, 'guest-catering.attendance-deviation');
    expect(aboveFinding?.severity).toBe('high');
    expect(aboveFinding?.certainty).toBe('confirmed');

    const withinThreshold = analyze(
      makeWorkspace({
        events: [cleanEvent({ expectedGuests: 10 })],
        guests: Array.from({ length: 11 }, (_, index) =>
          makeGuest({ id: `guest-${index}`, rsvp: 'confirmed' }),
        ),
      }),
    );
    expect(
      rule(withinThreshold, 'guest-catering.attendance-deviation'),
    ).toBeUndefined();

    const below = analyze(
      makeWorkspace({
        events: [cleanEvent({ expectedGuests: 10 })],
        guests: [
          ...Array.from({ length: 4 }, (_, index) =>
            makeGuest({ id: `confirmed-${index}`, rsvp: 'confirmed' }),
          ),
          makeGuest({ id: 'pending-1', rsvp: 'pending' }),
        ],
      }),
    );
    const belowFinding = rule(below, 'guest-catering.attendance-deviation');
    expect(belowFinding?.severity).toBe('medium');
    expect(belowFinding?.certainty).toBe('potential');
  });

  it('compares the catering estimate with its allocation at the severity boundary', () => {
    function workspaceFor(perPerson: number): Workspace {
      return makeWorkspace({
        events: [
          cleanEvent({
            expectedGuests: 1,
            budget: makeBudget({
              totalAvailable: rupees(5_000),
              categories: [
                makeCategory({
                  id: 'catering',
                  name: 'Catering',
                  planned: rupees(1_000),
                  flexibility: { mode: 'flexible', minimumPlanned: rupees(0) },
                }),
              ],
            }),
          }),
        ],
        guests: [makeGuest({ rsvp: 'confirmed' })],
        cateringEstimates: [
          makeCateringEstimate({
            perPersonCost: rupees(perPerson),
            bufferPercent: 0,
          }),
        ],
      });
    }

    const medium = analyze(workspaceFor(1_050));
    expect(rule(medium, 'guest-catering.catering-over-plan')?.severity).toBe(
      'medium',
    );

    const high = analyze(workspaceFor(1_100));
    expect(rule(high, 'guest-catering.catering-over-plan')?.severity).toBe('high');
    expect(
      rule(high, 'guest-catering.catering-over-plan')?.certainty,
    ).toBe('assumption');
  });

  it('warns when the estimate covers fewer attendees than planned', () => {
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent({ expectedGuests: 10 })],
        guests: [
          ...Array.from({ length: 3 }, (_, index) =>
            makeGuest({ id: `guest-${index}`, rsvp: 'confirmed' }),
          ),
        ],
        cateringEstimates: [
          makeCateringEstimate({ perPersonCost: rupees(100), bufferPercent: 0 }),
        ],
      }),
    );
    const finding = rule(result, 'guest-catering.catering-below-expected');

    expect(finding?.severity).toBe('high');
    expect(finding?.certainty).toBe('confirmed');
    expect(finding?.evidence).toContainEqual({
      label: 'Estimated attendees',
      value: '3',
    });
  });

  it('labels a missing catering assumption near the event as an information gap', () => {
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent({ startsAt: addDays(TODAY, 10), expectedGuests: 1 })],
      }),
    );
    const finding = rule(result, 'guest-catering.catering-estimate-missing');

    expect(finding?.severity).toBe('low');
    expect(finding?.certainty).toBe('missing-data');

    const far = analyze(
      makeWorkspace({
        events: [cleanEvent({ startsAt: FAR_EVENT_DATE, expectedGuests: 1 })],
      }),
    );
    expect(rule(far, 'guest-catering.catering-estimate-missing')).toBeUndefined();
  });

  it('reports an unreadable saved estimate without inventing values', () => {
    const result = analyze(
      makeWorkspace({
        events: [cleanEvent({ expectedGuests: 1 })],
        cateringEstimates: [
          makeCateringEstimate({
            perPersonCost: { amountMinor: -1, currency: 'INR' },
          }),
        ],
      }),
    );

    expect(rule(result, 'guest-catering.catering-estimate-invalid')?.severity).toBe(
      'high',
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        ruleId: 'guest-catering.catering-estimate-invalid',
      }),
    );
  });

  it('links confirmed guest accessibility requests to the event readiness gap', () => {
    const workspace = makeWorkspace({
      events: [cleanEvent({ expectedGuests: 1 })],
      guests: [
        makeGuest({
          rsvp: 'confirmed',
          accessibilityRequest: 'Step-free access to the stage',
        }),
      ],
    });
    const far = analyze(workspace);
    const finding = rule(far, 'guest-catering.guest-accessibility');

    expect(finding?.severity).toBe('medium');
    expect(finding?.certainty).toBe('missing-data');
    expect(finding?.relatedEntities).toContainEqual({
      type: 'guest',
      id: 'guest-1',
    });

    const near = analyze(
      makeWorkspace({
        events: [
          cleanEvent({ startsAt: addDays(TODAY, 10), expectedGuests: 1 }),
        ],
        guests: workspace.guests,
      }),
    );
    expect(
      rule(near, 'guest-catering.guest-accessibility')?.severity,
    ).toBe('high');
  });
});

describe('risk engine venue and contingency checks', () => {
  it('labels an unrecorded setting only inside the near window', () => {
    const near = analyze(
      makeWorkspace({
        events: [
          makeEvent({
            startsAt: addDays(TODAY, 10),
            expectedGuests: 0,
            venue: 'Test Venue',
          }),
        ],
      }),
    );
    const finding = rule(near, 'venue-contingency.setting-missing');

    expect(finding?.severity).toBe('low');
    expect(finding?.certainty).toBe('missing-data');

    const far = analyze(
      makeWorkspace({
        events: [
          makeEvent({
            startsAt: FAR_EVENT_DATE,
            expectedGuests: 0,
            venue: 'Test Venue',
          }),
        ],
      }),
    );
    expect(rule(far, 'venue-contingency.setting-missing')).toBeUndefined();
  });

  it('requires a contingency plan for outdoor and mixed events', () => {
    const outdoor = analyze(
      makeWorkspace({ events: [cleanEvent({ setting: 'outdoor' })] }),
    );
    const finding = rule(outdoor, 'venue-contingency.weather-contingency-missing');

    expect(finding?.severity).toBe('medium');
    expect(finding?.certainty).toBe('missing-data');

    const denied = analyze(
      makeWorkspace({
        events: [cleanEvent({ setting: 'outdoor', contingencyPlanConfirmed: false })],
      }),
    );
    expect(
      rule(denied, 'venue-contingency.weather-contingency-missing')?.certainty,
    ).toBe('confirmed');

    const confirmed = analyze(
      makeWorkspace({
        events: [cleanEvent({ setting: 'mixed', contingencyPlanConfirmed: true })],
      }),
    );
    expect(
      rule(confirmed, 'venue-contingency.weather-contingency-missing'),
    ).toBeUndefined();
  });

  it('flags required accessibility that is not recorded as addressed', () => {
    const result = analyze(
      makeWorkspace({
        events: [
          cleanEvent({
            startsAt: addDays(TODAY, 10),
            accessibilityRequired: true,
          }),
        ],
      }),
    );
    const finding = rule(result, 'venue-contingency.accessibility-unaddressed');

    expect(finding?.severity).toBe('high');
    expect(finding?.certainty).toBe('missing-data');

    const explicitlyMissing = analyze(
      makeWorkspace({
        events: [
          cleanEvent({
            accessibilityRequired: true,
            accessibilityAddressed: false,
          }),
        ],
      }),
    );
    expect(
      rule(explicitlyMissing, 'venue-contingency.accessibility-unaddressed')
        ?.certainty,
    ).toBe('confirmed');
  });

  it('labels unknown accessibility needs and a missing venue for large near events', () => {
    const result = analyze(
      makeWorkspace({
        events: [
          makeEvent({
            startsAt: addDays(TODAY, 10),
            expectedGuests: 25,
            venue: '',
            setting: 'indoor',
          }),
        ],
      }),
    );

    expect(
      rule(result, 'venue-contingency.accessibility-unknown')?.certainty,
    ).toBe('missing-data');
    expect(rule(result, 'venue-contingency.venue-missing')?.severity).toBe(
      'medium',
    );
    expect(
      rule(result, 'venue-contingency.venue-missing')?.relatedEntities,
    ).toContainEqual({ type: 'event', id: 'event-1' });
  });
});

describe('risk engine rescue proposal consistency', () => {
  function proposalWorkspace(
    event: CelebrationEvent,
    snapshotOverrides: Partial<RiskProposalSnapshot> = {},
  ): Workspace {
    return makeWorkspace({
      events: [event],
      rescueProposalSnapshots: [
        makeProposalSnapshot({
          eventId: event.id,
          ...snapshotOverrides,
        }),
      ],
    });
  }

  it('flags a stale proposal and escalates it inside the critical window', () => {
    const far = analyze(
      proposalWorkspace(cleanEvent(), {
        originalEventSignature: 'older-signature',
        relatedDataSignature: 'older-related-signature',
        affectedCategoryIds: ['venue'],
        protectedCategoryIds: ['venue'],
      }),
    );
    expect(rule(far, 'proposal-consistency.stale')?.severity).toBe('high');

    const near = analyze(
      proposalWorkspace(cleanEvent({ startsAt: addDays(TODAY, 7) }), {
        originalEventSignature: 'older-signature',
        relatedDataSignature: 'older-related-signature',
        affectedCategoryIds: ['venue'],
        protectedCategoryIds: ['venue'],
      }),
    );
    expect(rule(near, 'proposal-consistency.stale')?.severity).toBe('critical');
  });

  it('flags a stale proposal that now conflicts with a protected category', () => {
    const event = cleanEvent({
      budget: makeBudget({
        totalAvailable: rupees(1_000),
        categories: [
          makeCategory({
            id: 'venue',
            name: 'Venue',
            planned: rupees(500),
            flexibility: { mode: 'protected' },
          }),
        ],
      }),
    });
    const result = analyze(
      proposalWorkspace(event, {
        originalEventSignature: 'older-signature',
        relatedDataSignature: 'older-related-signature',
        affectedCategoryIds: ['venue'],
        protectedCategoryIds: [],
      }),
    );
    const finding = rule(result, 'proposal-consistency.protected-conflict');

    expect(finding?.severity).toBe('high');
    expect(finding?.title).toMatch(/conflicts with current protections/i);
    expect(finding?.relatedEntities).toContainEqual({
      type: 'rescue-proposal',
      id: 'proposal-1',
    });
  });

  it('does not flag a proposal whose recorded signatures still match', () => {
    const event = cleanEvent();
    const result = analyze(
      proposalWorkspace(event, {
        originalEventSignature: createEventSnapshotSignature(event),
        relatedDataSignature: createProposalDataSignature(event, [], [], [], null),
        affectedCategoryIds: ['venue'],
        protectedCategoryIds: ['venue'],
      }),
    );

    expect(
      result.detections.filter(
        (detection) => detection.category === 'proposal-consistency',
      ),
    ).toHaveLength(0);
  });

  it('keeps proposal findings isolated to their own event', () => {
    const eventOne = cleanEvent();
    const workspace = makeWorkspace({
      events: [eventOne],
      rescueProposalSnapshots: [
        makeProposalSnapshot({
          eventId: 'another-event',
          originalEventSignature: 'older-signature',
          relatedDataSignature: 'older-related-signature',
        }),
      ],
    });

    const result = analyze(workspace);
    expect(
      result.detections.filter(
        (detection) => detection.category === 'proposal-consistency',
      ),
    ).toHaveLength(0);
  });
});

describe('risk thresholds and deterministic output', () => {
  it('merges valid overrides and rejects unsafe or unknown values', () => {
    const resolved = resolveRiskThresholds({ nearEventDays: 21 });

    expect(resolved.nearEventDays).toBe(21);
    expect(resolved.criticalWindowDays).toBe(
      DEFAULT_RISK_THRESHOLDS.criticalWindowDays,
    );
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(() => resolveRiskThresholds({ pendingRsvpHighPercent: 101 })).toThrow(
      /percentage from 0 to 100/i,
    );
    expect(() => resolveRiskThresholds({ largeEventGuestCount: 0 })).toThrow(
      /at least 1/i,
    );
    expect(() => resolveRiskThresholds({ minimumPreparationDays: -1 })).toThrow(
      /non-negative whole number/i,
    );
    expect(() => resolveRiskThresholds({ minimumPreparationDays: 366 })).toThrow(
      /365 days or fewer/i,
    );
    expect(() =>
      resolveRiskThresholds({ nearEventDays: 7, criticalWindowDays: 8 }),
    ).toThrow(/critical window/i);
    expect(() =>
      resolveRiskThresholds({ unknownThreshold: 1 } as unknown as Partial<RiskThresholds>),
    ).toThrow(/Unknown risk threshold/i);
  });

  it('uses a custom near-event window when grading a pending RSVP finding', () => {
    const workspace = makeWorkspace({
      events: [
        cleanEvent({
          startsAt: addDays(TODAY, 20),
          expectedGuests: 8,
        }),
      ],
      guests: Array.from({ length: 8 }, (_, index) =>
        makeGuest({ id: `guest-${index}`, rsvp: 'pending' }),
      ),
    });

    expect(
      rule(analyze(workspace), 'guest-catering.rsvp-incomplete')?.severity,
    ).toBe('medium');
    expect(
      rule(analyze(workspace, { nearEventDays: 20 }), 'guest-catering.rsvp-incomplete')
        ?.severity,
    ).toBe('high');
  });

  it('uses custom materiality thresholds for guest gaps', () => {
    const workspace = makeWorkspace({
      events: [cleanEvent({ expectedGuests: 20 })],
    });

    expect(
      rule(analyze(workspace), 'guest-catering.guest-list-missing'),
    ).toBeDefined();
    expect(
      rule(
        analyze(workspace, { largeEventGuestCount: 21 }),
        'guest-catering.guest-list-missing',
      ),
    ).toBeUndefined();

    const pendingWorkspace = makeWorkspace({
      events: [cleanEvent({ expectedGuests: 8 })],
      guests: [
        ...Array.from({ length: 8 }, (_, index) =>
          makeGuest({ id: `confirmed-${index}`, rsvp: 'confirmed' }),
        ),
        makeGuest({ id: 'pending-1', rsvp: 'pending' }),
        makeGuest({ id: 'pending-2', rsvp: 'pending' }),
      ],
    });
    expect(
      rule(analyze(pendingWorkspace), 'guest-catering.rsvp-incomplete'),
    ).toBeUndefined();
    expect(
      rule(
        analyze(pendingWorkspace, {
          pendingRsvpMinimumCount: 1,
          pendingRsvpHighPercent: 10,
        }),
        'guest-catering.rsvp-incomplete',
      ),
    ).toBeDefined();
  });

  it('rejects an invalid analysis date', () => {
    expect(() =>
      analyzeWorkspaceRisks({
        workspace: makeWorkspace(),
        todayIso: '24-10-2026',
      }),
    ).toThrow(/valid local date/i);
  });

  it('produces stable, unique identifiers across repeated analysis', () => {
    const workspace = makeWorkspace({
      events: [
        cleanEvent({
          startsAt: addDays(TODAY, 10),
          expectedGuests: 10,
          budget: makeBudget({
            totalAvailable: rupees(1_000),
            categories: [makeCategory({ planned: rupees(1_100) })],
          }),
          setting: 'outdoor',
        }),
      ],
      tasks: [
        makeTask({
          dueDate: addDays(TODAY, -2),
          priority: 'high',
        }),
      ],
      guests: Array.from({ length: 4 }, (_, index) =>
        makeGuest({ id: `guest-${index}`, rsvp: 'pending' }),
      ),
      activities: [
        makeActivity({
          id: 'activity-a',
          startsAt: `${addDays(TODAY, 2)}T10:00`,
          endsAt: `${addDays(TODAY, 2)}T11:00`,
        }),
        makeActivity({
          id: 'activity-b',
          startsAt: `${addDays(TODAY, 2)}T10:30`,
          endsAt: `${addDays(TODAY, 2)}T11:30`,
        }),
      ],
    });

    const first = analyze(workspace);
    const second = analyze(workspace);
    const ids = first.detections.map((detection) => detection.id);

    expect(second.detections.map((detection) => detection.id)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.detections.length).toBeGreaterThan(4);
    expect(
      first.detections.every((detection) => detection.id.startsWith('risk:event-1:')),
    ).toBe(true);
  });

  it('keeps every detection scoped to its own event and skips completed events', () => {
    const result = analyze(
      makeWorkspace({
        events: [
          cleanEvent({ id: 'clean-event', name: 'Clean Event' }),
          cleanEvent({
            id: 'overrun-event',
            name: 'Overrun Event',
            budget: makeBudget({
              totalAvailable: rupees(1_000),
              categories: [makeCategory({ planned: rupees(1_200) })],
            }),
          }),
          cleanEvent({
            id: 'completed-event',
            status: 'completed',
            budget: makeBudget({
              totalAvailable: rupees(1_000),
              categories: [makeCategory({ planned: rupees(1_200) })],
            }),
          }),
        ],
      }),
    );

    expect(result.analyzedEventIds).toEqual(['clean-event', 'overrun-event']);
    expect(result.detections.length).toBeGreaterThan(0);
    expect(
      result.detections.every((detection) => detection.eventId === 'overrun-event'),
    ).toBe(true);
    expect(
      result.detections.some((detection) => detection.eventId === 'completed-event'),
    ).toBe(false);
  });
});
