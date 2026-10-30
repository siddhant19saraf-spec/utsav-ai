import { findActivityOverlaps, validateActivityDraft } from '@/features/timeline/activityRules';
import { validateTaskDraft } from '@/features/tasks/taskRules';
import { formatMoney } from '@/lib/money';
import type {
  CelebrationEvent,
  TimelineActivity,
  Workspace,
} from '@/types/domain';
import type {
  AiPlan,
  AiPlanRequest,
  AiCateringSuggestion,
  AiTimelineSuggestion,
} from './contracts';

export type AiValidationArea = 'timeline' | 'tasks' | 'budget' | 'catering' | 'risks' | 'plan';
export type AiIssueSeverity = 'error' | 'warning' | 'info';

export type AiPlanIssueCode =
  | 'timeline-invalid'
  | 'timeline-overlap'
  | 'timeline-duplicate'
  | 'task-invalid'
  | 'task-past-due'
  | 'task-duplicate'
  | 'budget-invalid'
  | 'budget-overflow'
  | 'budget-over-total'
  | 'budget-protected'
  | 'budget-minimum'
  | 'budget-duplicate'
  | 'catering-overflow'
  | 'catering-over-budget'
  | 'catering-headcount-differs'
  | 'catering-cost-differs'
  | 'risk-unknown'
  | 'risk-number-mismatch'
  | 'risk-missing'
  | 'no-actionable-suggestions';

export interface AiPlanIssue {
  readonly id: string;
  readonly area: AiValidationArea;
  readonly severity: AiIssueSeverity;
  readonly code: AiPlanIssueCode;
  readonly message: string;
  readonly timelineIndex: number | null;
  readonly taskIndex: number | null;
  readonly budgetIndex: number | null;
}

export interface AiCateringCheck {
  readonly baseAttendees: number;
  readonly bufferAttendees: number;
  readonly totalAttendees: number;
  readonly perPersonCostMinor: number | null;
  readonly totalCostMinor: number | null;
  readonly overBudget: boolean;
  readonly headcountDifference: number | null;
}

export interface AiBudgetCheck {
  readonly suggestedTotalMinor: number | null;
  readonly eventTotalMinor: number | null;
  readonly differenceMinor: number | null;
  readonly overBudget: boolean;
  readonly advisory: true;
}

export interface AiPlanValidation {
  readonly issues: readonly AiPlanIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly timelineIssues: Readonly<Record<number, readonly AiPlanIssue[]>>;
  readonly taskIssues: Readonly<Record<number, readonly AiPlanIssue[]>>;
  readonly applyableTimelineIndexes: readonly number[];
  readonly applyableTaskIndexes: readonly number[];
  readonly budget: AiBudgetCheck;
  readonly catering: AiCateringCheck | null;
}

function inr(amountMinor: number): string {
  return formatMoney({ amountMinor, currency: 'INR' });
}

function sumSafe(values: readonly number[]): number | null {
  let total = 0n;

  for (const value of values) {
    total += BigInt(value);

    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }
  }

  return Number(total);
}

function multiplySafe(first: number, second: number): number | null {
  const product = BigInt(first) * BigInt(second);

  return product > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(product);
}

function cateringBuffer(baseAttendees: number, bufferPercent: number): number | null {
  const scaled = BigInt(baseAttendees) * BigInt(bufferPercent);
  const rounded = (scaled + 99n) / 100n;

  return rounded > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(rounded);
}

function suggestionId(index: number): string {
  return `ai-timeline-${index}`;
}

function timelineActivity(
  activity: AiTimelineSuggestion,
  eventId: string,
  index: number,
): TimelineActivity {
  return {
    id: suggestionId(index),
    eventId,
    title: activity.title,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
    priority: activity.priority,
    status: 'scheduled',
    createdAt: '',
    updatedAt: '',
    ...(activity.description ? { description: activity.description } : {}),
    ...(activity.location ? { location: activity.location } : {}),
  };
}

