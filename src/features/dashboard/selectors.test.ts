import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import {
  makeActivity,
  makeBudget,
  makeCateringEstimate,
  makeCategory,
  makeEvent,
  makeGuest,
  makeTask,
  makeWorkspace,
} from '@/test/fixtures';
import {
  ALL_EVENTS_SCOPE,
  filterTasks,
  isUpcomingEvent,
  selectBudgetSummary,
  selectCateringOverview,
  selectDashboardSummary,
  selectGuestSummary,
  selectScopedActivities,
  selectScopedEvents,
  selectScopedTasks,
  selectTaskProgress,
  selectUpcomingActivitiesForScope,
  selectUpcomingEvents,
  sortTasksForOverview,
} from './selectors';

const TODAY = '2026-10-24';

const wedding = makeEvent({
  id: 'wedding',
  name: 'Wedding',
  startsAt: '2026-11-10',
  status: 'on-track',
  budget: makeBudget({
    eventId: 'wedding',
    totalAvailable: rupees(1_000),
    categories: [
      makeCategory({
        id: 'w-venue',
        name: 'Venue',
        planned: rupees(600),
        actual: rupees(200),
        flexibility: { mode: 'protected' },
      }),
      makeCategory({
        id: 'w-catering',
        name: 'Catering',
        planned: rupees(500),
        actual: rupees(550),
        flexibility: { mode: 'flexible', minimumPlanned: rupees(100) },
      }),
    ],
  }),
});
const birthday = makeEvent({
  id: 'birthday',
  name: 'Birthday',
  startsAt: TODAY,
  status: 'at-risk',
  budget: makeBudget({
    eventId: 'birthday',
    totalAvailable: rupees(500),
    categories: [
      makeCategory({
        id: 'b-decor',
        name: 'Décor',
        planned: rupees(100),
        actual: rupees(40),
        flexibility: { mode: 'flexible', minimumPlanned: rupees(50) },
      }),
    ],
  }),
});
const completed = makeEvent({
  id: 'completed',
  name: 'Completed',
  startsAt: '2026-10-01',
  status: 'completed',
  budget: makeBudget({ eventId: 'completed', totalAvailable: rupees(200) }),
});
const pastOpen = makeEvent({
  id: 'past-open',
  name: 'Past open',
  startsAt: '2026-10-20',
  status: 'planning',
  budget: makeBudget({ eventId: 'past-open', totalAvailable: rupees(300) }),
});

const tasks = [
  makeTask({
    id: 'late-open',
    eventId: 'wedding',
    title: 'B task',
    dueDate: '2026-11-05',
  }),
  makeTask({
    id: 'early-open-b',
    eventId: 'wedding',
    title: 'Z task',
    dueDate: '2026-11-01',
  }),
  makeTask({
    id: 'early-open-a',
    eventId: 'birthday',
    title: 'A task',
    dueDate: '2026-11-01',
  }),
  makeTask({
    id: 'completed-task',
    eventId: 'wedding',
    title: 'A done task',
    dueDate: '2026-10-01',
    status: 'completed',
  }),
];

const workspace = makeWorkspace({
  events: [wedding, birthday, completed, pastOpen],
  tasks,
  guests: [makeGuest({ id: 'guest-1', eventId: 'wedding' })],
});

describe('isUpcomingEvent', () => {
  it('includes today and future events that are not completed', () => {
    expect(isUpcomingEvent(birthday, TODAY)).toBe(true);
    expect(isUpcomingEvent(wedding, TODAY)).toBe(true);
  });

  it('excludes completed events and events before today', () => {
    expect(isUpcomingEvent(completed, TODAY)).toBe(false);
    expect(isUpcomingEvent(pastOpen, TODAY)).toBe(false);
  });
});

describe('selectUpcomingEvents', () => {
  it('returns only upcoming events, nearest first', () => {
    expect(selectUpcomingEvents(workspace, TODAY).map((event) => event.id)).toEqual([
      'birthday',
      'wedding',
    ]);
  });
});

