import { calculateBudgetTotals } from '@/features/budget/calculations';
import { findCateringCategory } from '@/features/budget/catering';
import { calculateCateringEstimate } from '@/features/catering/cateringEstimator';
import { getGuestCounts, selectEventGuests } from '@/features/guests/guestRules';
import { selectTopOpenFindings } from '@/features/risks/riskSelectors';
import { sortTasksByDueDate } from '@/features/tasks/taskRules';
import { sortActivitiesChronologically } from '@/features/timeline/activityRules';
import { stableHash } from '@/lib/stableHash';
import type { CelebrationEvent, Workspace } from '@/types/domain';
import type { RiskFinding } from '@/types/risk';
import {
  aiEventContextSchema,
  formatSchemaIssues,
  type AiEventContext,
} from './contracts';

const MAX_CONTEXT_TASKS = 40;
const MAX_CONTEXT_ACTIVITIES = 40;
const MAX_CONTEXT_RISKS = 10;

export type BuildAiEventContextResult =
  | { readonly ok: true; readonly context: AiEventContext }
  | { readonly ok: false; readonly message: string };

function contextFailure(message: string): BuildAiEventContextResult {
  return { ok: false, message };
}

/**
 * Builds the minimum event context sent to the API server. Guest names, email
 * addresses, notes, dietary text, and accessibility text are never included;
 * only aggregate counts and the event's saved planning facts are sent.
 */
export function buildAiEventContext(
  event: CelebrationEvent,
  workspace: Workspace,
  findings: readonly RiskFinding[],
): BuildAiEventContextResult {
  let totals;

  try {
    totals = calculateBudgetTotals(event.budget);
  } catch {
    return contextFailure(
      'The selected event has budget values that could not be read safely. Review the Budget Planner before asking for AI suggestions.',
    );
  }

  const eventGuests = selectEventGuests(workspace.guests, event.id);
  const guestCounts = getGuestCounts(eventGuests);
  const dietaryRequirementCount = eventGuests.filter(
    (guest) => (guest.dietaryPreference ?? '').trim().length > 0,
  ).length;
  const accessibilityRequestCount = eventGuests.filter(
    (guest) => (guest.accessibilityRequest ?? '').trim().length > 0,
  ).length;
  const savedCatering = workspace.cateringEstimates.find(
    (estimate) => estimate.eventId === event.id,
  );
  let catering: AiEventContext['catering'] = null;

  if (savedCatering) {
    try {
      const estimate = calculateCateringEstimate(
        event,
        workspace.guests,
        savedCatering.perPersonCost,
        savedCatering.bufferPercent,
      );
      const cateringCategory = findCateringCategory(event.budget.categories);

      catering = {
        perPersonCostMinor: estimate.perPersonCost.amountMinor,
        bufferPercent: estimate.bufferPercent,
        baseAttendees: estimate.baseAttendees,
        estimatedAttendees: estimate.estimatedAttendees,
        estimatedCostMinor: estimate.estimatedCost.amountMinor,
        attendeeSource: estimate.attendeeSource,
        plannedCateringMinor: cateringCategory
          ? cateringCategory.planned.amountMinor
          : null,
      };
    } catch {
      catering = null;
    }
  }

  const eventTasks = sortTasksByDueDate(
    workspace.tasks.filter((task) => task.eventId === event.id),
  ).slice(0, MAX_CONTEXT_TASKS);
  const eventActivities = sortActivitiesChronologically(
    workspace.activities.filter((activity) => activity.eventId === event.id),
  ).slice(0, MAX_CONTEXT_ACTIVITIES);
  const openRisks = selectTopOpenFindings(
    findings.filter((finding) => finding.eventId === event.id),
    MAX_CONTEXT_RISKS,
  );

  const candidate: AiEventContext = {
    id: event.id,
    name: event.name,
    category: event.category,
    startsAt: event.startsAt,
    venue: event.venue ?? null,
    setting: event.setting ?? null,
    theme: event.theme ?? null,
    status: event.status,
    expectedGuests: event.expectedGuests,
    dietaryRequirementCount,
    accessibilityRequestCount,
    accessibilityRequired: event.accessibilityRequired ?? false,
    accessibilityAddressed: event.accessibilityAddressed ?? false,
    contingencyPlanConfirmed: event.contingencyPlanConfirmed ?? false,
    budget: {
      totalAvailableMinor: totals.totalBudget.amountMinor,
      plannedMinor: totals.planned.amountMinor,
      remainingMinor: totals.remaining.amountMinor,
      overBudget: totals.isOverBudget,
      reserveEnabled: totals.reserve.configured,
      reserveTargetMinor: totals.reserve.target.amountMinor,
      reserveAllocatedMinor: totals.reserve.allocated.amountMinor,
      reserveShortfallMinor: totals.reserve.shortfall.amountMinor,
      categories: event.budget.categories.map((category) => ({
        id: category.id,
        name: category.name,
        plannedMinor: category.planned.amountMinor,
        actualMinor: category.actual.amountMinor,
        protection: category.flexibility.mode,
        minimumMinor:
          category.flexibility.mode === 'flexible'
            ? category.flexibility.minimumPlanned.amountMinor
            : null,
      })),
    },
    guestCounts,
    catering,
    tasks: eventTasks.map((task) => ({
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
    })),
    activities: eventActivities.map((activity) => ({
      title: activity.title,
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
      priority: activity.priority,
      status: activity.status,
    })),
    openRisks: openRisks.map((finding) => ({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      certainty: finding.certainty,
      title: finding.title,
      explanation: finding.explanation,
      recommendedAction: finding.recommendedAction,
    })),
  };

  const parsed = aiEventContextSchema.safeParse(candidate);

  if (!parsed.success) {
    return contextFailure(
      `The selected event contains a value that cannot be sent safely. ${formatSchemaIssues(
        parsed.error,
      )} Review the event before trying again.`,
    );
  }

  return { ok: true, context: parsed.data };
}

/**
 * Staleness key for a generated plan. It covers exactly the context that was
 * sent to the provider, so unrelated edits (such as completing a task's
 * description) do not invalidate a suggestion, while event, budget, guest,
 * catering, task, activity, and open-risk changes do.
 */
export function createAiContextSignature(context: AiEventContext): string {
  return stableHash(JSON.stringify(context));
}

export function createAiPlanId(
  eventId: string,
  contextSignature: string,
  plan: unknown,
): string {
  return `ai-plan-${stableHash(
    JSON.stringify({ eventId, contextSignature, plan }),
  )}`;
}
