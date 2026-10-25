import { calculateBudgetUtilization } from '@/features/budget/calculations';
import { EMERGENCY_RESERVE_CATEGORY_ID } from '@/features/budget/budgetConstants';
import { calculateCateringEstimate } from '@/features/catering/cateringEstimator';
import { getGuestCounts, type GuestCounts } from '@/features/guests/guestRules';
import {
  countOverdueTasks,
  selectTaskProgress as calculateTaskProgress,
} from '@/features/tasks/taskRules';
import {
  selectUpcomingActivities as selectUpcomingTimelineActivities,
  sortActivitiesChronologically,
} from '@/features/timeline/activityRules';
import type { BudgetProtectionStatus } from '@/types/budget';
import type {
  CelebrationEvent,
  Money,
  PlanningTask,
  TimelineActivity,
  Workspace,
} from '@/types/domain';

export const ALL_EVENTS_SCOPE = 'all';

export type TaskFilter = 'all' | 'open' | 'completed';

export interface DashboardSummary {
  readonly totalEvents: number;
  readonly upcomingEvents: number;
  readonly plannedBudget: Money;
  readonly pendingTasks: number;
  readonly overdueTasks: number;
  readonly taskCompletionPercent: number;
}

export interface CateringOverview {
  readonly scopedEvents: number;
  readonly configuredEvents: number;
  readonly estimatedCost: Money | null;
  readonly plannedCatering: Money | null;
  readonly differenceMinor: number | null;
  readonly usesExpectedGuestCount: boolean;
  readonly eventsWithoutCateringPlan: number;
}

export interface BudgetAllocationSummary {
  readonly key: string;
  readonly label: string;
  readonly planned: Money;
  readonly actual: Money;
  readonly protection: BudgetProtectionStatus;
}

export interface BudgetSummary {
  readonly eventCount: number;
  readonly totalBudget: Money;
  readonly plannedExpenses: Money;
  readonly actualExpenses: Money;
  readonly remaining: Money;
  readonly overrun: Money;
  readonly usagePercent: number;
  readonly isOverBudget: boolean;
  readonly allocations: readonly BudgetAllocationSummary[];
  readonly protectedPlanned: Money;
  readonly flexiblePlanned: Money;
  readonly reservePlanned: Money;
  readonly reserveTarget: Money;
  readonly reserveConfigured: boolean;
}

function inr(amountMinor: number): Money {
  return { amountMinor, currency: 'INR' };
}

export type TaskProgress = ReturnType<typeof calculateTaskProgress>;

export function isUpcomingEvent(event: CelebrationEvent, todayIso: string): boolean {
  return event.status !== 'completed' && event.startsAt >= todayIso;
}

export function selectUpcomingEvents(
  workspace: Workspace,
  todayIso: string,
): CelebrationEvent[] {
  return workspace.events
    .filter((event) => isUpcomingEvent(event, todayIso))
    .sort((first, second) => first.startsAt.localeCompare(second.startsAt));
}

export function selectDashboardSummary(
  workspace: Workspace,
  todayIso: string,
): DashboardSummary {
  const plannedBudgetMinor = workspace.events.reduce(
    (total, event) => total + event.budget.totalAvailable.amountMinor,
    0,
  );

  return {
    totalEvents: workspace.events.length,
    upcomingEvents: workspace.events.filter((event) => isUpcomingEvent(event, todayIso)).length,
    plannedBudget: { amountMinor: plannedBudgetMinor, currency: 'INR' },
    pendingTasks: workspace.tasks.filter((task) => task.status === 'open').length,
    overdueTasks: countOverdueTasks(workspace.tasks, todayIso),
    taskCompletionPercent: calculateTaskProgress(workspace.tasks).percentage,
  };
}

export function selectScopedEvents(workspace: Workspace, scope: string): CelebrationEvent[] {
  return scope === ALL_EVENTS_SCOPE
    ? [...workspace.events]
    : workspace.events.filter((event) => event.id === scope);
}

