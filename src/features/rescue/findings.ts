import { calculateCateringEstimate } from '@/features/catering/cateringEstimator';
import { getGuestCounts } from '@/features/guests/guestRules';
import { findActivityOverlaps } from '@/features/timeline/activityRules';
import { formatActivityDateTime } from '@/lib/dateTime';
import { formatCount, formatCountLabel } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { PlanningTask } from '@/types/domain';
import type {
  RescueFinding,
  RescueFindingInput,
  RescueValidationResult,
} from './rescueTypes';

const MAX_LISTED_TASKS = 3;

function quoteTitles(tasks: readonly PlanningTask[]): string {
  const listed = tasks
    .slice(0, MAX_LISTED_TASKS)
    .map((task) => `“${task.title}”`)
    .join(', ');
  const remaining = tasks.length - MAX_LISTED_TASKS;

  return remaining > 0 ? `${listed} and ${formatCountLabel(remaining, 'more task')}` : listed;
}

function sortTasks(tasks: readonly PlanningTask[]): PlanningTask[] {
  return [...tasks].sort(
    (first, second) =>
      first.dueDate.localeCompare(second.dueDate) || first.id.localeCompare(second.id),
  );
}

export function createInvalidRequestFinding(
  validation: RescueValidationResult,
): RescueFinding {
  const errors = validation.issues.filter((entry) => entry.severity === 'error');

  return {
    id: 'finding-invalid-request',
    code: 'invalid-request',
    severity: 'critical',
    certainty: 'confirmed',
    area: 'requirements',
    title: 'The rescue request needs correction',
    description:
      errors[0]?.message ??
      'The rescue request does not contain the information needed for a safe analysis.',
    constraints: errors.map((entry) => entry.message),
    recommendedAction:
      'Correct the highlighted requirement or priority, then analyze the event again.',
    explanation:
      'No plan was generated because invalid inputs cannot be evaluated safely. Nothing was changed.',
    affectedCategoryIds: errors.flatMap((entry) =>
      entry.categoryId ? [entry.categoryId] : [],
    ),
  };
}

function detectBudgetFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const findings: RescueFinding[] = [];
  const { originalTotals, preRepairTotals } = input;
  const originalOverrun = originalTotals.overrun.amountMinor > 0;
  const preRepairOverrun = preRepairTotals.overrun.amountMinor > 0;

  if (input.event.budget.categories.length === 0) {
    findings.push({
      id: 'finding-budget-empty',
      code: 'budget-empty',
      severity: 'warning',
      certainty: 'missing-data',
      area: 'budget',
      title: 'No expense categories are recorded',
      description:
        'The event has a total budget but no category allocations, so there is no detailed plan to rescue.',
      constraints: [
        'Event Rescue cannot invent category allocations or vendor pricing.',
        'Categories are managed in the Budget Planner.',
      ],
      recommendedAction:
        'Add expense categories and planned amounts in the Budget Planner, then analyze again.',
      explanation:
        'Confirmed from the saved budget, which currently contains zero categories.',
      affectedCategoryIds: [],
    });
  }

  if (originalOverrun || preRepairOverrun) {
    const savedSentence = originalOverrun
      ? `The saved plan is ${formatMoney(originalTotals.overrun)} over its ${formatMoney(originalTotals.totalBudget)} total.`
      : `The saved plan fits its ${formatMoney(originalTotals.totalBudget)} total.`;
    const proposedSentence = preRepairOverrun
      ? `After the requested requirements and any implied catering adjustment, planned allocations total ${formatMoney(preRepairTotals.planned)} against ${formatMoney(preRepairTotals.totalBudget)}, an overrun of ${formatMoney(preRepairTotals.overrun)}.`
      : 'After the requested requirements and any implied catering adjustment, planned allocations fit the total budget.';

    findings.push({
      id: 'finding-budget-overrun',
      code: 'budget-overrun',
      severity: 'critical',
      certainty: 'confirmed',
      area: 'budget',
      title:
        originalOverrun && !preRepairOverrun
          ? 'The saved plan is over budget'
          : 'The plan is over budget',
      description: `${savedSentence} ${proposedSentence}`,
      constraints: [
        'The total budget is never raised automatically.',
        'Protected categories are never reduced automatically.',
        'Every allocation stays at or above zero.',
      ],
      recommendedAction:
        'Review the deterministic reductions offered for flexible categories, or explicitly raise the total budget in this request.',
      explanation:
        'Confirmed arithmetic from saved integer-paise allocations. No AI model is used for totals.',
      affectedCategoryIds: [],
    });
  }

  if (originalTotals.actual.amountMinor > originalTotals.totalBudget.amountMinor) {
    findings.push({
      id: 'finding-budget-actual-overrun',
      code: 'budget-actual-overrun',
      severity: 'warning',
      certainty: 'confirmed',
      area: 'budget',
      title: 'Recorded actual spend exceeds the total budget',
      description: `Actual spend of ${formatMoney(originalTotals.actual)} is already above the ${formatMoney(originalTotals.totalBudget)} total. Planned reductions cannot reverse money that has already been recorded as spent.`,
      constraints: [
        'Event Rescue does not change actual spend.',
        'The total budget is only changed when the request explicitly asks for it.',
      ],
      recommendedAction:
        'Raise the total budget explicitly if the spend is valid, or reconcile the recorded amounts in the Budget Planner.',
      explanation:
        'Confirmed from recorded actual amounts. It does not include uninvoiced or unknown future costs.',
      affectedCategoryIds: [],
    });
  }

  if (
    preRepairTotals.protectedPlanned.amountMinor >
    preRepairTotals.totalBudget.amountMinor
  ) {
    findings.push({
      id: 'finding-protected-overrun',
      code: 'protected-overrun',
      severity: 'critical',
      certainty: 'confirmed',
      area: 'priority',
      title: 'Protected priorities alone exceed the budget',
      description: `Protected allocations total ${formatMoney(preRepairTotals.protectedPlanned)} against a ${formatMoney(preRepairTotals.totalBudget)} budget. No amount of flexible reduction can resolve this while those protections remain.`,
      constraints: [
        'Protected categories are never reduced automatically.',
        'Base protection changes belong in the Budget Planner, not in a rescue proposal.',
        'The total budget is never raised automatically.',
      ],
      recommendedAction:
        'Raise the total budget explicitly in this request, or change base category protection in the Budget Planner and analyze again.',
      explanation:
        'Confirmed arithmetic on the requested requirements and protection choices.',
      affectedCategoryIds: input.protectedCategoryIds,
    });
  }

  if (!input.repairFeasible && !preRepairTotals.isOverBudget) {
    const blockingReasons =
      input.repairIssues.length > 0
        ? input.repairIssues.join(' ')
        : 'The saved allocations could not be validated safely.';

    findings.push({
      id: 'finding-repair-infeasible',
      code: 'repair-infeasible',
      severity: 'critical',
      certainty: 'confirmed',
      area: 'priority',
      title: 'No feasible repair exists under these constraints',
      description: blockingReasons,
      constraints: [
        'Protected categories and flexible minimums are hard constraints.',
        'No allocation can become negative.',
      ],
      recommendedAction:
        'Raise the total budget explicitly, lower a flexible minimum in this request, or review base protections in the Budget Planner.',
      explanation:
        'The deterministic repair engine could not produce a valid plan. No changes were applied.',
      affectedCategoryIds: [],
    });
  } else if (
    !input.repairFeasible &&
    preRepairTotals.isOverBudget &&
    preRepairTotals.protectedPlanned.amountMinor <= preRepairTotals.totalBudget.amountMinor
  ) {
    findings.push({
      id: 'finding-repair-infeasible',
      code: 'repair-infeasible',
      severity: 'critical',
      certainty: 'confirmed',
      area: 'priority',
      title: 'Flexible capacity cannot cover the overrun',
      description: `The plan remains ${formatMoney(input.repairShortfall)} over budget after every eligible flexible category is reduced to its configured minimum.`,
      constraints: [
        'Protected categories and flexible minimums are hard constraints.',
        'The total budget is never raised automatically.',
      ],
      recommendedAction:
        'Raise the total budget explicitly in this request, or lower a flexible minimum before analyzing again.',
      explanation:
        'Confirmed by the deterministic repair engine. No protected allocation was reduced.',
      affectedCategoryIds: [],
    });
  } else if (input.repairReductionCount > 0) {
    findings.push({
      id: 'finding-budget-repairable',
      code: 'budget-repairable',
      severity: 'info',
      certainty: 'confirmed',
      area: 'budget',
      title: 'A flexible reduction can cover the gap',
      description: `${formatCountLabel(input.repairReductionCount, 'flexible category', 'flexible categories')} can be reduced to bring planned expenditure within the total budget. Protected categories and flexible minimums are preserved.`,
      constraints: [
        'The deterministic rule reduces the largest reducible amount first.',
        'A feasible repair is not claimed to be globally optimal.',
      ],
      recommendedAction:
        'Review each proposed reduction and its minimum before approving anything.',
      explanation:
        'Confirmed by the same deterministic repair engine used by the Budget Planner.',
      affectedCategoryIds: [],
    });
  }

  return findings;
}

function detectGuestAndCateringFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const findings: RescueFinding[] = [];
  const originalGuests = input.event.expectedGuests;
  const proposedGuests = input.effective.expectedGuests;

  if (proposedGuests > originalGuests) {
    const added = proposedGuests - originalGuests;
    const percent =
      originalGuests === 0
        ? null
        : Math.round((added / originalGuests) * 100);

    findings.push({
      id: 'finding-guest-increase',
      code: 'guest-increase',
      severity: 'warning',
      certainty: 'confirmed',
      area: 'guests',
      title: 'The guest count increases',
      description: `Expected guests move from ${formatCount(originalGuests)} to ${formatCount(proposedGuests)} (+${formatCount(added)}${percent === null ? '' : `, about ${percent}%`}). Per-guest costs may no longer match the saved plan.`,
      constraints: [
        'The saved guest count is not changed until a proposal is approved.',
        'Event Rescue never changes the guest count to make a plan appear feasible.',
      ],
      recommendedAction:
        'Confirm this guest change and review any catering recalculation before approving.',
      explanation:
        'Confirmed by comparing the requested guest count with the saved event.',
      affectedCategoryIds: [],
    });
  }

  if (!input.guestsChanged) {
    return findings;
  }

  const recalculated = input.cateringAdjustments.filter(
    (entry) => entry.reason !== 'protected-held',
  );
  const heldProtected = input.cateringAdjustments.filter(
    (entry) => entry.reason === 'protected-held',
  );

  if (!input.cateringUsable) {
    findings.push({
      id: 'finding-catering-missing',
      code: 'catering-missing',
      severity: 'warning',
      certainty: 'missing-data',
      area: 'catering',
      title: 'Catering cannot be recalculated',
      description:
        'The guest count changes, but no usable catering category with a positive planned amount exists. The catering estimate therefore remains unchanged and may be inconsistent with the new guest count.',
      constraints: [
        'No vendor price or inferred per-guest rate was invented.',
        'Event Rescue does not create budget categories.',
      ],
      recommendedAction:
        'Add a catering category with a current planned amount in the Budget Planner, then analyze again.',
      explanation:
        'Missing information, not a confirmed overrun. No catering number was fabricated.',
      affectedCategoryIds: [],
    });
  }

  if (recalculated.length > 0) {
    const lines = recalculated.map((entry) => {
      const suffix =
        entry.reason === 'minimum-clamped'
          ? ' It was held at the flexible minimum because the proportional estimate fell below it.'
          : entry.reason === 'increased'
            ? ' It increased with the guest count.'
            : ' It decreased with the guest count.';

      return `“${entry.categoryName}” moves from ${formatMoney(entry.originalPlanned)} to ${formatMoney(entry.adjustedPlanned)}.${suffix}`;
    });

    findings.push({
      id: 'finding-catering-recalculation',
      code: 'catering-recalculation',
      severity: 'info',
      certainty: 'assumption',
      area: 'catering',
      title: 'Catering recalculated from the saved baseline',
      description: lines.join(' '),
      constraints: [
        'The estimate scales the saved catering plan by the guest ratio and rounds to the nearest paise.',
        'This is a planning assumption, not a vendor quote or invoice.',
        'A protected catering plan is never reduced automatically.',
      ],
      recommendedAction:
        'Replace the estimate with a current vendor quote in the Budget Planner when one is available.',
      explanation:
        'Derived arithmetic using the saved per-guest baseline. No external price or AI-generated amount was used.',
      affectedCategoryIds: recalculated.map((entry) => entry.categoryId),
    });
  }

  if (heldProtected.length > 0) {
    findings.push({
      id: 'finding-protected-catering-held',
      code: 'protected-catering-held',
      severity: 'warning',
      certainty: 'confirmed',
      area: 'priority',
      title: 'Protected catering was held at its saved plan',
      description: heldProtected
        .map(
          (entry) =>
            `“${entry.categoryName}” remains at ${formatMoney(entry.originalPlanned)} even though the guest count decreased. Protected categories are never reduced automatically.`,
        )
        .join(' '),
      constraints: [
        'Protected categories are never reduced automatically.',
        'Reducing a protected category requires an explicit base protection change in the Budget Planner.',
      ],
      recommendedAction:
        'Keep the protection if the catering commitment is fixed, or review its base protection in the Budget Planner.',
      explanation:
        'Confirmed behavior of the protection constraint. The plan keeps the saved allocation.',
      affectedCategoryIds: heldProtected.map((entry) => entry.categoryId),
    });
  }

  return findings;
}

function detectTaskFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const findings: RescueFinding[] = [];
  const eventTasks = input.tasks.filter((task) => task.eventId === input.event.id);

  if (eventTasks.length === 0) {
    findings.push(
      input.tasks.length > 0
        ? {
            id: 'finding-tasks-missing',
            code: 'tasks-missing',
            severity: 'warning',
            certainty: 'missing-data',
            area: 'tasks',
            title: 'No tasks are recorded for this event',
            description:
              'Task data exists for other celebrations, but this event has none. Task completeness and scheduling conflicts cannot be assessed.',
            constraints: [
              'Event Rescue does not invent tasks or deadlines.',
            ],
            recommendedAction:
              'Add the real planning tasks and due dates, then analyze the event again.',
            explanation:
              'Missing information. No task was assumed to exist or not exist.',
            affectedCategoryIds: [],
          }
        : {
            id: 'finding-schedule-data-missing',
            code: 'schedule-data-missing',
            severity: 'info',
            certainty: 'missing-data',
            area: 'schedule',
            title: 'No schedule data is recorded',
            description:
              'No tasks exist anywhere in this workspace, so task completeness and scheduling conflicts cannot be assessed for this event.',
            constraints: [
              'Event Rescue does not invent tasks, deadlines, or calendar entries.',
            ],
            recommendedAction:
              'Add the real preparation tasks and due dates, then analyze the event again.',
            explanation:
              'Missing information. No schedule was assumed to exist or not exist.',
            affectedCategoryIds: [],
          },
    );
    return findings;
  }

  const incomplete = sortTasks(eventTasks.filter((task) => task.status === 'open'));
  const overdue = incomplete.filter((task) => task.dueDate < input.todayIso);
  const overdueHighPriority = overdue.filter((task) => task.priority === 'high');
  const afterEvent = incomplete.filter(
    (task) => task.dueDate > input.effective.startsAt,
  );

  if (overdue.length > 0) {
    const priorityNote =
      overdueHighPriority.length > 0
        ? ` ${formatCountLabel(overdueHighPriority.length, 'high-priority task is', 'high-priority tasks are')} among them.`
        : '';

    findings.push({
      id: 'finding-tasks-overdue',
      code: 'tasks-open',
      severity: overdueHighPriority.length > 0 ? 'critical' : 'warning',
      certainty: 'confirmed',
      area: 'tasks',
      title:
        overdueHighPriority.length > 0
          ? `${formatCountLabel(overdue.length, 'task is', 'tasks are')} overdue, including high-priority work`
          : `${formatCountLabel(overdue.length, 'task is', 'tasks are')} overdue`,
      description: `${quoteTitles(overdue)} ${overdue.length === 1 ? 'is' : 'are'} past the due date and still open.${priorityNote}`,
      constraints: [
        'Event Rescue does not reschedule or complete tasks.',
      ],
      recommendedAction:
        'Complete or reschedule these tasks, then analyze the event again.',
      explanation:
        'Confirmed from stored task due dates and priorities compared with today. No external calendar was checked.',
      affectedCategoryIds: [],
    });
  }

  if (afterEvent.length > 0) {
    findings.push({
      id: 'finding-tasks-after-event',
      code: 'task-after-event',
      severity: 'warning',
      certainty: 'confirmed',
      area: 'schedule',
      title: 'Tasks are scheduled after the event',
      description: `${quoteTitles(afterEvent)} ${afterEvent.length === 1 ? 'is' : 'are'} due after the proposed event date.`,
      constraints: [
        'Event Rescue does not move task deadlines automatically.',
      ],
      recommendedAction:
        'Move these deadlines before the event, or confirm they are intentionally post-event tasks.',
      explanation:
        'Confirmed by comparing stored due dates with the requested event date.',
      affectedCategoryIds: [],
    });
  }

  return findings;
}

function detectConfirmedAttendanceFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const eventGuests = input.guests.filter(
    (guest) => guest.eventId === input.event.id,
  );

  if (eventGuests.length === 0) {
    return [];
  }

  const counts = getGuestCounts(eventGuests);

  if (counts.confirmed <= input.effective.expectedGuests) {
    return [];
  }

  const excess = counts.confirmed - input.effective.expectedGuests;

  return [
    {
      id: 'finding-confirmed-attendance',
      code: 'confirmed-attendance',
      severity: 'warning',
      certainty: 'confirmed',
      area: 'guests',
      title: 'Confirmed RSVPs exceed the expected guest count',
      description: `${formatCountLabel(counts.confirmed, 'guest is', 'guests are')} confirmed, which is ${formatCountLabel(excess, 'guest')} above the ${formatCountLabel(input.effective.expectedGuests, 'expected guest')} used in this analysis. Catering and space plans may no longer match confirmed attendance.`,
      constraints: [
        'Invited guests are not the same as confirmed attendees.',
        'Event Rescue does not change the guest count or RSVP records automatically.',
        'The saved event is not changed until a proposal is approved.',
      ],
      recommendedAction:
        'Review the confirmed list. If it is accurate, request the new guest count explicitly and review catering and capacity.',
      explanation:
        'Confirmed from stored RSVP records and compared with the expected guest count in this analysis. No attendance was assumed.',
      affectedCategoryIds: [],
    },
  ];
}

function detectCateringEstimateFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const eventGuests = input.guests.filter(
    (guest) => guest.eventId === input.event.id,
  );

  if (input.guestsChanged) {
    return [];
  }

  const config = input.cateringEstimate;

  if (!config) {
    if (eventGuests.length === 0) {
      return [];
    }

    const counts = getGuestCounts(eventGuests);

    return [
      {
        id: 'finding-catering-estimate-missing',
        code: 'catering-estimate-missing',
        severity: 'info',
        certainty: 'missing-data',
        area: 'catering',
        title: 'Catering estimate is not configured',
        description: `${formatCountLabel(counts.confirmed, 'guest is', 'guests are')} confirmed, but no per-person catering assumption is saved. A catering cost estimate cannot be compared with the budget.`,
        constraints: [
          'No vendor price or market rate is invented.',
          'An estimate is a planning assumption, not a quotation.',
        ],
        recommendedAction:
          'Set a per-person catering assumption in Guests, then analyze again.',
        explanation:
          'Missing information. No catering cost was fabricated.',
        affectedCategoryIds: [],
      },
    ];
  }

  let estimate;

  try {
    estimate = calculateCateringEstimate(
      { ...input.event, expectedGuests: input.effective.expectedGuests },
      input.guests,
      config.perPersonCost,
      config.bufferPercent,
    );
  } catch {
    return [];
  }

  if (!estimate.cateringCategory) {
    return [
      {
        id: 'finding-catering-estimate-missing',
        code: 'catering-estimate-missing',
        severity: 'info',
        certainty: 'missing-data',
        area: 'catering',
        title: 'Catering estimate has no budget allocation to compare',
        description:
          'A per-person catering assumption is saved, but the budget has no catering category. The estimate cannot be compared with a planned allocation.',
        constraints: [
          'Event Rescue does not create budget categories.',
          'No budget amount was inferred from the estimate.',
        ],
        recommendedAction:
          'Add a catering category with its real planned amount in the Budget Planner, then analyze again.',
        explanation:
          'Missing information. The estimate is not treated as a confirmed cost or allocation.',
        affectedCategoryIds: [],
      },
    ];
  }

  const difference = estimate.differenceFromPlanMinor;

  if (difference === null || difference <= 0) {
    return [];
  }

  const source =
    estimate.attendeeSource === 'confirmed'
      ? `${formatCountLabel(estimate.counts.confirmed, 'confirmed guest')} with ${formatCountLabel(estimate.bufferAttendees, 'buffer guest')}`
      : `${formatCountLabel(estimate.baseAttendees, 'expected guest')} with ${formatCountLabel(estimate.bufferAttendees, 'buffer guest')}`;

  return [
    {
      id: 'finding-catering-estimate-overrun',
      code: 'catering-estimate-overrun',
      severity: 'warning',
      certainty: 'assumption',
      area: 'catering',
      title: 'Catering estimate exceeds the planned allocation',
      description: `${source} at ${formatMoney(estimate.perPersonCost)} per person gives a ${formatMoney(estimate.estimatedCost)} planning estimate. That is ${formatMoney({ amountMinor: difference, currency: 'INR' })} above the ${formatMoney(estimate.cateringCategory.planned)} planned for “${estimate.cateringCategory.name}”.`,
      constraints: [
        'The per-person amount is a saved planning assumption, not a vendor quote or current market rate.',
        'The budget is never changed automatically.',
        'Event Rescue cannot verify vendor pricing.',
      ],
      recommendedAction:
        'Review the estimate with real vendor information, then update the budget or request an explicit rescue change.',
      explanation:
        'Deterministic arithmetic from your saved per-person assumption, attendee count, and buffer. No external price or AI-generated amount was used.',
      affectedCategoryIds: [estimate.cateringCategory.id],
    },
  ];
}

function detectScheduleFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const eventActivities = input.activities.filter(
    (activity) => activity.eventId === input.event.id,
  );
  const overlaps = findActivityOverlaps(eventActivities);

  if (overlaps.length === 0) {
    return [];
  }

  const listed = overlaps.slice(0, MAX_LISTED_TASKS).map(
    (overlap) =>
      `“${overlap.firstTitle}” (${formatActivityDateTime(overlap.firstStartsAt)} to ${formatActivityDateTime(overlap.firstEndsAt)}) overlaps “${overlap.secondTitle}” (${formatActivityDateTime(overlap.secondStartsAt)} to ${formatActivityDateTime(overlap.secondEndsAt)}).`,
  );
  const remaining = overlaps.length - MAX_LISTED_TASKS;
  const suffix =
    remaining > 0 ? ` ${formatCountLabel(remaining, 'more overlap')} not listed.` : '';

  return [
    {
      id: 'finding-activity-overlap',
      code: 'activity-overlap',
      severity: 'warning',
      certainty: 'potential',
      area: 'schedule',
      title: `${formatCountLabel(overlaps.length, 'activity overlap needs', 'activity overlaps need')} review`,
      description: `${listed.join(' ')}${suffix}`,
      constraints: [
        'Simultaneous activities may be intentional.',
        'Event Rescue does not move, merge, or delete activities.',
        'Nothing is changed until you edit the timeline yourself.',
      ],
      recommendedAction:
        'Review the timeline and adjust times only if the overlap is unintended.',
      explanation:
        'Potential conflict detected from stored local start and end times. It is a review prompt, not a confirmed scheduling error.',
      affectedCategoryIds: [],
    },
  ];
}

function detectSettingFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const findings: RescueFinding[] = [];
  const setting = input.effective.setting;

  if (setting === null) {
    findings.push({
      id: 'finding-setting-missing',
      code: 'setting-missing',
      severity: 'info',
      certainty: 'missing-data',
      area: 'weather',
      title: 'Indoor or outdoor setting is not recorded',
      description:
        'Weather-contingency requirements cannot be assessed until the setting is known.',
      constraints: [
        'Event Rescue does not assume an indoor or outdoor setting.',
      ],
      recommendedAction:
        'Record the setting in this request, or leave it blank and review the risk manually.',
      explanation:
        'Missing information. No weather or venue condition was invented.',
      affectedCategoryIds: [],
    });
    return findings;
  }

  if (setting === 'indoor') {
    return findings;
  }

  if (input.effective.contingencyPlanConfirmed === true) {
    return findings;
  }

  const missing = input.effective.contingencyPlanConfirmed === null;

  findings.push({
    id: 'finding-contingency',
    code: 'outdoor-contingency-missing',
    severity: 'warning',
    certainty: missing ? 'missing-data' : 'confirmed',
    area: 'weather',
    title: missing
      ? 'Outdoor contingency plan is not recorded'
      : 'Outdoor contingency plan is not confirmed',
    description:
      setting === 'mixed'
        ? 'The event uses indoor and outdoor areas, but a wet-weather contingency is not confirmed.'
        : 'The event is set outdoors, but a wet-weather contingency is not confirmed.',
    constraints: [
      'Event Rescue cannot book a backup venue or create a vendor commitment.',
      'Confirming a plan records your answer; it does not verify the plan itself.',
    ],
    recommendedAction:
      'Confirm a wet-weather plan in this request, or switch the setting to indoor if that reflects the real plan.',
    explanation: missing
      ? 'No contingency answer is stored, so the risk cannot be confirmed either way.'
      : 'The stored answer says the contingency plan is not confirmed.',
    affectedCategoryIds: [],
  });

  return findings;
}

function detectAccessibilityFindings(
  input: RescueFindingInput,
): RescueFinding[] {
  const findings: RescueFinding[] = [];
  const required = input.effective.accessibilityRequired;

  if (required === null) {
    findings.push({
      id: 'finding-accessibility-missing',
      code: 'accessibility-missing',
      severity: 'info',
      certainty: 'missing-data',
      area: 'accessibility',
      title: 'Accessibility requirements are not recorded',
      description:
        'The workspace does not record whether guests have accessibility requirements, so this risk cannot be assessed.',
      constraints: [
        'Event Rescue cannot verify physical access, equipment, or vendor compliance.',
      ],
      recommendedAction:
        'Record whether accessibility is required and whether it is addressed.',
      explanation:
        'Missing information. No accessibility need was assumed.',
      affectedCategoryIds: [],
    });
    return findings;
  }

  if (!required || input.effective.accessibilityAddressed === true) {
    return findings;
  }

  const missing = input.effective.accessibilityAddressed === null;

  findings.push({
    id: 'finding-accessibility-unaddressed',
    code: 'accessibility-unaddressed',
    severity: 'warning',
    certainty: missing ? 'missing-data' : 'confirmed',
    area: 'accessibility',
    title: missing
      ? 'Accessibility requirements are not confirmed as addressed'
      : 'Accessibility requirements are not addressed',
    description: missing
      ? 'Accessibility is required for this event, but the workspace does not record whether the requirement is addressed.'
      : 'Accessibility is required for this event and is recorded as not addressed.',
    constraints: [
      'Event Rescue cannot verify physical access, equipment, or vendor compliance.',
      'Recording an answer does not replace a venue accessibility check.',
    ],
    recommendedAction:
      'Confirm the access arrangements with the venue and mark them addressed when verified.',
    explanation: missing
      ? 'No accessibility-address answer is stored, so the risk cannot be confirmed either way.'
      : 'The stored answer says the accessibility requirement is not addressed.',
    affectedCategoryIds: [],
  });

  return findings;
}

/**
 * Pure finding detection. It reports what is confirmed by stored data,
 * what is missing, and what is only an assumption. It never changes the event.
 */
export function detectRescueFindings(input: RescueFindingInput): RescueFinding[] {
  return [
    ...detectBudgetFindings(input),
    ...detectConfirmedAttendanceFindings(input),
    ...detectGuestAndCateringFindings(input),
    ...detectCateringEstimateFindings(input),
    ...detectTaskFindings(input),
    ...detectScheduleFindings(input),
    ...detectSettingFindings(input),
    ...detectAccessibilityFindings(input),
  ];
}

export function summarizeFindings(
  findings: readonly RescueFinding[],
): { readonly critical: number; readonly warning: number; readonly info: number } {
  return findings.reduce(
    (summary, finding) => {
      if (finding.severity === 'critical') {
        return { ...summary, critical: summary.critical + 1 };
      }

      if (finding.severity === 'warning') {
        return { ...summary, warning: summary.warning + 1 };
      }

      return { ...summary, info: summary.info + 1 };
    },
    { critical: 0, warning: 0, info: 0 },
  );
}