describe('selectDashboardSummary', () => {
  it('counts events and pending tasks and sums planned budgets in minor units', () => {
    expect(selectDashboardSummary(workspace, TODAY)).toEqual({
      totalEvents: 4,
      upcomingEvents: 2,
      plannedBudget: rupees(2_000),
      pendingTasks: 3,
      overdueTasks: 0,
      taskCompletionPercent: 25,
    });
  });

  it('reports zero values for an empty workspace', () => {
    expect(selectDashboardSummary(makeWorkspace(), TODAY)).toEqual({
      totalEvents: 0,
      upcomingEvents: 0,
      plannedBudget: { amountMinor: 0, currency: 'INR' },
      pendingTasks: 0,
      overdueTasks: 0,
      taskCompletionPercent: 0,
    });
  });
});

describe('selectScopedEvents', () => {
  it('returns all events for the all-events scope', () => {
    expect(selectScopedEvents(workspace, ALL_EVENTS_SCOPE)).toHaveLength(4);
  });

  it('returns only the selected event', () => {
    expect(selectScopedEvents(workspace, 'birthday')).toEqual([birthday]);
  });

  it('returns an empty list for an unknown scope', () => {
    expect(selectScopedEvents(workspace, 'missing')).toEqual([]);
  });
});

describe('selectBudgetSummary', () => {
  it('aggregates allocations by category across all events', () => {
    expect(selectBudgetSummary(workspace, ALL_EVENTS_SCOPE)).toEqual({
      eventCount: 4,
      totalBudget: rupees(2_000),
      plannedExpenses: rupees(1_200),
      actualExpenses: rupees(790),
      remaining: rupees(800),
      overrun: rupees(0),
      usagePercent: 60,
      isOverBudget: false,
      allocations: [
        {
          key: 'venue',
          label: 'Venue',
          planned: rupees(600),
          actual: rupees(200),
          protection: 'protected',
        },
        {
          key: 'catering',
          label: 'Catering',
          planned: rupees(500),
          actual: rupees(550),
          protection: 'flexible',
        },
        {
          key: 'décor',
          label: 'Décor',
          planned: rupees(100),
          actual: rupees(40),
          protection: 'flexible',
        },
      ],
      protectedPlanned: rupees(600),
      flexiblePlanned: rupees(600),
      reservePlanned: rupees(0),
      reserveTarget: rupees(0),
      reserveConfigured: false,
    });
  });

  it('reports an over-budget selection with explicit overrun and remaining amounts', () => {
    const summary = selectBudgetSummary(workspace, 'wedding');

    expect(summary.totalBudget).toEqual(rupees(1_000));
    expect(summary.plannedExpenses).toEqual(rupees(1_100));
    expect(summary.actualExpenses).toEqual(rupees(750));
    expect(summary.remaining).toEqual(rupees(-100));
    expect(summary.overrun).toEqual(rupees(100));
    expect(summary.usagePercent).toBe(110);
    expect(summary.isOverBudget).toBe(true);
    expect(summary.protectedPlanned).toEqual(rupees(600));
    expect(summary.flexiblePlanned).toEqual(rupees(500));
    expect(summary.allocations).toHaveLength(2);
  });

  it('leaves the full budget unallocated when no categories are recorded', () => {
    const summary = selectBudgetSummary(
      makeWorkspace({
        events: [
          makeEvent({
            id: 'plain',
            budget: makeBudget({ eventId: 'plain', totalAvailable: rupees(500) }),
          }),
        ],
      }),
      'plain',
    );

    expect(summary).toEqual({
      eventCount: 1,
      totalBudget: rupees(500),
      plannedExpenses: { amountMinor: 0, currency: 'INR' },
      actualExpenses: { amountMinor: 0, currency: 'INR' },
      remaining: rupees(500),
      overrun: { amountMinor: 0, currency: 'INR' },
      usagePercent: 0,
      isOverBudget: false,
      allocations: [],
      protectedPlanned: { amountMinor: 0, currency: 'INR' },
      flexiblePlanned: { amountMinor: 0, currency: 'INR' },
      reservePlanned: { amountMinor: 0, currency: 'INR' },
      reserveTarget: { amountMinor: 0, currency: 'INR' },
      reserveConfigured: false,
    });
  });

  it('excludes the reserve from allocation rows and reports mixed protection', () => {
    const summary = selectBudgetSummary(
      makeWorkspace({
        events: [
          makeEvent({
            id: 'mixed',
            budget: makeBudget({
              eventId: 'mixed',
              totalAvailable: rupees(1_000),
              emergencyReserve: { enabled: true, target: rupees(200) },
              categories: [
                makeCategory({
                  id: 'venue-a',
                  name: 'Venue',
                  planned: rupees(300),
                  actual: rupees(100),
                  flexibility: { mode: 'protected' },
                }),
                makeCategory({
                  id: 'venue-b',
                  name: 'Venue',
                  planned: rupees(200),
                  actual: rupees(50),
                  flexibility: { mode: 'flexible', minimumPlanned: rupees(100) },
                }),
                makeCategory({
                  id: 'emergency-reserve',
                  name: 'Emergency reserve',
                  planned: rupees(200),
                  actual: rupees(0),
                  flexibility: { mode: 'protected' },
                }),
              ],
            }),
          }),
        ],
      }),
      'mixed',
    );

    expect(summary.allocations).toEqual([
      {
        key: 'venue',
        label: 'Venue',
        planned: rupees(500),
        actual: rupees(150),
        protection: 'mixed',
      },
    ]);
    expect(summary.reservePlanned).toEqual(rupees(200));
    expect(summary.reserveTarget).toEqual(rupees(200));
    expect(summary.reserveConfigured).toBe(true);
    expect(summary.plannedExpenses).toEqual(rupees(700));
    expect(summary.protectedPlanned).toEqual(rupees(500));
    expect(summary.flexiblePlanned).toEqual(rupees(200));
  });

  it('returns an empty summary for an unknown scope', () => {
    expect(selectBudgetSummary(workspace, 'missing')).toEqual({
      eventCount: 0,
      totalBudget: { amountMinor: 0, currency: 'INR' },
      plannedExpenses: { amountMinor: 0, currency: 'INR' },
      actualExpenses: { amountMinor: 0, currency: 'INR' },
      remaining: { amountMinor: 0, currency: 'INR' },
      overrun: { amountMinor: 0, currency: 'INR' },
      usagePercent: 0,
      isOverBudget: false,
      allocations: [],
      protectedPlanned: { amountMinor: 0, currency: 'INR' },
      flexiblePlanned: { amountMinor: 0, currency: 'INR' },
      reservePlanned: { amountMinor: 0, currency: 'INR' },
      reserveTarget: { amountMinor: 0, currency: 'INR' },
      reserveConfigured: false,
    });
  });
});

