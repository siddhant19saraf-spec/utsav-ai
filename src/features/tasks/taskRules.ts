import { addDays, isValidIsoDate } from '@/lib/date';
import type {
  CelebrationEvent,
  PlanningTask,
  TaskPriority,
  TaskStatus,
} from '@/types/domain';

export interface TaskDraft {
  readonly title: string;
  readonly description: string;
  readonly dueDate: string;
  readonly priority: TaskPriority;
  readonly assignee: string;
}

export type TaskFormField =
  | 'title'
  | 'description'
  | 'dueDate'
  | 'assignee';

export type TaskFormErrors = Partial<Record<TaskFormField, string>>;

export type TaskStatusFilter = 'all' | TaskStatus;

export type TaskPriorityFilter = 'all' | TaskPriority;

export interface TaskProgress {
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  readonly percentage: number;
}

export interface PreparationTaskSuggestion {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly dueDate: string;
  readonly priority: TaskPriority;
}

const MAX_TITLE = 160;
const MAX_DESCRIPTION = 1_000;
const MAX_ASSIGNEE = 80;

export function normalizeTaskDraft(draft: TaskDraft): TaskDraft {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    dueDate: draft.dueDate,
    priority: draft.priority,
    assignee: draft.assignee.trim(),
  };
}

export function validateTaskDraft(draft: TaskDraft): TaskFormErrors {
  const errors: TaskFormErrors = {};
  const normalized = normalizeTaskDraft(draft);

  if (!normalized.title) {
    errors.title = 'Enter a task title.';
  } else if (normalized.title.length > MAX_TITLE) {
    errors.title = `Keep the title to ${MAX_TITLE} characters or fewer.`;
  }

  if (normalized.description.length > MAX_DESCRIPTION) {
    errors.description = `Keep the description to ${MAX_DESCRIPTION} characters or fewer.`;
  }

  if (!normalized.dueDate) {
    errors.dueDate = 'Choose a due date.';
  } else if (!isValidIsoDate(normalized.dueDate)) {
    errors.dueDate = 'Enter a valid due date in YYYY-MM-DD form.';
  }

  if (normalized.assignee.length > MAX_ASSIGNEE) {
    errors.assignee = `Keep the assignee to ${MAX_ASSIGNEE} characters or fewer.`;
  }

  return errors;
}

export function isTaskOverdue(task: PlanningTask, todayIso: string): boolean {
  return task.status === 'open' && task.dueDate < todayIso;
}

export function sortTasksByDueDate(tasks: readonly PlanningTask[]): PlanningTask[] {
  return [...tasks].sort(
    (first, second) =>
      first.dueDate.localeCompare(second.dueDate) ||
      first.title.localeCompare(second.title) ||
      first.id.localeCompare(second.id),
  );
}

export function filterTasksByStatus(
  tasks: readonly PlanningTask[],
  filter: TaskStatusFilter,
): PlanningTask[] {
  if (filter === 'all') {
    return [...tasks];
  }

  return tasks.filter((task) => task.status === filter);
}

export function filterTasksByPriority(
  tasks: readonly PlanningTask[],
  filter: TaskPriorityFilter,
): PlanningTask[] {
  if (filter === 'all') {
    return [...tasks];
  }

  return tasks.filter((task) => task.priority === filter);
}

export function countOverdueTasks(
  tasks: readonly PlanningTask[],
  todayIso: string,
): number {
  return tasks.filter((task) => isTaskOverdue(task, todayIso)).length;
}

export function selectTaskProgress(tasks: readonly PlanningTask[]): TaskProgress {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === 'completed').length;

  return {
    total,
    completed,
    remaining: total - completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Starter tasks are suggestions derived from the saved event date. They are
 * not persisted or marked complete until a user chooses to add them.
 */
export function suggestPreparationTasks(
  event: CelebrationEvent,
  todayIso: string,
): PreparationTaskSuggestion[] {
  if (event.startsAt < todayIso) {
    return [];
  }

  const candidates: PreparationTaskSuggestion[] = [
    {
      key: 'confirm-contracts',
      title: 'Confirm venue and vendor contracts',
      description: 'Check the signed terms, delivery windows, and point of contact.',
      dueDate: addDays(event.startsAt, -14),
      priority: 'high',
    },
    {
      key: 'confirm-headcount',
      title: 'Confirm the final guest headcount',
      description: 'Reconcile confirmed RSVPs before sharing numbers with caterers.',
      dueDate: addDays(event.startsAt, -7),
      priority: 'high',
    },
    {
      key: 'share-run-sheet',
      title: 'Share the day-of run sheet',
      description: 'Give the venue, vendors, and family a single schedule to follow.',
      dueDate: addDays(event.startsAt, -3),
      priority: 'medium',
    },
  ];

  return candidates.filter((candidate) => candidate.dueDate >= todayIso);
}

export function suggestedDueDate(event: CelebrationEvent, todayIso: string): string {
  const aWeekBefore = addDays(event.startsAt, -7);

  if (aWeekBefore < todayIso) {
    return event.startsAt < todayIso ? todayIso : event.startsAt;
  }

  return aWeekBefore;
}

export function defaultTaskDraft(
  event: CelebrationEvent,
  todayIso: string,
): TaskDraft {
  return {
    title: '',
    description: '',
    dueDate: suggestedDueDate(event, todayIso),
    priority: 'medium',
    assignee: '',
  };
}