function isApplyBlocking(issue: AiPlanIssue): boolean {
  return (
    issue.severity === 'error' ||
    issue.code === 'timeline-duplicate' ||
    issue.code === 'task-duplicate'
  );
}

function defaultIndexes(
  count: number,
  issuesByIndex: Readonly<Record<number, readonly AiPlanIssue[]>>,
): number[] {
  return Array.from({ length: count }, (_, index) => index).filter(
    (index) => !(issuesByIndex[index] ?? []).some(isApplyBlocking),
  );
}

export function calculateCateringCheck(
  suggestion: AiCateringSuggestion,
  event: CelebrationEvent | null,
  saved: AiPlanRequest['event'],
): AiCateringCheck {
  const bufferAttendees =
    cateringBuffer(suggestion.recommendedAttendeeCount, suggestion.bufferPercent) ?? 0;
  const totalAttendees = suggestion.recommendedAttendeeCount + bufferAttendees;
  const totalCostMinor = suggestion.perPersonCostMinor === null
    ? null
    : multiplySafe(suggestion.perPersonCostMinor, totalAttendees);
  const eventTotal = event ? event.budget.totalAvailable.amountMinor : null;
  const savedBase = saved?.catering?.baseAttendees ?? null;

  return {
    baseAttendees: suggestion.recommendedAttendeeCount,
    bufferAttendees,
    totalAttendees,
    perPersonCostMinor: suggestion.perPersonCostMinor,
    totalCostMinor,
    overBudget:
      totalCostMinor !== null && eventTotal !== null && totalCostMinor > eventTotal,
    headcountDifference:
      savedBase === null ? null : suggestion.recommendedAttendeeCount - savedBase,
  };
}

type AddIssue = (
  area: AiValidationArea,
  severity: AiIssueSeverity,
  code: AiPlanIssueCode,
  message: string,
  indexes?: {
    readonly timeline?: number;
    readonly task?: number;
    readonly budget?: number;
  },
) => void;

interface IssueCollector {
  readonly issues: AiPlanIssue[];
  readonly timelineIssues: Record<number, AiPlanIssue[]>;
  readonly taskIssues: Record<number, AiPlanIssue[]>;
  readonly addIssue: AddIssue;
}

function createIssueCollector(): IssueCollector {
  const issues: AiPlanIssue[] = [];
  const timelineIssues: Record<number, AiPlanIssue[]> = {};
  const taskIssues: Record<number, AiPlanIssue[]> = {};

  function addIssue(
    area: AiValidationArea,
    severity: AiIssueSeverity,
    code: AiPlanIssueCode,
    message: string,
    indexes: {
      readonly timeline?: number;
      readonly task?: number;
      readonly budget?: number;
    } = {},
  ) {
    const timelineIndex = indexes.timeline ?? null;
    const taskIndex = indexes.task ?? null;
    const budgetIndex = indexes.budget ?? null;
    const suffix = timelineIndex ?? taskIndex ?? budgetIndex ?? issues.length;
    const issue: AiPlanIssue = {
      id: `${area}:${code}:${suffix}`,
      area,
      severity,
      code,
      message,
      timelineIndex,
      taskIndex,
      budgetIndex,
    };

    issues.push(issue);

    if (timelineIndex !== null) {
      (timelineIssues[timelineIndex] ??= []).push(issue);
    }

    if (taskIndex !== null) {
      (taskIssues[taskIndex] ??= []).push(issue);
    }
  }

  return { issues, timelineIssues, taskIssues, addIssue };
}

interface TimelineValidationArgs {
  readonly plan: AiPlan;
  readonly event: CelebrationEvent | null;
  readonly workspace: Workspace;
  readonly addIssue: AddIssue;
}

