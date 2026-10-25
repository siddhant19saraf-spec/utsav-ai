import { calculateBudgetTotals, type BudgetTotals } from '@/features/budget/calculations';
import { validateBudget } from '@/features/budget/validation';
import {
  calculateCateringEstimate,
  type CateringEstimate,
} from '@/features/catering/cateringEstimator';
import { getGuestCounts, type GuestCounts } from '@/features/guests/guestRules';
import { isTaskOverdue, sortTasksByDueDate } from '@/features/tasks/taskRules';
import { findActivityOverlaps } from '@/features/timeline/activityRules';
import { formatEventDate, formatTaskDate, isValidIsoDate } from '@/lib/date';
import { createEventSnapshotSignature } from '@/lib/eventSnapshot';
import { formatMoney, isValidMoney } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import type {
  CateringEstimateConfig,
  CelebrationEvent,
  EventSetting,
  Guest,
  PlanningTask,
  TimelineActivity,
} from '@/types/domain';
import type {
  RiskCertainty,
  RiskEntityRef,
  RiskEvidence,
  RiskProposalSnapshot,
  RiskSeverity,
} from '@/types/risk';
import { resolveRiskThresholds, type RiskThresholds } from './riskConfig';
import { createProposalDataSignature } from './riskSignatures';
import type {
  RiskAnalysisError,
  RiskAnalysisInput,
  RiskAnalysisResult,
  RiskDetection,
} from './riskTypes';

const MS_PER_DAY = 86_400_000;

const settingLabels: Record<EventSetting, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  mixed: 'Mixed indoor and outdoor',
};

function inr(amountMinor: number) {
  return { amountMinor, currency: 'INR' as const };
}

function formatInr(amountMinor: number): string {
  return formatMoney(inr(amountMinor));
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function percent(part: number, whole: number): number {
  if (whole <= 0) {
    return part > 0 ? 100 : 0;
  }

  return Math.round((part / whole) * 100);
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }

  return Math.round((to - from) / MS_PER_DAY);
}

function formatLocalDateTime(value: string): string {
  return value.replace('T', ' · ');
}

function evidence(label: string, value: string): RiskEvidence {
  return { label, value };
}

function entity(type: RiskEntityRef['type'], id: string): RiskEntityRef {
  return { type, id };
}

function detection(
  event: CelebrationEvent,
  ruleId: string,
  fields: Omit<
    RiskDetection,
    'id' | 'eventId' | 'ruleId'
  > & { readonly entityKey?: string },
): RiskDetection {
  const { entityKey, ...rest } = fields;

  return {
    id: `risk:${event.id}:${ruleId}${entityKey ? `:${entityKey}` : ''}`,
    eventId: event.id,
    ruleId,
    ...rest,
  };
}

function analysisError(
  event: CelebrationEvent,
  ruleId: string,
  message: string,
): RiskAnalysisError {
  return { eventId: event.id, ruleId, message };
}

function relatedIds(
  type: RiskEntityRef['type'],
  ids: readonly string[],
  limit = 6,
): RiskEntityRef[] {
  return ids.slice(0, limit).map((id) => entity(type, id));
}

/**
 * Maximum amount that flexible categories could give up without crossing their
 * saved minimums. Returns null when the saved values cannot be treated safely.
 */
function flexibleReductionCapacity(
  categories: readonly BudgetCategory[],
): number | null {
  let capacity = 0;

  for (const category of categories) {
    if (category.flexibility.mode !== 'flexible') {
      continue;
    }

    if (
      !isValidMoney(category.planned) ||
      category.planned.currency !== 'INR' ||
      !isValidMoney(category.flexibility.minimumPlanned) ||
      category.flexibility.minimumPlanned.currency !== 'INR'
    ) {
      return null;
    }

    const gap =
      category.planned.amountMinor - category.flexibility.minimumPlanned.amountMinor;

    if (gap < 0) {
      return null;
    }

    capacity += gap;

    if (!Number.isSafeInteger(capacity)) {
      return null;
    }
  }

  return capacity;
}

interface BudgetAnalysis {
  readonly detections: readonly RiskDetection[];
  readonly errors: readonly RiskAnalysisError[];
  readonly totals: BudgetTotals | null;
}