interface CategoryAccumulator {
  readonly key: string;
  readonly label: string;
  plannedMinor: number;
  actualMinor: number;
  protectedCount: number;
  flexibleCount: number;
}

export function selectBudgetSummary(workspace: Workspace, scope: string): BudgetSummary {
  const events = selectScopedEvents(workspace, scope);
  const categories = new Map<string, CategoryAccumulator>();
  let totalBudgetMinor = 0;
  let plannedMinor = 0;
  let actualMinor = 0;
  let protectedMinor = 0;
  let flexibleMinor = 0;
  let reservePlannedMinor = 0;
  let reserveTargetMinor = 0;
  let reserveConfigured = false;

  for (const event of events) {
    totalBudgetMinor += event.budget.totalAvailable.amountMinor;
    reserveConfigured = reserveConfigured || event.budget.emergencyReserve.enabled;
    reserveTargetMinor += event.budget.emergencyReserve.target.amountMinor;

    for (const category of event.budget.categories) {
      plannedMinor += category.planned.amountMinor;
      actualMinor += category.actual.amountMinor;

      if (category.flexibility.mode === 'protected') {
        protectedMinor += category.planned.amountMinor;
      } else {
        flexibleMinor += category.planned.amountMinor;
      }

      if (category.id === EMERGENCY_RESERVE_CATEGORY_ID) {
        reservePlannedMinor += category.planned.amountMinor;
        continue;
      }

      const key = category.name.trim().toLowerCase();
      const current = categories.get(key) ?? {
        key,
        label: category.name.trim(),
        plannedMinor: 0,
        actualMinor: 0,
        protectedCount: 0,
        flexibleCount: 0,
      };

      current.plannedMinor += category.planned.amountMinor;
      current.actualMinor += category.actual.amountMinor;

      if (category.flexibility.mode === 'protected') {
        current.protectedCount += 1;
      } else {
        current.flexibleCount += 1;
      }

      categories.set(key, current);
    }
  }

  const allocations: BudgetAllocationSummary[] = [...categories.values()]
    .map((entry) => {
      const protection: BudgetProtectionStatus =
        entry.protectedCount > 0 && entry.flexibleCount > 0
          ? 'mixed'
          : entry.protectedCount > 0
            ? 'protected'
            : 'flexible';

      return {
        key: entry.key,
        label: entry.label,
        planned: inr(entry.plannedMinor),
        actual: inr(entry.actualMinor),
        protection,
      };
    })
    .sort((first, second) => {
      const amountOrder = second.planned.amountMinor - first.planned.amountMinor;
      return amountOrder !== 0 ? amountOrder : first.label.localeCompare(second.label);
    });

  const totalBudget = inr(totalBudgetMinor);
  const plannedExpenses = inr(plannedMinor);

  return {
    eventCount: events.length,
    totalBudget,
    plannedExpenses,
    actualExpenses: inr(actualMinor),
    remaining: inr(totalBudgetMinor - plannedMinor),
    overrun: inr(Math.max(0, plannedMinor - totalBudgetMinor)),
    usagePercent: calculateBudgetUtilization(totalBudget, plannedExpenses),
    isOverBudget: plannedMinor > totalBudgetMinor,
    allocations,
    protectedPlanned: inr(protectedMinor),
    flexiblePlanned: inr(flexibleMinor),
    reservePlanned: inr(reservePlannedMinor),
    reserveTarget: inr(reserveTargetMinor),
    reserveConfigured,
  };
}

export function sortTasksForOverview(tasks: readonly PlanningTask[]): PlanningTask[] {
  return [...tasks].sort((first, second) => {
    if (first.status !== second.status) {
      return first.status === 'completed' ? 1 : -1;
    }

    const dueDateOrder = first.dueDate.localeCompare(second.dueDate);
    return dueDateOrder !== 0 ? dueDateOrder : first.title.localeCompare(second.title);
  });
}