function validateTimelineSection({
  plan,
  event,
  workspace,
  addIssue,
}: TimelineValidationArgs): void {
  const existingActivities = event
    ? workspace.activities.filter((activity) => activity.eventId === event.id)
    : [];
  // Completed activities cannot conflict with new scheduling, but re-adding
  // one under the same title and start is still a duplicate.
  const scheduledActivities = existingActivities.filter(
    (activity) => activity.status === 'scheduled',
  );
  const validSuggestions: TimelineActivity[] = [];
  const suggestionKeys = new Map<string, number[]>();

  plan.timeline.forEach((suggestion, index) => {
    const validation = validateActivityDraft({
      title: suggestion.title,
      description: suggestion.description ?? '',
      startsAt: suggestion.startsAt,
      endsAt: suggestion.endsAt,
      priority: suggestion.priority,
      status: 'scheduled',
      location: suggestion.location ?? '',
    });
    const messages = Object.values(validation).filter(
      (message): message is string => Boolean(message),
    );

    if (messages.length > 0) {
      addIssue(
        'timeline',
        'error',
        'timeline-invalid',
        `Suggestion ${index + 1} is not a valid activity: ${messages.join(' ')}`,
        { timeline: index },
      );
      return;
    }

    const key = `${suggestion.title.trim().toLowerCase()}|${suggestion.startsAt}`;
    suggestionKeys.set(key, [...(suggestionKeys.get(key) ?? []), index]);
    validSuggestions.push(
      timelineActivity(suggestion, event?.id ?? 'unassigned', index),
    );
  });

  for (const [key, indexes] of suggestionKeys) {
    if (indexes.length < 2) {
      continue;
    }

    const title = key.split('|')[0] ?? 'activity';

    for (const index of indexes) {
      addIssue(
        'timeline',
        'warning',
        'timeline-duplicate',
        `Suggestion ${index + 1} repeats “${title}” at the same start time. Keep one before adding these activities.`,
        { timeline: index },
      );
    }
  }

  if (event) {
    const existingKeys = new Set(
      existingActivities.map(
        (activity) =>
          `${activity.title.trim().toLowerCase()}|${activity.startsAt}`,
      ),
    );

    plan.timeline.forEach((suggestion, index) => {
      if (
        existingKeys.has(
          `${suggestion.title.trim().toLowerCase()}|${suggestion.startsAt}`,
        )
      ) {
        addIssue(
          'timeline',
          'warning',
          'timeline-duplicate',
          `Suggestion ${index + 1} matches an activity already on the saved timeline.`,
          { timeline: index },
        );
      }
    });
  }

  if (validSuggestions.length > 0) {
    const overlaps = findActivityOverlaps([
      ...scheduledActivities,
      ...validSuggestions,
    ]);

    for (const overlap of overlaps) {
      const aiIndexes = [overlap.firstId, overlap.secondId]
        .map((id) => validSuggestions.find((entry) => entry.id === id))
        .filter((entry): entry is TimelineActivity => Boolean(entry));

      if (aiIndexes.length === 0) {
        continue;
      }

      for (const activity of aiIndexes) {
        const index = Number(activity.id.replace('ai-timeline-', ''));
        const otherTitle =
          activity.id === overlap.firstId
            ? overlap.secondTitle
            : overlap.firstTitle;

        addIssue(
          'timeline',
          'warning',
          'timeline-overlap',
          `Suggestion ${index + 1} overlaps “${otherTitle}”. Overlaps are review prompts and are never adjusted automatically.`,
          { timeline: index },
        );
      }
    }
  }
}

interface TaskValidationArgs {
  readonly plan: AiPlan;
  readonly event: CelebrationEvent | null;
  readonly workspace: Workspace;
  readonly todayIso: string;
  readonly addIssue: AddIssue;
}

