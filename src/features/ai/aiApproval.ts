import {
  normalizeActivityDraft,
  validateActivityDraft,
} from '@/features/timeline/activityRules';
import { normalizeTaskDraft, validateTaskDraft } from '@/features/tasks/taskRules';
import { createId } from '@/lib/id';
import type {
  PlanningTask,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import {
  aiPlanRequestSchema,
  aiPlanSchema,
  type AiPlan,
  type AiPlanRequest,
  type AiPlanSource,
} from './contracts';
import {
  buildAiEventContext,
  createAiContextSignature,
  createAiPlanId,
} from './aiContext';
import {
  selectionHasBlockingIssues,
  validateAiPlan,
} from './planValidation';

export interface AiPlanProposal {
  readonly planId: string;
  readonly eventId: string;
  readonly requestId: string;
  readonly generatedAt: string;
  readonly source: AiPlanSource;
  /** Signature of the exact event context the plan was generated against. */
  readonly contextSignature: string;
  readonly request: AiPlanRequest;
  readonly plan: AiPlan;
  readonly timelineIndexes: readonly number[];
  readonly taskIndexes: readonly number[];
}

export type AiApplyFailureCode =
  | 'stale'
  | 'duplicate'
  | 'invalid'
  | 'not-found'
  | 'empty'
  | 'persistence';

export type AiApplyResult =
  | {
      readonly ok: true;
      readonly message: string;
      readonly appliedTasks: number;
      readonly appliedActivities: number;
    }
  | {
      readonly ok: false;
      readonly code: AiApplyFailureCode;
      readonly message: string;
    };

export interface AiApprovalDependencies {
  readonly persist: (
    workspace: Workspace,
  ) => { readonly ok: true } | { readonly ok: false; readonly message: string };
  readonly isDuplicate: (planId: string) => boolean;
  /** Recalculates derived state (risk findings) before the atomic save. */
  readonly prepare?: (workspace: Workspace) => Workspace;
}

export interface AiApprovalOptions {
  readonly todayIso: string;
  readonly now?: Date;
}

export interface AiApprovalOutcome {
  readonly result: AiApplyResult;
  /** The prepared workspace to keep only when the result is successful. */
  readonly workspace: Workspace;
}

function failure(
  workspace: Workspace,
  code: AiApplyFailureCode,
  message: string,
): AiApprovalOutcome {
  return { result: { ok: false, code, message }, workspace };
}

function uniqueIndexes(indexes: readonly number[]): number[] | null {
  const seen = new Set<number>();

  for (const index of indexes) {
    if (!Number.isSafeInteger(index) || index < 0) {
      return null;
    }

    if (seen.has(index)) {
      return null;
    }

    seen.add(index);
  }

  return [...seen].sort((first, second) => first - second);
}

/**
 * Revalidates a generated plan against the current workspace, then adds only
 * the selected tasks and timeline activities. Budgets, guests, activities that
 * already exist, and the event itself are never modified. The next workspace is
 * persisted before it is returned; a failed save leaves state untouched.
 */
export function approveAiPlan(
  workspace: Workspace,
  proposal: AiPlanProposal,
  dependencies: AiApprovalDependencies,
  options: AiApprovalOptions,
): AiApprovalOutcome {
  if (dependencies.isDuplicate(proposal.planId)) {
    return failure(
      workspace,
      'duplicate',
      'This AI plan was already applied. Nothing was changed again.',
    );
  }

  const event = workspace.events.find((entry) => entry.id === proposal.eventId);

  if (!event || proposal.request.event?.id !== event.id) {
    return failure(
      workspace,
      'not-found',
      'The selected event no longer exists. Nothing was applied. Choose a saved event and generate the plan again.',
    );
  }

  const parsedPlan = aiPlanSchema.safeParse(proposal.plan);
  const parsedRequest = aiPlanRequestSchema.safeParse(proposal.request);

  if (!parsedPlan.success || !parsedRequest.success) {
    return failure(
      workspace,
      'invalid',
      'This AI plan no longer matches the supported proposal format. Nothing was applied.',
    );
  }

  const plan = parsedPlan.data;
  const currentContext = buildAiEventContext(
    event,
    workspace,
    workspace.riskFindings ?? [],
  );

  if (!currentContext.ok) {
    return failure(
      workspace,
      'invalid',
      `${currentContext.message} Nothing was applied.`,
    );
  }

  const currentSignature = createAiContextSignature(currentContext.context);

  if (currentSignature !== proposal.contextSignature) {
    return failure(
      workspace,
      'stale',
      'The event, budget, guests, tasks, activities, or open risks changed after this plan was generated. Nothing was applied. Generate a fresh plan to review the latest state.',
    );
  }

  if (
    createAiPlanId(event.id, currentSignature, plan) !== proposal.planId
  ) {
    return failure(
      workspace,
      'invalid',
      'The AI plan identity did not match its contents. Nothing was applied. Generate the plan again.',
    );
  }

  const timelineIndexes = uniqueIndexes(proposal.timelineIndexes);
  const taskIndexes = uniqueIndexes(proposal.taskIndexes);

  if (!timelineIndexes || !taskIndexes) {
    return failure(
      workspace,
      'invalid',
      'The selected additions were not valid. Nothing was applied.',
    );
  }

  if (timelineIndexes.length === 0 && taskIndexes.length === 0) {
    return failure(
      workspace,
      'empty',
      'Select at least one task or timeline activity to add. Nothing was applied.',
    );
  }

  if (
    timelineIndexes.some((index) => index >= plan.timeline.length) ||
    taskIndexes.some((index) => index >= plan.tasks.length)
  ) {
    return failure(
      workspace,
      'invalid',
      'The selected additions no longer exist in this plan. Nothing was applied.',
    );
  }

  const currentRequest: AiPlanRequest = {
    ...parsedRequest.data,
    event: currentContext.context,
  };
  const validation = validateAiPlan(
    plan,
    currentRequest,
    workspace,
    options.todayIso,
  );

  if (
    selectionHasBlockingIssues(validation, timelineIndexes, taskIndexes)
  ) {
    const blockingIssue = validation.issues.find(
      (issue) =>
        issue.severity === 'error' ||
        issue.code === 'timeline-duplicate' ||
        issue.code === 'task-duplicate',
    );

    return failure(
      workspace,
      'invalid',
      `${blockingIssue?.message ?? 'The selected additions did not pass validation.'} Nothing was applied.`,
    );
  }

  const now = (options.now ?? new Date()).toISOString();
  const existingTasks = workspace.tasks.filter(
    (task) => task.eventId === event.id,
  );
  const existingTaskTitles = new Set(
    existingTasks.map((task) => task.title.trim().toLowerCase()),
  );
  const existingActivityKeys = new Set(
    workspace.activities
      .filter((activity) => activity.eventId === event.id)
      .map(
        (activity) =>
          `${activity.title.trim().toLowerCase()}|${activity.startsAt}`,
      ),
  );
  const newTaskTitles = new Set<string>();
  const newActivityKeys = new Set<string>();
  const tasks: PlanningTask[] = [];
  const activities: TimelineActivity[] = [];

  for (const index of taskIndexes) {
    const suggestion = parsedPlan.data.tasks[index];

    if (!suggestion) {
      return failure(
        workspace,
        'invalid',
        'A selected task could not be found in the plan. Nothing was applied.',
      );
    }

    const normalized = normalizeTaskDraft({
      title: suggestion.title,
      description: suggestion.description ?? '',
      dueDate: suggestion.dueDate,
      priority: suggestion.priority,
      assignee: '',
    });
    const errors = validateTaskDraft(normalized);
    const key = normalized.title.toLowerCase();

    if (Object.values(errors).some(Boolean)) {
      return failure(
        workspace,
        'invalid',
        'A selected task did not pass the app’s task validation. Nothing was applied.',
      );
    }

    if (existingTaskTitles.has(key) || newTaskTitles.has(key)) {
      return failure(
        workspace,
        'invalid',
        `A selected task repeats “${normalized.title}”. Remove the duplicate selection before applying. Nothing was applied.`,
      );
    }

    newTaskTitles.add(key);
    tasks.push({
      id: createId('task'),
      eventId: event.id,
      title: normalized.title,
      dueDate: normalized.dueDate,
      priority: normalized.priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      ...(normalized.description
        ? { description: normalized.description }
        : {}),
    });
  }

  for (const index of timelineIndexes) {
    const suggestion = parsedPlan.data.timeline[index];

    if (!suggestion) {
      return failure(
        workspace,
        'invalid',
        'A selected timeline activity could not be found in the plan. Nothing was applied.',
      );
    }

    const normalized = normalizeActivityDraft({
      title: suggestion.title,
      description: suggestion.description ?? '',
      startsAt: suggestion.startsAt,
      endsAt: suggestion.endsAt,
      priority: suggestion.priority,
      status: 'scheduled',
      location: suggestion.location ?? '',
    });
    const errors = validateActivityDraft(normalized);
    const key = `${normalized.title.toLowerCase()}|${normalized.startsAt}`;

    if (Object.values(errors).some(Boolean)) {
      return failure(
        workspace,
        'invalid',
        'A selected timeline activity did not pass the app’s activity validation. Nothing was applied.',
      );
    }

    if (existingActivityKeys.has(key) || newActivityKeys.has(key)) {
      return failure(
        workspace,
        'invalid',
        `A selected activity repeats “${normalized.title}” at the same start time. Remove the duplicate selection before applying. Nothing was applied.`,
      );
    }

    newActivityKeys.add(key);
    activities.push({
      id: createId('activity'),
      eventId: event.id,
      title: normalized.title,
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      priority: normalized.priority,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
      ...(normalized.description
        ? { description: normalized.description }
        : {}),
      ...(normalized.location ? { location: normalized.location } : {}),
    });
  }

  const next: Workspace = {
    ...workspace,
    tasks: [...tasks, ...workspace.tasks],
    activities: [...activities, ...workspace.activities],
  };
  const prepared = dependencies.prepare ? dependencies.prepare(next) : next;
  const saved = dependencies.persist(prepared);

  if (!saved.ok) {
    return failure(workspace, 'persistence', saved.message);
  }

  const taskCopy =
    tasks.length === 1 ? '1 task' : `${tasks.length} tasks`;
  const activityCopy =
    activities.length === 1
      ? '1 timeline activity'
      : `${activities.length} timeline activities`;

  return {
    result: {
      ok: true,
      appliedTasks: tasks.length,
      appliedActivities: activities.length,
      message: `Added ${taskCopy} and ${activityCopy} to “${event.name}”. Budgets, guests, protected allocations, and the event itself were not changed.`,
    },
    workspace: prepared,
  };
}