export function selectScopedTasks(workspace: Workspace, scope: string): PlanningTask[] {
  const scopedTasks =
    scope === ALL_EVENTS_SCOPE
      ? workspace.tasks
      : workspace.tasks.filter((task) => task.eventId === scope);

  return sortTasksForOverview(scopedTasks);
}

export function filterTasks(tasks: readonly PlanningTask[], filter: TaskFilter): PlanningTask[] {
  if (filter === 'open') {
    return tasks.filter((task) => task.status === 'open');
  }

  if (filter === 'completed') {
    return tasks.filter((task) => task.status === 'completed');
  }

  return [...tasks];
}

export function selectTaskProgress(tasks: readonly PlanningTask[]): TaskProgress {
  return calculateTaskProgress(tasks);
}

export function selectScopedActivities(
  workspace: Workspace,
  scope: string,
): TimelineActivity[] {
  const eventIds =
    scope === ALL_EVENTS_SCOPE
      ? new Set(workspace.events.map((event) => event.id))
      : new Set([scope]);

  return sortActivitiesChronologically(
    workspace.activities.filter((activity) => eventIds.has(activity.eventId)),
  );
}

export function selectUpcomingActivitiesForScope(
  workspace: Workspace,
  scope: string,
  nowLocal: string,
  limit?: number,
): TimelineActivity[] {
  return selectUpcomingTimelineActivities(
    selectScopedActivities(workspace, scope),
    nowLocal,
    limit,
  );
}

export function selectGuestSummary(workspace: Workspace, scope: string): GuestCounts {
  const eventIds = new Set(selectScopedEvents(workspace, scope).map((event) => event.id));

  return getGuestCounts(
    workspace.guests.filter((guest) => eventIds.has(guest.eventId)),
  );
}

function addSafe(left: number, right: number): number | null {
  const sum = left + right;
  return Number.isSafeInteger(sum) ? sum : null;
}

export function selectCateringOverview(
  workspace: Workspace,
  scope: string,
): CateringOverview {
  const events = selectScopedEvents(workspace, scope);
  let configuredEvents = 0;
  let estimatedMinor = 0;
  let plannedMinor = 0;
  let eventsWithPlan = 0;
  let usesExpectedGuestCount = false;

  for (const event of events) {
    const config = workspace.cateringEstimates.find(
      (estimate) => estimate.eventId === event.id,
    );

    if (!config) {
      continue;
    }

    try {
      const estimate = calculateCateringEstimate(
        event,
        workspace.guests,
        config.perPersonCost,
        config.bufferPercent,
      );
      const nextEstimated = addSafe(estimatedMinor, estimate.estimatedCost.amountMinor);
      const nextPlanned = estimate.cateringCategory
        ? addSafe(plannedMinor, estimate.cateringCategory.planned.amountMinor)
        : plannedMinor;

      if (nextEstimated === null || nextPlanned === null) {
        continue;
      }

      configuredEvents += 1;
      estimatedMinor = nextEstimated;
      plannedMinor = nextPlanned;
      usesExpectedGuestCount =
        usesExpectedGuestCount || estimate.attendeeSource === 'expected';

      if (estimate.cateringCategory) {
        eventsWithPlan += 1;
      }
    } catch {
      // A persisted config is validated at load. Skip any estimate that cannot
      // be represented safely rather than showing a fabricated dashboard total.
    }
  }

  return {
    scopedEvents: events.length,
    configuredEvents,
    estimatedCost:
      configuredEvents > 0 ? { amountMinor: estimatedMinor, currency: 'INR' } : null,
    plannedCatering:
      eventsWithPlan > 0 ? { amountMinor: plannedMinor, currency: 'INR' } : null,
    differenceMinor:
      configuredEvents > 0 && eventsWithPlan === configuredEvents
        ? estimatedMinor - plannedMinor
        : null,
    usesExpectedGuestCount,
    eventsWithoutCateringPlan: configuredEvents - eventsWithPlan,
  };
}