function validateTaskSection({
  plan,
  event,
  workspace,
  todayIso,
  addIssue,
}: TaskValidationArgs): void {
  const existingTasks = event
    ? workspace.tasks.filter((task) => task.eventId === event.id)
    : [];
  const existingTitles = new Set(
    existingTasks.map((task) => task.title.trim().toLowerCase()),
  );
  const suggestionTitles = new Map<string, number[]>();

  plan.tasks.forEach((suggestion, index) => {
    const validation = validateTaskDraft({
      title: suggestion.title,
      description: suggestion.description ?? '',
      dueDate: suggestion.dueDate,
      priority: suggestion.priority,
      assignee: '',
    });
    const messages = Object.values(validation).filter(
      (message): message is string => Boolean(message),
    );
    const key = suggestion.title.trim().toLowerCase();

    if (messages.length > 0) {
      addIssue(
        'tasks',
        'error',
        'task-invalid',
        `Task ${index + 1} is not valid: ${messages.join(' ')}`,
        { task: index },
      );
      return;
    }

    suggestionTitles.set(key, [...(suggestionTitles.get(key) ?? []), index]);

    if (suggestion.dueDate < todayIso) {
      addIssue(
        'tasks',
        'warning',
        'task-past-due',
        `Task ${index + 1} is due on ${suggestion.dueDate}, which is already in the past.`,
        { task: index },
      );
    }

    if (existingTitles.has(key)) {
      addIssue(
        'tasks',
        'warning',
        'task-duplicate',
        `Task ${index + 1} has the same title as an existing task. Adjust or skip it before adding.`,
        { task: index },
      );
    }
  });

  for (const [key, indexes] of suggestionTitles) {
    if (indexes.length < 2) {
      continue;
    }

    for (const index of indexes) {
      addIssue(
        'tasks',
        'warning',
        'task-duplicate',
        `Task ${index + 1} repeats “${key}” within this proposal. Keep one before adding.`,
        { task: index },
      );
    }
  }
}

interface BudgetValidationArgs {
  readonly plan: AiPlan;
  readonly event: CelebrationEvent | null;
  readonly addIssue: AddIssue;
}

interface BudgetValidationResult {
  readonly suggestedTotalMinor: number | null;
  readonly budgetDifferenceMinor: number | null;
}

function validateBudgetSection({
  plan,
  event,
  addIssue,
}: BudgetValidationArgs): BudgetValidationResult {
  const budgetValues = plan.budgetCategories.map(
    (category) => category.plannedMinor,
  );
  const suggestedTotalMinor = sumSafe(budgetValues);
  let budgetDifferenceMinor: number | null = null;

  if (suggestedTotalMinor === null) {
    addIssue(
      'budget',
      'error',
      'budget-overflow',
      'The suggested budget allocations exceed the supported amount range. They cannot be evaluated.',
    );
  } else if (event) {
    const eventTotal = event.budget.totalAvailable.amountMinor;
    budgetDifferenceMinor = suggestedTotalMinor - eventTotal;

    if (eventTotal === 0 && suggestedTotalMinor > 0) {
      addIssue(
        'budget',
        'error',
        'budget-over-total',
        'The saved event has no total budget, so the suggested allocation cannot be validated. Set a total in the Budget Planner first.',
      );
    } else if (suggestedTotalMinor > eventTotal) {
      addIssue(
        'budget',
        'error',
        'budget-over-total',
        `The suggested allocations total ${inr(
          suggestedTotalMinor,
        )}, which is ${inr(
          suggestedTotalMinor - eventTotal,
        )} more than the saved total budget of ${inr(eventTotal)}. The app did not adjust any amount.`,
      );
    }
  }

  const categoriesByName = new Map(
    (event?.budget.categories ?? []).map((category) => [
      category.name.trim().toLowerCase(),
      category,
    ]),
  );
  const suggestedNames = new Map<string, number[]>();

  plan.budgetCategories.forEach((suggestion, index) => {
    const key = suggestion.name.trim().toLowerCase();
    suggestedNames.set(key, [...(suggestedNames.get(key) ?? []), index]);
    const saved = categoriesByName.get(key);

    if (!saved) {
      return;
    }

    if (
      saved.flexibility.mode === 'protected' &&
      suggestion.plannedMinor < saved.planned.amountMinor
    ) {
      addIssue(
        'budget',
        'error',
        'budget-protected',
        `“${saved.name}” is protected at ${inr(
          saved.planned.amountMinor,
        )}. The suggestion would reduce it to ${inr(
          suggestion.plannedMinor,
        )}; protected allocations cannot be reduced.`,
      );
    }

    if (
      saved.flexibility.mode === 'flexible' &&
      suggestion.plannedMinor <
        saved.flexibility.minimumPlanned.amountMinor
    ) {
      addIssue(
        'budget',
        'error',
        'budget-minimum',
        `“${saved.name}” has a saved minimum of ${inr(
          saved.flexibility.minimumPlanned.amountMinor,
        )}. The suggestion is below that minimum.`,
      );
    }
  });

  for (const [key, indexes] of suggestedNames) {
    if (indexes.length < 2) {
      continue;
    }

    addIssue(
      'budget',
      'warning',
      'budget-duplicate',
      `The proposal repeats “${key}” across ${indexes.length} budget categories.`,
    );
  }

  return { suggestedTotalMinor, budgetDifferenceMinor };
}