describe('timeline, guest, and catering selectors', () => {
  it('sorts scoped activities chronologically and excludes unlinked events', () => {
    const activityWorkspace = makeWorkspace({
      events: [wedding, birthday],
      activities: [
        makeActivity({
          id: 'w-late',
          eventId: 'wedding',
          startsAt: '2026-11-30T12:00',
          endsAt: '2026-11-30T13:00',
        }),
        makeActivity({
          id: 'w-early',
          eventId: 'wedding',
          startsAt: '2026-11-30T09:00',
          endsAt: '2026-11-30T10:00',
          status: 'completed',
        }),
        makeActivity({
          id: 'w-next',
          eventId: 'wedding',
          startsAt: '2026-12-01T09:00',
          endsAt: '2026-12-01T10:00',
        }),
        makeActivity({
          id: 'b-next',
          eventId: 'birthday',
          startsAt: '2026-11-29T09:00',
          endsAt: '2026-11-29T10:00',
        }),
        makeActivity({
          id: 'unlinked',
          eventId: 'missing-event',
          startsAt: '2026-11-28T09:00',
          endsAt: '2026-11-28T10:00',
        }),
      ],
    });

    expect(
      selectScopedActivities(activityWorkspace, ALL_EVENTS_SCOPE).map(
        (activity) => activity.id,
      ),
    ).toEqual(['b-next', 'w-early', 'w-late', 'w-next']);
    expect(
      selectScopedActivities(activityWorkspace, 'wedding').map(
        (activity) => activity.id,
      ),
    ).toEqual(['w-early', 'w-late', 'w-next']);
  });

  it('selects upcoming activities for the scope, excluding completed work', () => {
    const activityWorkspace = makeWorkspace({
      events: [wedding, birthday],
      activities: [
        makeActivity({
          id: 'w-early',
          eventId: 'wedding',
          startsAt: '2026-11-30T09:00',
          endsAt: '2026-11-30T10:00',
          status: 'completed',
        }),
        makeActivity({
          id: 'w-late',
          eventId: 'wedding',
          startsAt: '2026-11-30T12:00',
          endsAt: '2026-11-30T13:00',
        }),
        makeActivity({
          id: 'w-next',
          eventId: 'wedding',
          startsAt: '2026-12-01T09:00',
          endsAt: '2026-12-01T10:00',
        }),
        makeActivity({
          id: 'b-next',
          eventId: 'birthday',
          startsAt: '2026-11-29T09:00',
          endsAt: '2026-11-29T10:00',
        }),
      ],
    });

    expect(
      selectUpcomingActivitiesForScope(
        activityWorkspace,
        'wedding',
        '2026-11-30T10:30',
      ).map((activity) => activity.id),
    ).toEqual(['w-late', 'w-next']);
    expect(
      selectUpcomingActivitiesForScope(
        activityWorkspace,
        'wedding',
        '2026-11-30T10:30',
        1,
      ).map((activity) => activity.id),
    ).toEqual(['w-late']);
    expect(
      selectUpcomingActivitiesForScope(
        activityWorkspace,
        ALL_EVENTS_SCOPE,
        '2026-11-29T08:00',
        2,
      ).map((activity) => activity.id),
    ).toEqual(['b-next', 'w-late']);
  });

  it('counts invited, confirmed, pending, and declined guests per scope', () => {
    const guestWorkspace = makeWorkspace({
      events: [wedding, birthday],
      guests: [
        makeGuest({ id: 'w-1', eventId: 'wedding', name: 'Ana', rsvp: 'confirmed' }),
        makeGuest({ id: 'w-2', eventId: 'wedding', name: 'Bela', rsvp: 'confirmed' }),
        makeGuest({ id: 'w-3', eventId: 'wedding', name: 'Cara', rsvp: 'pending' }),
        makeGuest({ id: 'w-4', eventId: 'wedding', name: 'Dia', rsvp: 'declined' }),
        makeGuest({ id: 'b-1', eventId: 'birthday', name: 'Eli', rsvp: 'confirmed' }),
      ],
    });

    expect(selectGuestSummary(guestWorkspace, 'wedding')).toEqual({
      invited: 4,
      confirmed: 2,
      pending: 1,
      declined: 1,
    });
    expect(selectGuestSummary(guestWorkspace, ALL_EVENTS_SCOPE)).toEqual({
      invited: 5,
      confirmed: 3,
      pending: 1,
      declined: 1,
    });
    expect(selectGuestSummary(guestWorkspace, 'missing')).toEqual({
      invited: 0,
      confirmed: 0,
      pending: 0,
      declined: 0,
    });
  });

  it('aggregates catering estimates from confirmed guests and labels expected-count fallbacks', () => {
    const cateringWorkspace = makeWorkspace({
      events: [wedding, birthday],
      guests: [
        makeGuest({ id: 'w-1', eventId: 'wedding', rsvp: 'confirmed' }),
        makeGuest({ id: 'w-2', eventId: 'wedding', rsvp: 'confirmed' }),
        makeGuest({ id: 'w-3', eventId: 'wedding', rsvp: 'declined' }),
      ],
      cateringEstimates: [
        makeCateringEstimate({
          eventId: 'wedding',
          perPersonCost: rupees(100),
          bufferPercent: 10,
        }),
        makeCateringEstimate({
          eventId: 'birthday',
          perPersonCost: rupees(50),
          bufferPercent: 0,
        }),
      ],
    });

    expect(selectCateringOverview(cateringWorkspace, 'wedding')).toEqual({
      scopedEvents: 1,
      configuredEvents: 1,
      estimatedCost: rupees(300),
      plannedCatering: rupees(500),
      differenceMinor: -20_000,
      usesExpectedGuestCount: false,
      eventsWithoutCateringPlan: 0,
    });
    expect(selectCateringOverview(cateringWorkspace, ALL_EVENTS_SCOPE)).toEqual({
      scopedEvents: 2,
      configuredEvents: 2,
      estimatedCost: rupees(5_300),
      plannedCatering: rupees(500),
      differenceMinor: null,
      usesExpectedGuestCount: true,
      eventsWithoutCateringPlan: 1,
    });
    expect(selectCateringOverview(cateringWorkspace, 'missing')).toEqual({
      scopedEvents: 0,
      configuredEvents: 0,
      estimatedCost: null,
      plannedCatering: null,
      differenceMinor: null,
      usesExpectedGuestCount: false,
      eventsWithoutCateringPlan: 0,
    });
  });

  it('skips an unsafe saved catering config instead of fabricating a total', () => {
    const unsafeWorkspace = makeWorkspace({
      events: [wedding],
      guests: [makeGuest({ id: 'w-1', eventId: 'wedding', rsvp: 'confirmed' })],
      cateringEstimates: [
        makeCateringEstimate({
          eventId: 'wedding',
          perPersonCost: rupees(100),
          bufferPercent: 150,
        }),
      ],
    });

    expect(selectCateringOverview(unsafeWorkspace, 'wedding')).toEqual({
      scopedEvents: 1,
      configuredEvents: 0,
      estimatedCost: null,
      plannedCatering: null,
      differenceMinor: null,
      usesExpectedGuestCount: false,
      eventsWithoutCateringPlan: 0,
    });
  });
});

