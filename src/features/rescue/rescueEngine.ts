import {
  calculateBudgetTotals,
  type BudgetTotals,
} from '@/features/budget/calculations';
import { proposeBudgetRepair } from '@/features/budget/repair';
import { calculateCateringEstimate } from '@/features/catering/cateringEstimator';
import { getGuestCounts } from '@/features/guests/guestRules';
import { findActivityOverlaps } from '@/features/timeline/activityRules';
import { cloneEvent, cloneEventBudget, createEventSnapshotSignature } from '@/lib/eventSnapshot';
import { formatMoney } from '@/lib/money';
import type { BudgetCategory, EventBudget } from '@/types/budget';
import type { CelebrationEvent, Money } from '@/types/domain';
import { detectRescueFindings, createInvalidRequestFinding } from './findings';
import { buildRescueChanges } from './rescueChanges';
import type {
  CateringAdjustment,
  RescueEngineInput,
  RescueFinding,
  RescueProposal,
  RescueResult,
} from './rescueTypes';
import {
  applyRequestedProtection,
  effectiveProtectedCategoryIds,
  isInrMoney,
  resolveRequirements,
  validateRescueProposal,
  validateRescueRequest,
} from './rescueValidation';

interface CateringRecalculation {
  readonly categories: readonly BudgetCategory[];
  readonly adjustments: readonly CateringAdjustment[];
  readonly usable: boolean;
  readonly overflowed: boolean;
}

function cloneCategory(category: BudgetCategory): BudgetCategory {
  return {
    ...category,
    planned: { ...category.planned },
    actual: { ...category.actual },
    flexibility:
      category.flexibility.mode === 'protected'
        ? { mode: 'protected' }
        : {
            mode: 'flexible',
            minimumPlanned: { ...category.flexibility.minimumPlanned },
          },
  };
}

function findCateringCategory(
  categories: readonly BudgetCategory[],
): BudgetCategory | null {
  const exact = categories.find(
    (category) => category.name.trim().toLowerCase() === 'catering',
  );

  return (
    exact ??
    categories.find(
      (category) =>
        category.id.toLowerCase().includes('catering') ||
        category.name.toLowerCase().includes('catering'),
    ) ??
    null
  );
}

/**
 * Scales an integer-paise amount by a guest ratio using exact BigInt division
 * with half-up rounding. Returns null rather than allowing an unsafe number.
 */
function scaleByGuestRatio(
  plannedMinor: number,
  fromGuests: number,
  toGuests: number,
): number | null {
  if (fromGuests <= 0 || toGuests <= 0 || plannedMinor < 0) {
    return null;
  }

  const numerator = BigInt(plannedMinor) * BigInt(toGuests);
  const denominator = BigInt(fromGuests);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;

  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return Number(rounded);
}

/**
 * Recalculates a catering allocation only from the saved plan's implied
 * per-guest baseline. It never invents a vendor rate, never reduces a
 * protected category, and never goes below a flexible minimum.
 */
function recalculateCatering(
  categories: readonly BudgetCategory[],
  originalGuests: number,
  effectiveGuests: number,
): CateringRecalculation {
  const catering = findCateringCategory(categories);
  const usable =
    catering !== null &&
    isInrMoney(catering.planned) &&
    catering.planned.amountMinor > 0 &&
    originalGuests > 0;

  if (!catering || originalGuests === effectiveGuests) {
    return {
      categories,
      adjustments: [],
      usable,
      overflowed: false,
    };
  }

  if (!usable) {
    return {
      categories,
      adjustments: [],
      usable: false,
      overflowed: false,
    };
  }

  const originalMinor = catering.planned.amountMinor;
  const scaledMinor = scaleByGuestRatio(originalMinor, originalGuests, effectiveGuests);

  if (scaledMinor === null) {
    return {
      categories,
      adjustments: [],
      usable,
      overflowed: true,
    };
  }

  const decreasesGuests = effectiveGuests < originalGuests;

  if (catering.flexibility.mode === 'protected' && decreasesGuests) {
    return {
      categories,
      adjustments: [
        {
          categoryId: catering.id,
          categoryName: catering.name,
          originalPlanned: { ...catering.planned },
          adjustedPlanned: { ...catering.planned },
          reason: 'protected-held',
        },
      ],
      usable,
      overflowed: false,
    };
  }

  let adjustedMinor = scaledMinor;
  let reason: CateringAdjustment['reason'] =
    scaledMinor > originalMinor ? 'increased' : 'reduced';

  if (
    catering.flexibility.mode === 'flexible' &&
    adjustedMinor < catering.flexibility.minimumPlanned.amountMinor
  ) {
    adjustedMinor = catering.flexibility.minimumPlanned.amountMinor;
    reason = 'minimum-clamped';
  }

  if (adjustedMinor === originalMinor) {
    return {
      categories,
      adjustments: [],
      usable,
      overflowed: false,
    };
  }

  const nextCategories = categories.map((category) =>
    category.id === catering.id
      ? {
          ...cloneCategory(category),
          planned: { amountMinor: adjustedMinor, currency: 'INR' as const },
        }
      : cloneCategory(category),
  );

  return {
    categories: nextCategories,
    adjustments: [
      {
        categoryId: catering.id,
        categoryName: catering.name,
        originalPlanned: { ...catering.planned },
        adjustedPlanned: { amountMinor: adjustedMinor, currency: 'INR' },
        reason,
      },
    ],
    usable,
    overflowed: false,
  };
}