interface CateringValidationArgs {
  readonly plan: AiPlan;
  readonly request: AiPlanRequest;
  readonly event: CelebrationEvent | null;
  readonly addIssue: AddIssue;
}

function validateCateringSection({
  plan,
  request,
  event,
  addIssue,
}: CateringValidationArgs): AiCateringCheck | null {
  if (!plan.catering) {
    return null;
  }

  const cateringCheck = calculateCateringCheck(
    plan.catering,
    event,
    request.event,
  );

  if (
    plan.catering.perPersonCostMinor !== null &&
    cateringCheck.totalCostMinor === null
  ) {
    addIssue(
      'catering',
      'error',
      'catering-overflow',
      'The suggested catering cost exceeds the supported amount range and cannot be evaluated.',
    );
  }

  if (cateringCheck.overBudget) {
    addIssue(
      'catering',
      'warning',
      'catering-over-budget',
      `At the suggested per-person assumption, the app calculates ${inr(
        cateringCheck.totalCostMinor ?? 0,
      )} for ${cateringCheck.totalAttendees} attendees — more than the event's total budget. This is an app calculation using your suggested inputs, not a vendor quote.`,
    );
  }

  if (
    cateringCheck.headcountDifference !== null &&
    cateringCheck.headcountDifference !== 0
  ) {
    addIssue(
      'catering',
      'warning',
      'catering-headcount-differs',
      `The suggested base headcount differs from the saved estimate by ${
        cateringCheck.headcountDifference > 0 ? '+' : ''
      }${cateringCheck.headcountDifference}. Confirm which guest count should be used.`,
    );
  }

  const savedPerPerson = request.event?.catering?.perPersonCostMinor ?? null;

  if (
    savedPerPerson !== null &&
    plan.catering.perPersonCostMinor !== null &&
    savedPerPerson !== plan.catering.perPersonCostMinor
  ) {
    addIssue(
      'catering',
      'warning',
      'catering-cost-differs',
      'The suggested per-person assumption differs from the saved assumption. The app did not replace either value.',
    );
  }

  return cateringCheck;
}

interface RiskValidationArgs {
  readonly plan: AiPlan;
  readonly request: AiPlanRequest;
  readonly workspace: Workspace;
  readonly event: CelebrationEvent | null;
  readonly addIssue: AddIssue;
}

function validateRiskSection({
  plan,
  request,
  workspace,
  event,
  addIssue,
}: RiskValidationArgs): void {
  const openFindings = event
    ? (workspace.riskFindings ?? []).filter(
        (finding) =>
          finding.eventId === event.id && finding.status === 'open',
      )
    : [];
  const openIds = new Set(openFindings.map((finding) => finding.id));
  const generationIds = new Set(
    request.event?.openRisks.map((finding) => finding.id) ?? [],
  );

  if (plan.riskSummary) {
    for (const item of plan.riskSummary.items) {
      if (openIds.has(item.findingId)) {
        continue;
      }

      addIssue(
        'risks',
        'warning',
        'risk-unknown',
        generationIds.has(item.findingId)
          ? 'The plan summarizes a risk that is no longer open. It may have been resolved or dismissed since the plan was generated.'
          : 'The plan summarizes a risk that is not present in the saved open findings. Ignore that summary; the app did not create a finding.',
      );
    }
  }

  if (
    request.mode === 'summarize-risks' &&
    openFindings.length > 0 &&
    (plan.riskSummary?.items.length ?? 0) === 0
  ) {
    addIssue(
      'risks',
      'warning',
      'risk-missing',
      'Open deterministic risk findings exist, but the response did not summarize any of them. Generate again or review Risk Intelligence directly.',
    );
  }

  if (
    plan.riskSummary !== null &&
    plan.riskSummary.items.length > openFindings.length
  ) {
    addIssue(
      'risks',
      'warning',
      'risk-number-mismatch',
      'The response summarizes more risks than are currently open for this event. Only saved findings are authoritative.',
    );
  }
}

