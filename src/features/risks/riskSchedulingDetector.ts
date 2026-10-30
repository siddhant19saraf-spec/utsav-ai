import { isTaskOverdue, sortTasksByDueDate } from '@/features/tasks/taskRules';
import { findActivityOverlaps } from '@/features/timeline/activityRules';
import { formatEventDate, formatTaskDate } from '@/lib/date';
import { formatCount } from '@/lib/format';
import type { CelebrationEvent, PlanningTask, TimelineActivity } from '@/types/domain';
import type { RiskSeverity } from '@/types/risk';
import type { RiskThresholds } from './riskConfig';
import type { RiskDetection } from './riskTypes';
import {
  daysBetween,
  detection,
  entity,
  evidence,
  formatLocalDateTime,
  relatedIds,
} from './riskDetectorSupport';

interface SchedulingContext {
  readonly event: CelebrationEvent;
  readonly tasks: readonly PlanningTask[];
  readonly activities: readonly TimelineActivity[];
  readonly todayIso: string;
  readonly daysUntilEvent: number | null;
  readonly withinNearWindow: boolean;
  readonly withinCriticalWindow: boolean;
  readonly thresholds: RiskThresholds;
}

export function analyzeScheduling(context: SchedulingContext): RiskDetection[] {
  const {
    event,
    tasks,
    activities,
    todayIso,
    daysUntilEvent,
    withinNearWindow,
    withinCriticalWindow,
  } = context;
  const detections: RiskDetection[] = [];

  if (daysUntilEvent === null || event.startsAt < todayIso) {
    return detections;
  }

  const openTasks = tasks.filter((task) => task.status === 'open');
  const sortedOpen = sortTasksByDueDate(openTasks);
  const overdueTasks = sortedOpen.filter((task) => isTaskOverdue(task, todayIso));
  const highOverdue = overdueTasks.filter((task) => task.priority === 'high');

  if (overdueTasks.length > 0) {
    const severity: RiskSeverity =
      withinCriticalWindow && highOverdue.length > 0
        ? 'critical'
        : highOverdue.length > 0 || withinCriticalWindow
          ? 'high'
          : 'medium';

    detections.push(
      detection(event, 'scheduling.task-overdue', {
        category: 'scheduling',
        severity,
        certainty: 'confirmed',
        title: `${formatCount(overdueTasks.length)} overdue ${
          overdueTasks.length === 1 ? 'task' : 'tasks'
        }`,
        explanation:
          'Open preparation tasks are past their due dates. Overdue approvals and vendor confirmations can delay later work.',
        evidence: [
          evidence('Overdue tasks', formatCount(overdueTasks.length)),
          evidence('High priority overdue', formatCount(highOverdue.length)),
          evidence(
            'Tasks',
            overdueTasks
              .slice(0, 3)
              .map((task) => `${task.title} (due ${formatTaskDate(task.dueDate)})`)
              .join('; '),
          ),
        ],
        recommendedAction:
          'Review these tasks in the Task Manager, complete them, or update a due date only if the underlying plan genuinely changed.',
        relatedEntities: [
          entity('event', event.id),
          ...relatedIds(
            'task',
            overdueTasks.map((task) => task.id),
          ),
        ],
        sourceModule: 'task-rules',
      }),
    );
  }

  const afterEventTasks = sortedOpen.filter(
    (task) => task.dueDate > event.startsAt,
  );

  if (afterEventTasks.length > 0) {
    const highPriority = afterEventTasks.some((task) => task.priority === 'high');
    const severity: RiskSeverity =
      withinNearWindow || highPriority ? 'high' : 'medium';

    detections.push(
      detection(event, 'scheduling.tasks-due-after-event', {
        category: 'scheduling',
        severity,
        certainty: 'confirmed',
        title: 'Open tasks are due after the event',
        explanation:
          'Some open preparation tasks have due dates after the event itself, so they cannot be completed in time for the celebration.',
        evidence: [
          evidence('Tasks after the event', formatCount(afterEventTasks.length)),
          evidence(
            'Tasks',
            afterEventTasks
              .slice(0, 3)
              .map((task) => `${task.title} (due ${formatTaskDate(task.dueDate)})`)
              .join('; '),
          ),
          evidence('Event date', formatEventDate(event.startsAt)),
        ],
        recommendedAction:
          'Move these tasks earlier in the Task Manager if they are genuinely preparation work, or remove them if they are post-event follow-ups.',
        relatedEntities: [
          entity('event', event.id),
          ...relatedIds(
            'task',
            afterEventTasks.map((task) => task.id),
          ),
        ],
        sourceModule: 'task-rules',
      }),
    );
  }

  if (withinNearWindow) {
    const importantOpen = sortedOpen.filter(
      (task) =>
        task.priority === 'high' &&
        task.dueDate >= todayIso &&
        task.dueDate <= event.startsAt,
    );

    if (importantOpen.length > 0) {
      detections.push(
        detection(event, 'scheduling.critical-tasks-open-near-event', {
          category: 'scheduling',
          severity: withinCriticalWindow ? 'critical' : 'high',
          certainty: 'confirmed',
          title: 'High-priority tasks are still open near the event',
          explanation:
            'Important preparation tasks remain open with due dates between today and the event date.',
          evidence: [
            evidence('Open high-priority tasks', formatCount(importantOpen.length)),
            evidence(
              'Tasks',
              importantOpen
                .slice(0, 3)
                .map((task) => `${task.title} (due ${formatTaskDate(task.dueDate)})`)
                .join('; '),
            ),
            evidence('Days until event', formatCount(daysUntilEvent)),
          ],
          recommendedAction:
            'Confirm owners and completion dates for these tasks in the Task Manager. Do not mark work complete until it is genuinely finished.',
          relatedEntities: [
            entity('event', event.id),
            ...relatedIds(
              'task',
              importantOpen.map((task) => task.id),
            ),
          ],
          sourceModule: 'task-rules',
        }),
      );
    }

    if (tasks.length === 0) {
      detections.push(
        detection(event, 'scheduling.no-tasks-near-event', {
          category: 'scheduling',
          severity: withinCriticalWindow ? 'high' : 'medium',
          certainty: 'confirmed',
          title: 'The event is approaching with no planning tasks',
          explanation:
            'No preparation tasks are recorded for an upcoming event. Important work may be untracked.',
          evidence: [
            evidence('Event date', formatEventDate(event.startsAt)),
            evidence('Days until event', formatCount(daysUntilEvent)),
            evidence('Recorded tasks', '0'),
          ],
          recommendedAction:
            'Create the essential preparation tasks in the Task Manager, including vendor confirmations and the final headcount.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'task-rules',
        }),
      );
    }
  }

  if (!withinNearWindow) {
    for (const task of sortedOpen) {
      if (task.priority !== 'high' || task.dueDate < todayIso) {
        continue;
      }

      const daysAvailable = daysBetween(todayIso, task.dueDate);

      if (daysAvailable === null || daysAvailable >= context.thresholds.minimumPreparationDays) {
        continue;
      }

      detections.push(
        detection(event, 'scheduling.preparation-window-tight', {
          category: 'scheduling',
          severity: 'high',
          certainty: 'confirmed',
          title: 'An important task has little preparation time',
          explanation:
            'A high-priority task is due within the minimum preparation window, leaving little time to complete the work and handle follow-ups.',
          evidence: [
            evidence('Task', task.title),
            evidence('Due date', formatTaskDate(task.dueDate)),
            evidence('Days available', formatCount(daysAvailable)),
            evidence(
              'Minimum preparation window',
              `${formatCount(context.thresholds.minimumPreparationDays)} days`,
            ),
          ],
          recommendedAction:
            'Start this task now or renegotiate its deadline with the owner if the plan allows. The date is not moved automatically.',
          relatedEntities: [entity('event', event.id), entity('task', task.id)],
          sourceModule: 'task-rules',
          entityKey: task.id,
        }),
      );
    }
  }

  const scheduled = activities.filter((activity) => activity.status === 'scheduled');
  const overlaps = findActivityOverlaps(scheduled).filter(
    (overlap) => overlap.secondEndsAt >= `${todayIso}T00:00`,
  );
  const priorityById = new Map(
    scheduled.map((activity) => [activity.id, activity.priority]),
  );

  for (const overlap of overlaps) {
    const bothHigh =
      priorityById.get(overlap.firstId) === 'high' &&
      priorityById.get(overlap.secondId) === 'high';

    detections.push(
      detection(event, 'scheduling.activity-overlap', {
        category: 'scheduling',
        severity: bothHigh ? 'high' : 'medium',
        certainty: 'confirmed',
        title: 'Two activities overlap',
        explanation:
          'Two scheduled activities occupy the same time. Overlaps can be intentional, so this is a review prompt rather than an automatic error.',
        evidence: [
          evidence(
            'First activity',
            `${overlap.firstTitle} · ${formatLocalDateTime(overlap.firstStartsAt)} to ${formatLocalDateTime(overlap.firstEndsAt)}`,
          ),
          evidence(
            'Second activity',
            `${overlap.secondTitle} · ${formatLocalDateTime(overlap.secondStartsAt)} to ${formatLocalDateTime(overlap.secondEndsAt)}`,
          ),
          evidence('Priorities', bothHigh ? 'Both high priority' : 'Not both high priority'),
        ],
        recommendedAction:
          'Review the timeline and decide whether the overlap is intentional. Nothing was moved, merged, or deleted.',
        relatedEntities: [
          entity('event', event.id),
          entity('activity', overlap.firstId),
          entity('activity', overlap.secondId),
        ],
        sourceModule: 'timeline-rules',
        entityKey: `${overlap.firstId}:${overlap.secondId}`,
      }),
    );
  }

  return detections;
}