function safeTotals(budget: EventBudget): BudgetTotals | null {
  try {
    return calculateBudgetTotals(budget);
  } catch {
    return null;
  }
}

function failureResult(
  event: CelebrationEvent,
  finding: RescueFinding,
  explanation: string,
  shortfall: Money = { amountMinor: 0, currency: 'INR' },
): RescueResult {
  return {
    eventId: event.id,
    feasible: false,
    findings: [finding],
    proposedChanges: [],
    proposal: null,
    shortfall,
    explanation,
  };
}

function savedDataFinding(
  title: string,
  message: string,
): RescueFinding {
  return {
    id: 'finding-invalid-saved-data',
    code: 'invalid-request',
    severity: 'critical',
    certainty: 'confirmed',
    area: 'requirements',
    title,
    description: message,
    constraints: [
      'Event Rescue refuses to calculate with unreadable financial data.',
      'Nothing was changed.',
    ],
    recommendedAction:
      'Check the saved event and budget, correct the invalid values, then analyze again.',
    explanation:
      'The stored data did not pass the safe arithmetic boundary, so no proposal was generated.',
    affectedCategoryIds: [],
  };
}

function proposedEvent(
  event: CelebrationEvent,
  proposedBudget: EventBudget,
  effective: ReturnType<typeof resolveRequirements>,
): CelebrationEvent {
  return {
    id: event.id,
    name: event.name,
    category: event.category,
    startsAt: effective.startsAt,
    ...(typeof event.venue === 'undefined' ? {} : { venue: event.venue }),
    expectedGuests: effective.expectedGuests,
    budget: proposedBudget,
    status: event.status,
    origin: event.origin,
    ...(typeof event.updatedAt === 'undefined' ? {} : { updatedAt: event.updatedAt }),
    ...(effective.setting === null ? {} : { setting: effective.setting }),
    ...(effective.theme === null ? {} : { theme: effective.theme }),
    ...(effective.accessibilityRequired === null
      ? {}
      : { accessibilityRequired: effective.accessibilityRequired }),
    ...(effective.accessibilityAddressed === null
      ? {}
      : { accessibilityAddressed: effective.accessibilityAddressed }),
    ...(effective.contingencyPlanConfirmed === null
      ? {}
      : { contingencyPlanConfirmed: effective.contingencyPlanConfirmed }),
  };
}