interface PlanValidationArgs {
  readonly plan: AiPlan;
  readonly request: AiPlanRequest;
  readonly event: CelebrationEvent | null;
  readonly addIssue: AddIssue;
}

function validatePlanLevel({
  plan,
  request,
  event,
  addIssue,
}: PlanValidationArgs): void {
  if (!event && request.event) {
    addIssue(
      'plan',
      'error',
      'no-actionable-suggestions',
      'The selected event no longer exists in this workspace. Generate a new plan after choosing a saved event.',
    );
  }

  const planWantsAction =
    request.mode === 'create-plan' || request.mode === 'revise-plan';
  const actionableCount =
    plan.timeline.length +
    plan.tasks.length +
    plan.budgetCategories.length +
    (plan.catering ? 1 : 0);

  if (planWantsAction && actionableCount === 0) {
    addIssue(
      'plan',
      'warning',
      'no-actionable-suggestions',
      'This plan contains no timeline, task, budget, or catering suggestions. Ask for a specific plan if you expected actionable steps.',
    );
  }
}

/**
 * Deterministic client-side checks for an AI proposal. It reuses the existing
 * budget, task, activity, and overlap rules; it never treats AI text as a
 * calculation. Issues in budget, catering, and risks are informational or
 * blocking for display only, while selected timeline and task additions are
 * revalidated again at approval time.
 */
export function validateAiPlan(
  plan: AiPlan,
  request: AiPlanRequest,
  workspace: Workspace,
  todayIso: string,
): AiPlanValidation {
  const { issues, timelineIssues, taskIssues, addIssue } =
    createIssueCollector();
  const event = request.event
    ? workspace.events.find((entry) => entry.id === request.event?.id) ?? null
    : null;

  validatePlanLevel({ plan, request, event, addIssue });
  validateTimelineSection({ plan, event, workspace, addIssue });
  validateTaskSection({ plan, event, workspace, todayIso, addIssue });
  const { suggestedTotalMinor, budgetDifferenceMinor } = validateBudgetSection({
    plan,
    event,
    addIssue,
  });
  const cateringCheck = validateCateringSection({
    plan,
    request,
    event,
    addIssue,
  });
  validateRiskSection({ plan, request, workspace, event, addIssue });

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    timelineIssues,
    taskIssues,
    applyableTimelineIndexes: defaultIndexes(
      plan.timeline.length,
      timelineIssues,
    ),
    applyableTaskIndexes: defaultIndexes(plan.tasks.length, taskIssues),
    budget: {
      suggestedTotalMinor,
      eventTotalMinor: event ? event.budget.totalAvailable.amountMinor : null,
      differenceMinor: event ? budgetDifferenceMinor : null,
      overBudget:
        event !== null &&
        suggestedTotalMinor !== null &&
        suggestedTotalMinor > event.budget.totalAvailable.amountMinor,
      advisory: true,
    },
    catering: cateringCheck,
  };
}

export function selectionHasBlockingIssues(
  validation: AiPlanValidation,
  timelineIndexes: readonly number[],
  taskIndexes: readonly number[],
): boolean {
  return (
    timelineIndexes.some((index) =>
      (validation.timelineIssues[index] ?? []).some(isApplyBlocking),
    ) ||
    taskIndexes.some((index) =>
      (validation.taskIssues[index] ?? []).some(isApplyBlocking),
    )
  );
}