function analyzeBudget(
  event: CelebrationEvent,
  thresholds: RiskThresholds,
): BudgetAnalysis {
  const detections: RiskDetection[] = [];
  const errors: RiskAnalysisError[] = [];
  const validation = validateBudget(event.budget);
  let totals: BudgetTotals | null = null;

  try {
    totals = calculateBudgetTotals(event.budget);
  } catch {
    errors.push(
      analysisError(
        event,
        'financial.budget-invalid',
        'The saved budget could not be totalled safely; financial checks were limited.',
      ),
    );
  }

  if (validation.errors.length > 0 || totals === null) {
    const issues = validation.errors.slice(0, 3).map((issue) => issue.message);

    detections.push(
      detection(event, 'financial.budget-invalid', {
        category: 'financial',
        severity: 'critical',
        certainty: 'confirmed',
        title: 'Saved budget data is invalid',
        explanation:
          'Some saved budget values cannot be used for reliable totals. Financial risks may be understated until these values are corrected.',
        evidence: [
          evidence(
            'Validation errors',
            `${formatCount(validation.errors.length)} found`,
          ),
          ...issues.map((message) => evidence('Issue', message)),
        ],
        recommendedAction:
          'Open the Budget Planner, correct the highlighted category amounts or reserve configuration, and review the recalculated totals. Nothing was changed automatically.',
        relatedEntities: [entity('event', event.id), entity('budget', event.budget.id)],
        sourceModule: 'budget-engine',
      }),
    );
  }

  if (!totals) {
    return { detections, errors, totals };
  }

  const totalMinor = totals.totalBudget.amountMinor;

  if (totals.isOverBudget) {
    const overrunPercent = percent(totals.overrun.amountMinor, totalMinor);
    const protectedExceedsTotal = totals.protectedPlanned.amountMinor > totalMinor;
    const severity: RiskSeverity =
      overrunPercent >= thresholds.criticalOverrunPercent || protectedExceedsTotal
        ? 'critical'
        : 'high';

    detections.push(
      detection(event, 'financial.planned-overrun', {
        category: 'financial',
        severity,
        certainty: 'confirmed',
        title: 'Planned spending exceeds the total budget',
        explanation:
          'Planned category allocations add up to more than the saved total budget. Every allocation must fit the ceiling before commitments are made.',
        evidence: [
          evidence('Total budget', formatInr(totalMinor)),
          evidence('Planned spending', formatInr(totals.planned.amountMinor)),
          evidence('Overrun', formatInr(totals.overrun.amountMinor)),
          evidence('Overrun share', `${overrunPercent}%`),
          evidence('Protected allocations', formatInr(totals.protectedPlanned.amountMinor)),
        ],
        recommendedAction:
          'Reduce planned amounts for flexible categories in the Budget Planner or explicitly raise the total budget. Event Rescue can propose deterministic reductions, but it never applies them without your approval.',
        relatedEntities: [entity('event', event.id), entity('budget', event.budget.id)],
        sourceModule: 'budget-engine',
      }),
    );

    const capacity = flexibleReductionCapacity(event.budget.categories);

    if (capacity !== null && capacity < totals.overrun.amountMinor) {
      const gap = totals.overrun.amountMinor - capacity;

      detections.push(
        detection(event, 'financial.protected-reduction-required', {
          category: 'financial',
          severity: 'high',
          certainty: 'confirmed',
          title: 'Protected categories would need to be reduced',
          explanation:
            'Even after using every flexible reduction down to its saved minimum, the plan would still exceed the total budget. Closing the gap would require cutting protected categories or minimums, which automatic repair must not do.',
          evidence: [
            evidence('Overrun', formatInr(totals.overrun.amountMinor)),
            evidence('Maximum flexible reduction', formatInr(capacity)),
            evidence('Remaining gap', formatInr(gap)),
            evidence('Protected allocations', formatInr(totals.protectedPlanned.amountMinor)),
          ],
          recommendedAction:
            'Decide explicitly whether to add budget or change a category’s protection in the Budget Planner. Event Rescue will not reduce protected categories or flexible minimums on its own.',
          relatedEntities: [
            entity('event', event.id),
            entity('budget', event.budget.id),
          ],
          sourceModule: 'budget-engine',
        }),
      );
    }
  }

  if (totals.overspending.actualExceedsBudget) {
    detections.push(
      detection(event, 'financial.actual-overrun', {
        category: 'financial',
        severity: 'high',
        certainty: 'confirmed',
        title: 'Recorded actual spend exceeds the total budget',
        explanation:
          'Actual amounts already recorded across categories are above the saved total budget. This is spending that has happened, not a projection.',
        evidence: [
          evidence('Total budget', formatInr(totalMinor)),
          evidence('Actual spend', formatInr(totals.actual.amountMinor)),
          evidence(
            'Excess',
            formatInr(totals.actual.amountMinor - totalMinor),
          ),
        ],
        recommendedAction:
          'Review the recorded actual amounts in the Budget Planner and reconcile invoices. Increase the budget only if that is a genuine decision; do not adjust actual spend to hide the overrun.',
        relatedEntities: [entity('event', event.id), entity('budget', event.budget.id)],
        sourceModule: 'budget-engine',
      }),
    );
  }

  const reserve = totals.reserve;

  if (reserve.configured && reserve.shortfall.amountMinor > 0) {
    const shortfallPercent = percent(
      reserve.shortfall.amountMinor,
      reserve.target.amountMinor,
    );
    const severity: RiskSeverity =
      reserve.allocated.amountMinor === 0 ||
      shortfallPercent >= thresholds.reserveShortfallHighPercent
        ? 'high'
        : 'medium';

    detections.push(
      detection(event, 'financial.reserve-shortfall', {
        category: 'financial',
        severity,
        certainty: 'confirmed',
        title: 'Emergency reserve is below its target',
        explanation:
          'The reserve is enabled, but its protected allocation is below the configured target. The reserve is part of the budget, not extra money.',
        evidence: [
          evidence('Reserve target', formatInr(reserve.target.amountMinor)),
          evidence('Reserve allocated', formatInr(reserve.allocated.amountMinor)),
          evidence('Shortfall', formatInr(reserve.shortfall.amountMinor)),
          evidence('Share below target', `${shortfallPercent}%`),
        ],
        recommendedAction:
          'Fund the reserve from flexible categories in the Budget Planner, or lower the target in an explicit decision. The reserve must remain protected.',
        relatedEntities: [
          entity('event', event.id),
          entity('budget', event.budget.id),
          entity('budget-category', 'emergency-reserve'),
        ],
        sourceModule: 'budget-engine',
      }),
    );
  }

  return { detections, errors, totals };
}

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