function buildUnresolvedIssues(
  input: RescueEngineInput,
  effective: ReturnType<typeof resolveRequirements>,
  cateringUsable: boolean,
  repairIssues: readonly string[],
  proposedTotals: BudgetTotals,
  guestsChanged: boolean,
): string[] {
  const unresolved = new Set<string>();

  for (const issue of repairIssues) {
    unresolved.add(issue);
  }

  if (proposedTotals.isOverBudget) {
    unresolved.add(
      `The proposed plan is still ${formatMoney(proposedTotals.overrun)} over the total budget.`,
    );
  }

  if (proposedTotals.actual.amountMinor > proposedTotals.totalBudget.amountMinor) {
    unresolved.add(
      `Recorded actual spend of ${formatMoney(proposedTotals.actual)} remains above the ${formatMoney(proposedTotals.totalBudget)} total.`,
    );
  }

  if (guestsChanged && !cateringUsable) {
    unresolved.add(
      'Catering could not be recalculated because no usable catering allocation exists.',
    );
  }

  const setting = effective.setting;

  if (
    (setting === 'outdoor' || setting === 'mixed') &&
    effective.contingencyPlanConfirmed !== true
  ) {
    unresolved.add(
      effective.contingencyPlanConfirmed === null
        ? 'An outdoor contingency plan is not recorded.'
        : 'An outdoor contingency plan is not confirmed.',
    );
  }

  if (
    effective.accessibilityRequired === true &&
    effective.accessibilityAddressed !== true
  ) {
    unresolved.add(
      effective.accessibilityAddressed === null
        ? 'Accessibility is required, but it is not recorded as addressed.'
        : 'Accessibility is required and is recorded as not addressed.',
    );
  }

  const openTasks = input.tasks.filter(
    (task) => task.eventId === input.event.id && task.status === 'open',
  );
  const afterEvent = openTasks.filter((task) => task.dueDate > effective.startsAt);

  if (afterEvent.length > 0) {
    unresolved.add(
      `${afterEvent.length} open ${afterEvent.length === 1 ? 'task is' : 'tasks are'} due after the event date.`,
    );
  }

  const overdue = openTasks.filter((task) => task.dueDate < input.todayIso);

  if (overdue.length > 0) {
    unresolved.add(
      `${overdue.length} ${overdue.length === 1 ? 'task is' : 'tasks are'} past due.`,
    );
  }

  const eventActivities = (input.activities ?? []).filter(
    (activity) => activity.eventId === input.event.id,
  );
  const overlaps = findActivityOverlaps(eventActivities);

  if (overlaps.length > 0) {
    unresolved.add(
      `${overlaps.length} ${overlaps.length === 1 ? 'activity overlap needs' : 'activity overlaps need'} review; overlaps may be intentional.`,
    );
  }

  const eventGuests = (input.guests ?? []).filter(
    (guest) => guest.eventId === input.event.id,
  );

  if (eventGuests.length > 0) {
    const counts = getGuestCounts(eventGuests);

    if (counts.confirmed > effective.expectedGuests) {
      unresolved.add(
        `${counts.confirmed} confirmed RSVPs exceed the ${effective.expectedGuests} expected guests used in this analysis.`,
      );
    }
  }

  if (!guestsChanged && input.cateringEstimate) {
    try {
      const estimate = calculateCateringEstimate(
        { ...input.event, expectedGuests: effective.expectedGuests },
        input.guests ?? [],
        input.cateringEstimate.perPersonCost,
        input.cateringEstimate.bufferPercent,
      );

      if (
        estimate.differenceFromPlanMinor !== null &&
        estimate.differenceFromPlanMinor > 0
      ) {
        unresolved.add(
          `The saved catering estimate is ${formatMoney({ amountMinor: estimate.differenceFromPlanMinor, currency: 'INR' })} above the planned catering allocation. This is a planning assumption, not a quote.`,
        );
      }
    } catch {
      unresolved.add('The saved catering estimate could not be evaluated safely.');
    }
  }

  return [...unresolved];
}

/**
 * Generates a rescue proposal without mutating the saved event. Finding
 * detection, constraint handling, and proposal validation are separate pure
 * steps. Approval is a separate concern handled outside this module.
 */
