import type { BudgetCategory, EmergencyReserveConfig } from '@/types/budget';
import type {
  ActivityStatus,
  CateringEstimateConfig,
  CelebrationEvent,
  Guest,
  Money,
  PlanningTask,
  TaskStatus,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import { createEventSnapshotSignature } from '@/lib/eventSnapshot';
import {
  withEmergencyReserve,
  withRemovedCategory,
  withReplacedCategories,
  withUpdatedBudgetTotal,
  withUpsertedCategory,
} from '@/features/budget/mutations';

export type WorkspaceAction =
  | { readonly type: 'event/created'; readonly event: Workspace['events'][number] }
  | { readonly type: 'event/updated'; readonly event: Workspace['events'][number] }
  | { readonly type: 'task/toggled'; readonly taskId: string; readonly status: TaskStatus; readonly updatedAt: string }
  | { readonly type: 'task/created'; readonly task: PlanningTask }
  | { readonly type: 'task/updated'; readonly task: PlanningTask }
  | { readonly type: 'task/deleted'; readonly eventId: string; readonly taskId: string }
  | { readonly type: 'activity/created'; readonly activity: TimelineActivity }
  | { readonly type: 'activity/updated'; readonly activity: TimelineActivity }
  | { readonly type: 'activity/deleted'; readonly eventId: string; readonly activityId: string }
  | {
      readonly type: 'activity/toggled';
      readonly activityId: string;
      readonly status: ActivityStatus;
      readonly updatedAt: string;
    }
  | { readonly type: 'guest/created'; readonly guest: Guest }
  | { readonly type: 'guest/updated'; readonly guest: Guest }
  | { readonly type: 'guest/deleted'; readonly eventId: string; readonly guestId: string }
  | { readonly type: 'catering/estimate-saved'; readonly estimate: CateringEstimateConfig }
  | { readonly type: 'demo/loaded'; readonly seed: Workspace }
  | { readonly type: 'demo/removed' }
  | {
      readonly type: 'budget/total-updated';
      readonly eventId: string;
      readonly totalAvailable: Money;
      readonly updatedAt: string;
    }
  | {
      readonly type: 'budget/category-upserted';
      readonly eventId: string;
      readonly category: BudgetCategory;
      readonly updatedAt: string;
    }
  | {
      readonly type: 'budget/category-removed';
      readonly eventId: string;
      readonly categoryId: string;
      readonly updatedAt: string;
    }
  | {
      readonly type: 'budget/categories-replaced';
      readonly eventId: string;
      readonly categories: readonly BudgetCategory[];
      readonly updatedAt: string;
    }
  | {
      readonly type: 'budget/reserve-updated';
      readonly eventId: string;
      readonly reserve: EmergencyReserveConfig;
      readonly updatedAt: string;
    }
  | {
      readonly type: 'rescue/applied';
      readonly eventId: string;
      readonly expectedSignature: string;
      readonly event: CelebrationEvent;
    }
  | { readonly type: 'workspace/replaced'; readonly workspace: Workspace };

function updateEventBudget(
  workspace: Workspace,
  eventId: string,
  update: (budget: Workspace['events'][number]['budget']) => Workspace['events'][number]['budget'],
): Workspace {
  let found = false;
  const events = workspace.events.map((event) => {
    if (event.id !== eventId) {
      return event;
    }

    found = true;
    const budget = update(event.budget);

    return budget === event.budget ? event : { ...event, budget };
  });

  return found ? { ...workspace, events } : workspace;
}

export function workspaceReducer(workspace: Workspace, action: WorkspaceAction): Workspace {
  switch (action.type) {
    case 'event/created':
      return {
        ...workspace,
        events: [action.event, ...workspace.events],
      };

    case 'event/updated': {
      if (action.event.budget.eventId !== action.event.id) {
        return workspace;
      }

      let found = false;
      const events = workspace.events.map((event) => {
        if (event.id !== action.event.id) {
          return event;
        }

        found = true;
        return action.event;
      });

      return found ? { ...workspace, events } : workspace;
    }

    case 'task/toggled': {
      let found = false;
      let changed = false;
      const tasks = workspace.tasks.map((task) => {
        if (task.id !== action.taskId) {
          return task;
        }

        found = true;

        if (task.status === action.status) {
          return task;
        }

        changed = true;
        return { ...task, status: action.status, updatedAt: action.updatedAt };
      });

      return found && changed ? { ...workspace, tasks } : workspace;
    }

    case 'task/created':
      if (!workspace.events.some((event) => event.id === action.task.eventId)) {
        return workspace;
      }

      return { ...workspace, tasks: [action.task, ...workspace.tasks] };

    case 'task/updated': {
      let found = false;
      const tasks = workspace.tasks.map((task) => {
        if (task.id !== action.task.id) {
          return task;
        }

        if (task.eventId !== action.task.eventId) {
          return task;
        }

        found = true;
        return action.task;
      });

      return found ? { ...workspace, tasks } : workspace;
    }

    case 'task/deleted': {
      const target = workspace.tasks.find((task) => task.id === action.taskId);

      if (!target || target.eventId !== action.eventId) {
        return workspace;
      }

      return {
        ...workspace,
        tasks: workspace.tasks.filter((task) => task.id !== action.taskId),
      };
    }

    case 'activity/created':
      if (!workspace.events.some((event) => event.id === action.activity.eventId)) {
        return workspace;
      }

      return {
        ...workspace,
        activities: [action.activity, ...workspace.activities],
      };

    case 'activity/updated': {
      let found = false;
      const activities = workspace.activities.map((activity) => {
        if (activity.id !== action.activity.id) {
          return activity;
        }

        if (activity.eventId !== action.activity.eventId) {
          return activity;
        }

        found = true;
        return action.activity;
      });

      return found ? { ...workspace, activities } : workspace;
    }

    case 'activity/deleted': {
      const target = workspace.activities.find(
        (activity) => activity.id === action.activityId,
      );

      if (!target || target.eventId !== action.eventId) {
        return workspace;
      }

      return {
        ...workspace,
        activities: workspace.activities.filter(
          (activity) => activity.id !== action.activityId,
        ),
      };
    }

    case 'activity/toggled': {
      let found = false;
      let changed = false;
      const activities = workspace.activities.map((activity) => {
        if (activity.id !== action.activityId) {
          return activity;
        }

        found = true;

        if (activity.status === action.status) {
          return activity;
        }

        changed = true;
        return { ...activity, status: action.status, updatedAt: action.updatedAt };
      });

      return found && changed ? { ...workspace, activities } : workspace;
    }

    case 'guest/created':
      if (!workspace.events.some((event) => event.id === action.guest.eventId)) {
        return workspace;
      }

      return { ...workspace, guests: [action.guest, ...workspace.guests] };

    case 'guest/updated': {
      let found = false;
      const guests = workspace.guests.map((guest) => {
        if (guest.id !== action.guest.id) {
          return guest;
        }

        if (guest.eventId !== action.guest.eventId) {
          return guest;
        }

        found = true;
        return action.guest;
      });

      return found ? { ...workspace, guests } : workspace;
    }

    case 'guest/deleted': {
      const target = workspace.guests.find((guest) => guest.id === action.guestId);

      if (!target || target.eventId !== action.eventId) {
        return workspace;
      }

      return {
        ...workspace,
        guests: workspace.guests.filter((guest) => guest.id !== action.guestId),
      };
    }

    case 'catering/estimate-saved': {
      if (
        !workspace.events.some((event) => event.id === action.estimate.eventId)
      ) {
        return workspace;
      }

      const exists = workspace.cateringEstimates.some(
        (estimate) => estimate.eventId === action.estimate.eventId,
      );

      return {
        ...workspace,
        cateringEstimates: exists
          ? workspace.cateringEstimates.map((estimate) =>
              estimate.eventId === action.estimate.eventId
                ? action.estimate
                : estimate,
            )
          : [...workspace.cateringEstimates, action.estimate],
      };
    }

    case 'budget/total-updated':
      return updateEventBudget(workspace, action.eventId, (budget) =>
        withUpdatedBudgetTotal(budget, action.totalAvailable, action.updatedAt),
      );

    case 'budget/category-upserted':
      return updateEventBudget(workspace, action.eventId, (budget) =>
        withUpsertedCategory(budget, action.category, action.updatedAt),
      );

    case 'budget/category-removed':
      return updateEventBudget(workspace, action.eventId, (budget) =>
        withRemovedCategory(budget, action.categoryId, action.updatedAt),
      );

    case 'budget/categories-replaced':
      return updateEventBudget(workspace, action.eventId, (budget) =>
        withReplacedCategories(budget, action.categories, action.updatedAt),
      );

    case 'budget/reserve-updated':
      return updateEventBudget(workspace, action.eventId, (budget) =>
        withEmergencyReserve(budget, action.reserve, action.updatedAt),
      );

    case 'rescue/applied': {
      if (action.event.id !== action.eventId) {
        return workspace;
      }

      if (action.event.budget.eventId !== action.eventId) {
        return workspace;
      }

      let matched = false;
      let stale = false;
      const events = workspace.events.map((event) => {
        if (event.id !== action.eventId) {
          return event;
        }

        if (matched || createEventSnapshotSignature(event) !== action.expectedSignature) {
          stale = true;
          return event;
        }

        matched = true;
        return action.event;
      });

      if (!matched || stale) {
        return workspace;
      }

      return {
        ...workspace,
        events,
        rescueProposalSnapshots: (workspace.rescueProposalSnapshots ?? []).filter(
          (snapshot) => snapshot.eventId !== action.eventId,
        ),
      };
    }

    case 'workspace/replaced':
      return action.workspace;

    case 'demo/loaded': {
      if (workspace.events.some((event) => event.origin === 'sample')) {
        return workspace;
      }

      return {
        events: [...workspace.events, ...action.seed.events],
        tasks: [...workspace.tasks, ...action.seed.tasks],
        guests: [...workspace.guests, ...action.seed.guests],
        activities: [...workspace.activities, ...action.seed.activities],
        cateringEstimates: [
          ...workspace.cateringEstimates,
          ...action.seed.cateringEstimates,
        ],
        ...(workspace.riskFindings
          ? { riskFindings: workspace.riskFindings }
          : {}),
        ...(workspace.rescueProposalSnapshots
          ? { rescueProposalSnapshots: workspace.rescueProposalSnapshots }
          : {}),
      };
    }

    case 'demo/removed': {
      const events = workspace.events.filter((event) => event.origin !== 'sample');
      const retainedEventIds = new Set(events.map((event) => event.id));

      return {
        events,
        tasks: workspace.tasks.filter((task) => retainedEventIds.has(task.eventId)),
        guests: workspace.guests.filter((guest) => retainedEventIds.has(guest.eventId)),
        activities: workspace.activities.filter((activity) =>
          retainedEventIds.has(activity.eventId),
        ),
        cateringEstimates: workspace.cateringEstimates.filter((estimate) =>
          retainedEventIds.has(estimate.eventId),
        ),
        ...(workspace.riskFindings
          ? {
              riskFindings: workspace.riskFindings.filter((finding) =>
                retainedEventIds.has(finding.eventId),
              ),
            }
          : {}),
        ...(workspace.rescueProposalSnapshots
          ? {
              rescueProposalSnapshots: workspace.rescueProposalSnapshots.filter(
                (snapshot) => retainedEventIds.has(snapshot.eventId),
              ),
            }
          : {}),
      };
    }
  }
}