function analyzeScheduling(context: SchedulingContext): RiskDetection[] {
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

interface GuestContext {
  readonly event: CelebrationEvent;
  readonly guests: readonly Guest[];
  readonly counts: GuestCounts;
  readonly estimate: CateringEstimate | null;
  readonly estimateConfigured: boolean;
  readonly estimateInvalid: boolean;
  readonly withinNearWindow: boolean;
  readonly thresholds: RiskThresholds;
}

function analyzeGuests(context: GuestContext): RiskDetection[] {
  const {
    event,
    guests,
    counts,
    estimate,
    estimateConfigured,
    estimateInvalid,
    withinNearWindow,
    thresholds,
  } = context;
  const detections: RiskDetection[] = [];
  const expectedGuests = event.expectedGuests;
  const canCompareGuests =
    Number.isSafeInteger(expectedGuests) && expectedGuests > 0;

  if (!canCompareGuests) {
    return detections;
  }

  if (counts.invited === 0) {
    if (expectedGuests >= thresholds.largeEventGuestCount) {
      detections.push(
        detection(event, 'guest-catering.guest-list-missing', {
          category: 'guest-catering',
          severity: 'low',
          certainty: 'missing-data',
          title: 'Guest list and RSVPs are not recorded',
          explanation:
            'This event expects a relatively large number of guests, but no guest records exist. Attendance, dietary needs, and accessibility requests cannot be assessed.',
          evidence: [
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Guest records', '0'),
          ],
          recommendedAction:
            'Add guest records and record RSVPs in the Guest Manager. Expected guests remain a planning estimate, not a confirmed headcount.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'guest-rules',
        }),
      );
    }
  } else {
    const pendingThreshold = Math.max(
      thresholds.pendingRsvpMinimumCount,
      Math.ceil((counts.invited * thresholds.pendingRsvpHighPercent) / 100),
    );

    if (counts.pending >= pendingThreshold && counts.pending > 0) {
      const pendingPercent = percent(counts.pending, counts.invited);

      detections.push(
        detection(event, 'guest-catering.rsvp-incomplete', {
          category: 'guest-catering',
          severity: withinNearWindow ? 'high' : 'medium',
          certainty: 'confirmed',
          title: 'RSVP information is incomplete',
          explanation:
            'A material share of invited guests have not responded. Pending guests are not confirmed attendees and make catering and seating plans uncertain.',
          evidence: [
            evidence('Invited guests', formatCount(counts.invited)),
            evidence('Pending RSVPs', formatCount(counts.pending)),
            evidence('Confirmed guests', formatCount(counts.confirmed)),
            evidence('Pending share', `${pendingPercent}%`),
            evidence('Threshold applied', `${formatCount(pendingThreshold)} pending guests`),
          ],
          recommendedAction:
            'Follow up with pending guests in the Guest Manager. Do not count pending RSVPs as confirmed attendance.',
          relatedEntities: [
            entity('event', event.id),
            ...relatedIds(
              'guest',
              guests
                .filter((guest) => guest.rsvp === 'pending')
                .map((guest) => guest.id),
            ),
          ],
          sourceModule: 'guest-rules',
        }),
      );
    }

    const difference = Math.abs(counts.confirmed - expectedGuests);
    const deviationThreshold = Math.max(
      thresholds.attendanceDeviationMinimumCount,
      Math.ceil((expectedGuests * thresholds.attendanceDeviationPercent) / 100),
    );

    if (difference >= deviationThreshold) {
      const aboveExpected = counts.confirmed > expectedGuests;
      const certainty: RiskCertainty =
        aboveExpected || counts.pending === 0 ? 'confirmed' : 'potential';

      detections.push(
        detection(event, 'guest-catering.attendance-deviation', {
          category: 'guest-catering',
          severity: aboveExpected ? 'high' : 'medium',
          certainty,
          title: aboveExpected
            ? 'Confirmed attendance exceeds the planning count'
            : 'Confirmed attendance is below the planning count',
          explanation: aboveExpected
            ? 'Confirmed RSVPs are higher than the expected guest count used for planning. Catering and space allocations may be too low.'
            : 'Confirmed RSVPs are materially below the expected guest count. Pending replies may still change the final number, but current confirmations do not match the plan.',
          evidence: [
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Confirmed guests', formatCount(counts.confirmed)),
            evidence('Pending guests', formatCount(counts.pending)),
            evidence('Difference', formatCount(difference)),
            evidence('Materiality threshold', `${formatCount(deviationThreshold)} guests`),
          ],
          recommendedAction:
            'Reconcile the expected count with confirmed RSVPs in the Guest Manager. Update the event’s expected count only as an explicit planning decision.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'guest-rules',
        }),
      );
    }
  }

  if (estimateConfigured && estimateInvalid) {
    detections.push(
      detection(event, 'guest-catering.catering-estimate-invalid', {
        category: 'guest-catering',
        severity: 'high',
        certainty: 'confirmed',
        title: 'The saved catering estimate cannot be evaluated',
        explanation:
          'The saved per-person cost assumption or buffer cannot be used for a safe estimate. Catering coverage cannot be verified.',
        evidence: [
          evidence('Saved estimate', 'Present but unreadable'),
          evidence('Estimated cost', 'Not calculated'),
          evidence('Values invented', 'None'),
        ],
        recommendedAction:
          'Correct the per-person cost and buffer in the Guest Manager, then review the recalculated planning estimate. It is an assumption, not a vendor quote.',
        relatedEntities: [entity('event', event.id), entity('catering-estimate', event.id)],
        sourceModule: 'catering-estimator',
      }),
    );
  }

  if (!estimateConfigured) {
    if (withinNearWindow) {
      detections.push(
        detection(event, 'guest-catering.catering-estimate-missing', {
          category: 'guest-catering',
          severity: 'low',
          certainty: 'missing-data',
          title: 'No catering cost assumption is recorded',
          explanation:
            'The event is near, but no per-person catering assumption exists. Whether the catering allocation covers attendance cannot be checked.',
          evidence: [
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Catering estimate', 'Not recorded'),
          ],
          recommendedAction:
            'Record a per-person cost assumption and buffer in the Guest Manager. It is a planning assumption, never a vendor price.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'guest-rules',
        }),
      );
    }
  } else if (estimate) {
    if (
      estimate.differenceFromPlanMinor !== null &&
      estimate.differenceFromPlanMinor > 0
    ) {
      const plannedMinor = estimate.cateringCategory?.planned.amountMinor ?? 0;
      const overPercent = percent(estimate.differenceFromPlanMinor, plannedMinor);

      detections.push(
        detection(event, 'guest-catering.catering-over-plan', {
          category: 'guest-catering',
          severity:
            overPercent >= thresholds.cateringOverrunHighPercent ? 'high' : 'medium',
          certainty: 'assumption',
          title: 'Catering estimate exceeds its planned allocation',
          explanation:
            'Using the saved per-person assumption and buffer, the catering estimate is above the planned catering allocation. The estimate is a planning assumption, not a vendor quote.',
          evidence: [
            evidence('Estimated cost', formatInr(estimate.estimatedCost.amountMinor)),
            evidence(
              'Catering allocation',
              estimate.cateringCategory
                ? formatInr(plannedMinor)
                : 'No catering category',
            ),
            evidence(
              'Difference',
              formatInr(estimate.differenceFromPlanMinor),
            ),
            evidence(
              'Attendees used',
              `${formatCount(estimate.estimatedAttendees)} (${estimate.attendeeSource === 'confirmed' ? 'confirmed RSVPs' : 'expected guests'})`,
            ),
            evidence('Over-plan share', `${overPercent}%`),
          ],
          recommendedAction:
            'Review the catering plan and per-person assumption, then adjust the allocation or buffer in the app. No vendor price was inferred.',
          relatedEntities: [
            entity('event', event.id),
            entity('catering-estimate', event.id),
            ...(estimate.cateringCategory
              ? [entity('budget-category', estimate.cateringCategory.id)]
              : []),
          ],
          sourceModule: 'catering-estimator',
        }),
      );
    }

    if (estimate.estimatedAttendees < expectedGuests) {
      detections.push(
        detection(event, 'guest-catering.catering-below-expected', {
          category: 'guest-catering',
          severity: counts.pending === 0 ? 'high' : 'medium',
          certainty: counts.pending === 0 ? 'confirmed' : 'potential',
          title: 'Catering estimate covers fewer guests than planned',
          explanation:
            'The catering estimate is based on confirmed RSVPs plus its buffer, and covers fewer attendees than the event’s expected guest count.',
          evidence: [
            evidence('Estimated attendees', formatCount(estimate.estimatedAttendees)),
            evidence('Expected guests', formatCount(expectedGuests)),
            evidence('Confirmed guests', formatCount(estimate.counts.confirmed)),
            evidence('Pending guests', formatCount(estimate.counts.pending)),
            evidence('Buffer applied', `${estimate.bufferPercent}%`),
          ],
          recommendedAction:
            'Reconcile expected attendance or increase the buffer in the Guest Manager. Pending RSVPs must not be treated as confirmed.',
          relatedEntities: [
            entity('event', event.id),
            entity('catering-estimate', event.id),
          ],
          sourceModule: 'catering-estimator',
        }),
      );
    }
  }

  const accessibilityGuests = guests.filter(
    (guest) =>
      guest.rsvp === 'confirmed' && Boolean(guest.accessibilityRequest?.trim()),
  );

  if (
    accessibilityGuests.length > 0 &&
    event.accessibilityAddressed !== true
  ) {
    detections.push(
      detection(event, 'guest-catering.guest-accessibility', {
        category: 'guest-catering',
        severity: withinNearWindow ? 'high' : 'medium',
        certainty:
          event.accessibilityAddressed === false ? 'confirmed' : 'missing-data',
        title: 'Guest accessibility requests lack a recorded plan',
        explanation:
          'Confirmed guests have accessibility requests, but the event is not marked as having addressed accessibility. The app cannot verify venue access or vendor compliance.',
        evidence: [
          evidence('Confirmed guests with requests', formatCount(accessibilityGuests.length)),
          evidence(
            'Event accessibility status',
            event.accessibilityAddressed === false
              ? 'Recorded as not addressed'
              : 'Not recorded',
          ),
        ],
        recommendedAction:
          'Confirm each request with the venue and record the arrangements. Then mark accessibility as addressed in the event details when it is genuinely confirmed.',
        relatedEntities: [
          entity('event', event.id),
          ...relatedIds(
            'guest',
            accessibilityGuests.map((guest) => guest.id),
          ),
        ],
        sourceModule: 'event-readiness',
      }),
    );
  }

  return detections;
}

interface VenueContext {
  readonly event: CelebrationEvent;
  readonly daysUntilEvent: number | null;
  readonly withinNearWindow: boolean;
  readonly thresholds: RiskThresholds;
}

function analyzeVenue(context: VenueContext): RiskDetection[] {
  const { event, daysUntilEvent, withinNearWindow, thresholds } = context;
  const detections: RiskDetection[] = [];

  if (daysUntilEvent === null) {
    return detections;
  }

  if (typeof event.setting === 'undefined') {
    if (withinNearWindow) {
      detections.push(
        detection(event, 'venue-contingency.setting-missing', {
          category: 'venue-contingency',
          severity: 'low',
          certainty: 'missing-data',
          title: 'Indoor or outdoor setting is not recorded',
          explanation:
            'Weather contingency cannot be assessed because the event setting is blank.',
          evidence: [
            evidence('Event date', formatEventDate(event.startsAt)),
            evidence('Setting', 'Not recorded'),
          ],
          recommendedAction:
            'Record whether the event is indoor, outdoor, or mixed in the event details. This does not create a venue change.',
          relatedEntities: [entity('event', event.id)],
          sourceModule: 'event-readiness',
        }),
      );
    }
  } else if (
    (event.setting === 'outdoor' || event.setting === 'mixed') &&
    event.contingencyPlanConfirmed !== true
  ) {
    detections.push(
      detection(event, 'venue-contingency.weather-contingency-missing', {
        category: 'venue-contingency',
        severity: withinNearWindow ? 'high' : 'medium',
        certainty:
          event.contingencyPlanConfirmed === false ? 'confirmed' : 'missing-data',
        title:
          event.contingencyPlanConfirmed === false
            ? 'Outdoor contingency plan is not confirmed'
            : 'Outdoor contingency plan is not recorded',
        explanation:
          'The event uses an outdoor or mixed setting, but no confirmed weather contingency exists. The app does not check weather forecasts or book a backup venue.',
        evidence: [
          evidence('Setting', settingLabels[event.setting]),
          evidence('Event date', formatEventDate(event.startsAt)),
          evidence(
            'Contingency plan',
            event.contingencyPlanConfirmed === false
              ? 'Recorded as not confirmed'
              : 'Not recorded',
          ),
        ],
        recommendedAction:
          'Confirm a wet-weather option with the venue and record the confirmation in the event details. Nothing was booked or changed.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  if (
    event.accessibilityRequired === true &&
    event.accessibilityAddressed !== true
  ) {
    detections.push(
      detection(event, 'venue-contingency.accessibility-unaddressed', {
        category: 'venue-contingency',
        severity: withinNearWindow ? 'high' : 'medium',
        certainty:
          event.accessibilityAddressed === false ? 'confirmed' : 'missing-data',
        title: 'Accessibility is required but not recorded as addressed',
        explanation:
          'The event requires accessible arrangements, but there is no recorded confirmation that they are in place. The app cannot verify physical access or vendor compliance.',
        evidence: [
          evidence('Accessibility required', 'Yes'),
          evidence(
            'Accessibility addressed',
            event.accessibilityAddressed === false
              ? 'No'
              : 'Not recorded',
          ),
        ],
        recommendedAction:
          'Confirm step-free access, seating, and facilities with the venue, then mark accessibility as addressed when it is genuinely confirmed.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  if (
    withinNearWindow &&
    typeof event.accessibilityRequired === 'undefined' &&
    event.expectedGuests >= thresholds.largeEventGuestCount
  ) {
    detections.push(
      detection(event, 'venue-contingency.accessibility-unknown', {
        category: 'venue-contingency',
        severity: 'low',
        certainty: 'missing-data',
        title: 'Accessibility needs are not recorded',
        explanation:
          'The event is near and relatively large, but it is not recorded whether accessibility arrangements are required.',
        evidence: [
          evidence('Expected guests', formatCount(event.expectedGuests)),
          evidence('Accessibility required', 'Not recorded'),
        ],
        recommendedAction:
          'Record whether accessibility is required in the event details, then confirm any needed arrangements with the venue.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  if (
    withinNearWindow &&
    event.expectedGuests >= thresholds.largeEventGuestCount &&
    !event.venue?.trim()
  ) {
    detections.push(
      detection(event, 'venue-contingency.venue-missing', {
        category: 'venue-contingency',
        severity: 'medium',
        certainty: 'missing-data',
        title: 'Venue information is missing',
        explanation:
          'The event is near and relatively large, but no venue is recorded. Logistical planning cannot be checked.',
        evidence: [
          evidence('Event date', formatEventDate(event.startsAt)),
          evidence('Venue', 'Not recorded'),
          evidence('Expected guests', formatCount(event.expectedGuests)),
        ],
        recommendedAction:
          'Record the confirmed venue in the event details. This risk does not reserve or change a venue.',
        relatedEntities: [entity('event', event.id)],
        sourceModule: 'event-readiness',
      }),
    );
  }

  return detections;
}

interface ProposalContext {
  readonly event: CelebrationEvent;
  readonly tasks: readonly PlanningTask[];
  readonly guests: readonly Guest[];
  readonly activities: readonly TimelineActivity[];
  readonly estimate: CateringEstimateConfig | null;
  readonly withinCriticalWindow: boolean;
  readonly snapshots: readonly RiskProposalSnapshot[];
}

function analyzeProposals(context: ProposalContext): RiskDetection[] {
  const { event, snapshots, withinCriticalWindow } = context;
  const detections: RiskDetection[] = [];
  const currentEventSignature = createEventSnapshotSignature(event);
  const currentDataSignature = createProposalDataSignature(
    event,
    context.tasks,
    context.guests,
    context.activities,
    context.estimate,
  );
  const protectedIds = new Set(
    event.budget.categories
      .filter((category) => category.flexibility.mode === 'protected')
      .map((category) => category.id),
  );

  for (const snapshot of snapshots) {
    if (snapshot.eventId !== event.id) {
      continue;
    }

    const dataChanged =
      snapshot.originalEventSignature !== currentEventSignature ||
      snapshot.relatedDataSignature !== currentDataSignature;

    if (!dataChanged) {
      continue;
    }

    const protectedConflict = snapshot.affectedCategoryIds.some(
      (categoryId) =>
        protectedIds.has(categoryId) &&
        !snapshot.protectedCategoryIds.includes(categoryId),
    );
    const ruleId = protectedConflict
      ? 'proposal-consistency.protected-conflict'
      : 'proposal-consistency.stale';
    const severity: RiskSeverity = withinCriticalWindow ? 'critical' : 'high';

    detections.push(
      detection(event, ruleId, {
        category: 'proposal-consistency',
        severity,
        certainty: 'confirmed',
        title: protectedConflict
          ? 'Event Rescue proposal conflicts with current protections'
          : 'Event Rescue proposal is based on outdated data',
        explanation: protectedConflict
          ? 'The event or its related records changed after this proposal was generated, and it now affects a category that is protected. The proposal cannot be approved safely.'
          : 'The event, budget, tasks, guests, or activities changed after this proposal was generated. Its recommended changes were evaluated against older data.',
        evidence: [
          evidence('Proposal generated', formatLocalDateTime(snapshot.createdAt.slice(0, 16))),
          evidence('Proposed changes', formatCount(snapshot.changeCount)),
          evidence(
            'Validation when generated',
            snapshot.isValid ? 'Passed' : 'Did not pass',
          ),
          evidence('Unresolved issues reported', formatCount(snapshot.unresolvedIssueCount)),
          evidence(
            'Data changed since analysis',
            snapshot.originalEventSignature !== currentEventSignature
              ? 'Event or budget'
              : 'Tasks, guests, or activities',
          ),
        ],
        recommendedAction:
          'Open Event Rescue for this event and analyze again to create a fresh proposal against the latest data. Nothing from the outdated proposal has been applied.',
        relatedEntities: [
          entity('event', event.id),
          entity('rescue-proposal', snapshot.proposalId),
          ...snapshot.affectedCategoryIds
            .slice(0, 4)
            .map((categoryId) => entity('budget-category', categoryId)),
        ],
        sourceModule: 'event-rescue',
        entityKey: snapshot.proposalId,
      }),
    );
  }

  return detections;
}

interface EventAnalysis {
  readonly detections: readonly RiskDetection[];
  readonly errors: readonly RiskAnalysisError[];
}

function analyzeEvent(
  event: CelebrationEvent,
  workspace: RiskAnalysisInput['workspace'],
  todayIso: string,
  thresholds: RiskThresholds,
): EventAnalysis {
  const detections: RiskDetection[] = [];
  const errors: RiskAnalysisError[] = [];
  const tasks = workspace.tasks.filter((task) => task.eventId === event.id);
  const guests = workspace.guests.filter((guest) => guest.eventId === event.id);
  const activities = workspace.activities.filter(
    (activity) => activity.eventId === event.id,
  );
  const estimateConfig =
    workspace.cateringEstimates.find((entry) => entry.eventId === event.id) ?? null;
  const budget = analyzeBudget(event, thresholds);

  detections.push(...budget.detections);
  errors.push(...budget.errors);

  const dateIsValid = isValidIsoDate(event.startsAt);
  const daysUntilEvent = dateIsValid
    ? daysBetween(todayIso, event.startsAt)
    : null;

  if (!dateIsValid) {
    errors.push(
      analysisError(
        event,
        'scheduling.invalid-event-date',
        'The saved event date could not be interpreted; date-based checks were skipped.',
      ),
    );
  }

  const withinNearWindow =
    daysUntilEvent !== null &&
    daysUntilEvent >= 0 &&
    daysUntilEvent <= thresholds.nearEventDays;
  const withinCriticalWindow =
    daysUntilEvent !== null &&
    daysUntilEvent >= 0 &&
    daysUntilEvent <= thresholds.criticalWindowDays;

  if (dateIsValid) {
    detections.push(
      ...analyzeScheduling({
        event,
        tasks,
        activities,
        todayIso,
        daysUntilEvent,
        withinNearWindow,
        withinCriticalWindow,
        thresholds,
      }),
    );
  }

  detections.push(
    ...analyzeVenue({
      event,
      daysUntilEvent,
      withinNearWindow,
      thresholds,
    }),
  );

  const counts = getGuestCounts(guests);
  let estimate: CateringEstimate | null = null;
  let estimateInvalid = false;

  if (estimateConfig) {
    try {
      estimate = calculateCateringEstimate(
        event,
        guests,
        estimateConfig.perPersonCost,
        estimateConfig.bufferPercent,
      );
    } catch {
      estimateInvalid = true;
      errors.push(
        analysisError(
          event,
          'guest-catering.catering-estimate-invalid',
          'The saved catering estimate could not be evaluated safely; catering checks were limited.',
        ),
      );
    }
  }

  detections.push(
    ...analyzeGuests({
      event,
      guests,
      counts,
      estimate,
      estimateConfigured: estimateConfig !== null,
      estimateInvalid,
      withinNearWindow,
      thresholds,
    }),
  );

  detections.push(
    ...analyzeProposals({
      event,
      tasks,
      guests,
      activities,
      estimate: estimateConfig,
      withinCriticalWindow,
      snapshots: workspace.rescueProposalSnapshots ?? [],
    }),
  );

  return { detections, errors };
}

/**
 * Deterministic, read-only risk analysis. The saved workspace is never
 * mutated; the caller reconciles the returned detections into stored findings.
 */
export function analyzeWorkspaceRisks(input: RiskAnalysisInput): RiskAnalysisResult {
  if (!isValidIsoDate(input.todayIso)) {
    throw new RangeError('Risk analysis needs a valid local date in YYYY-MM-DD form.');
  }

  const thresholds = resolveRiskThresholds(input.thresholds);
  const detections: RiskDetection[] = [];
  const errors: RiskAnalysisError[] = [];
  const analyzedEventIds: string[] = [];

  for (const event of input.workspace.events) {
    if (event.status === 'completed') {
      continue;
    }

    analyzedEventIds.push(event.id);
    const result = analyzeEvent(event, input.workspace, input.todayIso, thresholds);
    detections.push(...result.detections);
    errors.push(...result.errors);
  }

  return {
    detections,
    errors,
    analyzedEventIds,
    thresholds,
  };
}