describe('task selectors', () => {
  it('sorts open tasks first by due date and title, then completed tasks', () => {
    expect(sortTasksForOverview(tasks).map((task) => task.id)).toEqual([
      'early-open-a',
      'early-open-b',
      'late-open',
      'completed-task',
    ]);
  });

  it('scopes and sorts tasks for one event', () => {
    expect(selectScopedTasks(workspace, 'wedding').map((task) => task.id)).toEqual([
      'early-open-b',
      'late-open',
      'completed-task',
    ]);
  });

  it('filters tasks by completion state', () => {
    expect(filterTasks(tasks, 'open').map((task) => task.id)).toEqual([
      'late-open',
      'early-open-b',
      'early-open-a',
    ]);
    expect(filterTasks(tasks, 'completed').map((task) => task.id)).toEqual(['completed-task']);
    expect(filterTasks(tasks, 'all')).toHaveLength(4);
  });

  it('calculates completion progress with rounded percentages', () => {
    expect(selectTaskProgress(tasks)).toEqual({
      total: 4,
      completed: 1,
      remaining: 3,
      percentage: 25,
    });
    expect(selectTaskProgress([])).toEqual({
      total: 0,
      completed: 0,
      remaining: 0,
      percentage: 0,
    });
    expect(selectTaskProgress(tasks.slice(0, 3)).percentage).toBe(0);
    expect(selectTaskProgress(tasks.filter((task) => task.id !== 'late-open')).percentage).toBe(33);
  });
});