export function analyzeEventRescue(input: RescueEngineInput): RescueResult {
  const event = input.event;
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const requestValidation = validateRescueRequest(event, input.request, input.todayIso);

  if (!requestValidation.isValid) {
    return {
      eventId: event.id,
      feasible: false,
      findings: [createInvalidRequestFinding(requestValidation)],
      proposedChanges: [],
      proposal: null,
      shortfall: { amountMinor: 0, currency: 'INR' },
      explanation:
        'No plan was generated because the rescue request contains validation errors. Nothing was changed.',
    };
  }

  const effective = resolveRequirements(event, input.request);
  const originalTotals = safeTotals(event.budget);

  if (!originalTotals) {
    return failureResult(
      event,
      savedDataFinding(
        'The saved budget cannot be read safely',
        'The event budget contains amounts that cannot be added as non-negative integer paise.',
      ),
      'No plan was generated because the saved budget could not be calculated safely. Nothing was changed.',
    );
  }

  const protectedCategories = applyRequestedProtection(event, input.request);
  const protectedCategoryIds = effectiveProtectedCategoryIds(event, input.request);
  const guestsChanged = effective.expectedGuests !== event.expectedGuests;
  const catering = recalculateCatering(
    protectedCategories,
    event.expectedGuests,
    effective.expectedGuests,
  );

  if (catering.overflowed) {
    return failureResult(
      event,
      {
        id: 'finding-catering-overflow',
        code: 'catering-recalculation',
        severity: 'critical',
        certainty: 'confirmed',
        area: 'catering',
        title: 'Catering cannot be recalculated safely',
        description:
          'The proportional catering adjustment for this guest change exceeds the supported financial range.',
        constraints: [
          'Amounts are never coerced into floating-point numbers or silently capped.',
          'No plan is generated when safe integer arithmetic cannot be guaranteed.',
        ],
        recommendedAction:
          'Use a smaller guest change or update the catering plan directly in the Budget Planner.',
        explanation:
          'No estimate was fabricated. Nothing was changed.',
        affectedCategoryIds: [],
      },
      'No plan was generated because the catering recalculation exceeded the safe range. Nothing was changed.',
      originalTotals.overrun,
    );
  }

  const preRepairBudget: EventBudget = {
    ...cloneEventBudget(event.budget),
    totalAvailable: { ...effective.totalAvailable },
    categories: catering.categories.map(cloneCategory),
  };
  const preRepairTotals = safeTotals(preRepairBudget);

  if (!preRepairTotals) {
    return failureResult(
      event,
      savedDataFinding(
        'The requested plan cannot be calculated safely',
        'The requested requirements produced amounts that cannot be added as non-negative integer paise.',
      ),
      'No plan was generated because the requested plan could not be calculated safely. Nothing was changed.',
      originalTotals.overrun,
    );
  }

  const repair = proposeBudgetRepair({
    totalBudget: effective.totalAvailable,
    categories: preRepairBudget.categories,
  });

  const proposedBudget: EventBudget = {
    ...cloneEventBudget(event.budget),
    totalAvailable: { ...effective.totalAvailable },
    categories: repair.categories.map(cloneCategory),
    updatedAt: timestamp,
  };
  const candidateEvent = proposedEvent(event, proposedBudget, effective);
  const proposedTotals = safeTotals(proposedBudget);

  if (!proposedTotals) {
    return failureResult(
      event,
      savedDataFinding(
        'The proposed plan cannot be calculated safely',
        'The proposed allocations produced a total that cannot be represented safely.',
      ),
      'No plan was generated because the proposed plan could not be calculated safely. Nothing was changed.',
      originalTotals.overrun,
    );
  }

  const findings = detectRescueFindings({
    event,
    tasks: input.tasks,
    activities: input.activities ?? [],
    guests: input.guests ?? [],
    cateringEstimate: input.cateringEstimate ?? null,
    effective,
    originalTotals,
    preRepairTotals,
    protectedCategoryIds,
    guestsChanged,
    cateringUsable: catering.usable,
    cateringAdjustments: catering.adjustments,
    repairFeasible: repair.feasible,
    repairShortfall: repair.shortfall,
    repairIssues: repair.unresolvedIssues,
    repairReductionCount: repair.reductions.length,
    todayIso: input.todayIso,
  });

  const unresolvedIssues = buildUnresolvedIssues(
    input,
    effective,
    catering.usable,
    repair.unresolvedIssues,
    proposedTotals,
    guestsChanged,
  );
  const changes = buildRescueChanges(event, candidateEvent);
  const baseProposal: RescueProposal = {
    id: `rescue-${event.id}-${now.getTime()}`,
    eventId: event.id,
    request: input.request,
    originalEvent: cloneEvent(event),
    originalEventSignature: createEventSnapshotSignature(event),
    proposedEvent: candidateEvent,
    changes,
    originalBudget: originalTotals,
    proposedBudget: proposedTotals,
    protectedCategoryIds,
    flexibleCategoryIds: input.request.flexibleCategories.map(
      (entry) => entry.categoryId,
    ),
    unresolvedIssues,
    validation: { isValid: true, issues: [] },
    createdAt: timestamp,
  };
  const validation = validateRescueProposal(baseProposal, event, input.todayIso);
  const proposal: RescueProposal = { ...baseProposal, validation };
  const feasible =
    repair.feasible &&
    validation.isValid &&
    !proposedTotals.isOverBudget;
  const shortfall = proposedTotals.isOverBudget
    ? proposedTotals.overrun
    : { amountMinor: 0, currency: 'INR' as const };

  const explanation = feasible
    ? changes.length === 0
      ? `No changes are proposed. Planned expenditure of ${formatMoney(proposedTotals.planned)} fits the ${formatMoney(proposedTotals.totalBudget)} total, and the evaluated constraints pass.${unresolvedIssues.length > 0 ? ` ${unresolvedIssues.length} reported ${unresolvedIssues.length === 1 ? 'risk remains' : 'risks remain'}.` : ''}`
      : `A proposal with ${changes.length} ${changes.length === 1 ? 'change' : 'changes'} passed validation. Planned expenditure moves from ${formatMoney(originalTotals.planned)} to ${formatMoney(proposedTotals.planned)} within the ${formatMoney(proposedTotals.totalBudget)} total. Nothing has been applied.${unresolvedIssues.length > 0 ? ` ${unresolvedIssues.length} reported ${unresolvedIssues.length === 1 ? 'risk remains' : 'risks remain'}.` : ''} Feasibility is not a claim of optimality.`
    : `No feasible plan passed validation. ${repair.unresolvedIssues.join(' ') || 'The proposed plan is invalid or over budget.'} Nothing was changed.`;

  return {
    eventId: event.id,
    feasible,
    findings,
    proposedChanges: proposal.changes,
    proposal,
    shortfall,
    explanation,
  };
}
