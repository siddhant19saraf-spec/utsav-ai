import {
  calculateBudgetTotals,
  type BudgetTotals,
} from '@/features/budget/calculations';
import { EMERGENCY_RESERVE_CATEGORY_ID, MAX_BUDGET_AMOUNT_MINOR } from '@/features/budget/budgetConstants';
import { validateBudget } from '@/features/budget/validation';
import { isValidIsoDate } from '@/lib/date';
import { createEventSnapshotSignature } from '@/lib/eventSnapshot';
import { MAX_EVENT_GUESTS } from '@/lib/limits';
import { formatMoney, isValidMoney } from '@/lib/money';
import type { BudgetCategory, BudgetFlexibility } from '@/types/budget';
import type { CelebrationEvent, EventSetting, Money } from '@/types/domain';
import type {
  RescueProposal,
  RescueRequest,
  RescueRequirements,
  RescueValidationIssue,
  RescueValidationResult,
} from './rescueTypes';

export const MAX_RESCUE_GUESTS = MAX_EVENT_GUESTS;
export const MAX_RESCUE_THEME_LENGTH = 80;

const eventSettings = new Set<string>(['indoor', 'outdoor', 'mixed']);

function issue(
  code: RescueValidationIssue['code'],
  message: string,
  options: { readonly severity?: 'error' | 'warning'; readonly categoryId?: string } = {},
): RescueValidationIssue {
  return {
    code,
    severity: options.severity ?? 'error',
    message,
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isInrMoney(value: unknown): value is Money {
  return isValidMoney(value) && value.currency === 'INR';
}

export function isInrTotalWithinCap(value: unknown): value is Money {
  return isInrMoney(value) && value.amountMinor <= MAX_BUDGET_AMOUNT_MINOR;
}

export function isEventSetting(value: unknown): value is EventSetting {
  return typeof value === 'string' && eventSettings.has(value);
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return typeof value === 'boolean' || value === null;
}

export function normalizeTheme(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function requirementsFromEvent(event: CelebrationEvent): RescueRequirements {
  return {
    startsAt: event.startsAt,
    expectedGuests: event.expectedGuests,
    totalAvailable: { ...event.budget.totalAvailable },
    setting: event.setting ?? null,
    theme: event.theme ?? null,
    accessibilityRequired: event.accessibilityRequired ?? null,
    accessibilityAddressed: event.accessibilityAddressed ?? null,
    contingencyPlanConfirmed: event.contingencyPlanConfirmed ?? null,
  };
}

export function requirementsEqual(
  first: RescueRequirements,
  second: RescueRequirements,
): boolean {
  return (
    first.startsAt === second.startsAt &&
    first.expectedGuests === second.expectedGuests &&
    first.totalAvailable.amountMinor === second.totalAvailable.amountMinor &&
    first.totalAvailable.currency === second.totalAvailable.currency &&
    first.setting === second.setting &&
    first.theme === second.theme &&
    first.accessibilityRequired === second.accessibilityRequired &&
    first.accessibilityAddressed === second.accessibilityAddressed &&
    first.contingencyPlanConfirmed === second.contingencyPlanConfirmed
  );
}

export function resolveRequirements(
  event: CelebrationEvent,
  request: RescueRequest,
): RescueRequirements {
  const changes = request.changes;

  return {
    startsAt: changes.startsAt ?? event.startsAt,
    expectedGuests: changes.expectedGuests ?? event.expectedGuests,
    totalAvailable: changes.totalAvailable ?? event.budget.totalAvailable,
    setting:
      typeof changes.setting === 'undefined'
        ? (event.setting ?? null)
        : changes.setting,
    theme:
      typeof changes.theme === 'undefined'
        ? (event.theme ?? null)
        : normalizeTheme(changes.theme),
    accessibilityRequired:
      typeof changes.accessibilityRequired === 'undefined'
        ? (event.accessibilityRequired ?? null)
        : changes.accessibilityRequired,
    accessibilityAddressed:
      typeof changes.accessibilityAddressed === 'undefined'
        ? (event.accessibilityAddressed ?? null)
        : changes.accessibilityAddressed,
    contingencyPlanConfirmed:
      typeof changes.contingencyPlanConfirmed === 'undefined'
        ? (event.contingencyPlanConfirmed ?? null)
        : changes.contingencyPlanConfirmed,
  };
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

export function effectiveProtectedCategoryIds(
  event: CelebrationEvent,
  request: RescueRequest,
): string[] {
  const protectedIds = new Set(
    event.budget.categories
      .filter((category) => category.flexibility.mode === 'protected')
      .map((category) => category.id),
  );

  for (const categoryId of request.protectedCategoryIds) {
    protectedIds.add(categoryId);
  }

  return [...protectedIds];
}

/**
 * Applies the request's rescue-scoped protection priorities. Existing protected
 * categories can never be demoted through Event Rescue; that remains an explicit
 * Budget Planner action.
 */
export function applyRequestedProtection(
  event: CelebrationEvent,
  request: RescueRequest,
): BudgetCategory[] {
  const protectedIds = new Set(request.protectedCategoryIds);

  return event.budget.categories.map((category) => {
    const clone = cloneCategory(category);

    if (clone.flexibility.mode === 'protected' || protectedIds.has(clone.id)) {
      return { ...clone, flexibility: { mode: 'protected' } };
    }

    const flexible = request.flexibleCategories.find(
      (entry) => entry.categoryId === clone.id,
    );

    if (flexible) {
      return {
        ...clone,
        flexibility: {
          mode: 'flexible',
          minimumPlanned: { ...flexible.minimumPlanned },
        },
      };
    }

    return clone;
  });
}

export function validateRescueRequest(
  event: CelebrationEvent,
  request: RescueRequest,
  todayIso: string,
): RescueValidationResult {
  const issues: RescueValidationIssue[] = [];
  const changes = request.changes;

  if (request.eventId !== event.id) {
    issues.push(
      issue('event-mismatch', 'The rescue request belongs to a different event.'),
    );
  }

  const current = requirementsFromEvent(event);

  if (!requirementsEqual(request.current, current)) {
    issues.push(
      issue(
        'current-snapshot-stale',
        'The event changed after these requirements were loaded. Reload the event before analyzing it again.',
      ),
    );
  }

  if (!isValidIsoDate(event.startsAt)) {
    issues.push(issue('invalid-date', 'The saved event date is not valid.'));
  }

  if (typeof changes.startsAt !== 'undefined') {
    if (!isValidIsoDate(changes.startsAt)) {
      issues.push(issue('invalid-date', 'Choose a valid event date.'));
    } else if (changes.startsAt < todayIso) {
      issues.push(issue('date-in-past', 'Choose today or a future event date.'));
    }
  }

  if (typeof changes.expectedGuests !== 'undefined') {
    if (
      !Number.isSafeInteger(changes.expectedGuests) ||
      changes.expectedGuests < 1 ||
      changes.expectedGuests > MAX_RESCUE_GUESTS
    ) {
      issues.push(
        issue(
          'invalid-guest-count',
          `Guest count must be a whole number between 1 and ${MAX_RESCUE_GUESTS.toLocaleString('en-IN')}.`,
        ),
      );
    }
  }

  const effectiveTotal = changes.totalAvailable ?? event.budget.totalAvailable;

  if (!isInrTotalWithinCap(effectiveTotal)) {
    issues.push(
      issue(
        'invalid-total',
        'The total budget must be a non-negative integer INR amount of ₹100 crore or less.',
      ),
    );
  }

  if (typeof changes.setting !== 'undefined' && changes.setting !== null) {
    if (!isEventSetting(changes.setting)) {
      issues.push(
        issue('invalid-event-fields', 'Choose a valid indoor or outdoor setting.'),
      );
    }
  }

  if (typeof changes.theme !== 'undefined') {
    if (typeof changes.theme !== 'string' && changes.theme !== null) {
      issues.push(issue('invalid-theme', 'The theme must be text or left empty.'));
    } else if (
      typeof changes.theme === 'string' &&
      changes.theme.trim().length > MAX_RESCUE_THEME_LENGTH
    ) {
      issues.push(
        issue(
          'invalid-theme',
          `Keep the theme to ${MAX_RESCUE_THEME_LENGTH} characters or fewer.`,
        ),
      );
    }
  }

  for (const field of [
    changes.accessibilityRequired,
    changes.accessibilityAddressed,
    changes.contingencyPlanConfirmed,
  ]) {
    if (typeof field !== 'undefined' && !isBooleanOrNull(field)) {
      issues.push(
        issue('invalid-event-fields', 'Recorded readiness answers must be true, false, or blank.'),
      );
      break;
    }
  }

  if (!Array.isArray(request.protectedCategoryIds)) {
    issues.push(issue('unknown-category', 'Protected priorities must be a list of categories.'));
  } else if (!Array.isArray(request.flexibleCategories)) {
    issues.push(issue('unknown-category', 'Flexible categories must be a list of categories.'));
  } else {
    const categoriesById = new Map(
      event.budget.categories.map((category) => [category.id, category]),
    );
    const protectedIds = new Set<string>();
    const flexibleIds = new Set<string>();

    for (const categoryId of request.protectedCategoryIds) {
      if (typeof categoryId !== 'string' || !categoryId) {
        issues.push(
          issue('unknown-category', 'Protected priorities must use valid category identifiers.'),
        );
        continue;
      }

      if (protectedIds.has(categoryId)) {
        issues.push(
          issue(
            'duplicate-priority',
            `“${categoryId}” is listed more than once as a protected priority.`,
            { categoryId },
          ),
        );
      }

      if (!categoriesById.has(categoryId)) {
        issues.push(
          issue('unknown-category', `Protected category “${categoryId}” does not exist.`, {
            categoryId,
          }),
        );
      }

      protectedIds.add(categoryId);
    }

    for (const entry of request.flexibleCategories) {
      if (
        !isRecord(entry) ||
        typeof entry.categoryId !== 'string' ||
        !entry.categoryId
      ) {
        issues.push(
          issue('unknown-category', 'Flexible categories must include a category and minimum.'),
        );
        continue;
      }

      if (flexibleIds.has(entry.categoryId)) {
        issues.push(
          issue(
            'duplicate-priority',
            `“${entry.categoryId}” is listed more than once as a flexible category.`,
            { categoryId: entry.categoryId },
          ),
        );
      }

      const category = categoriesById.get(entry.categoryId);

      if (!category) {
        issues.push(
          issue(
            'unknown-category',
            `Flexible category “${entry.categoryId}” does not exist.`,
            { categoryId: entry.categoryId },
          ),
        );
        flexibleIds.add(entry.categoryId);
        continue;
      }

      if (protectedIds.has(entry.categoryId)) {
        issues.push(
          issue(
            'protected-flexible-conflict',
            `“${category.name}” cannot be both a protected priority and eligible for reduction.`,
            { categoryId: category.id },
          ),
        );
      }

      if (category.flexibility.mode === 'protected') {
        issues.push(
          issue(
            'protected-flexible-conflict',
            `“${category.name}” is protected in the saved budget and cannot be reduced by Event Rescue. Change its base protection in the Budget Planner first.`,
            { categoryId: category.id },
          ),
        );
      }

      if (category.id === EMERGENCY_RESERVE_CATEGORY_ID) {
        issues.push(
          issue(
            'reserve-must-be-protected',
            'The emergency reserve must remain protected and cannot be eligible for reduction.',
            { categoryId: category.id },
          ),
        );
      }

      if (
        !isInrMoney(entry.minimumPlanned) ||
        entry.minimumPlanned.amountMinor > category.planned.amountMinor
      ) {
        issues.push(
          issue(
            'invalid-minimum',
            `The minimum for “${category.name}” must be a valid INR amount no higher than its current plan.`,
            { categoryId: category.id },
          ),
        );
      }

      flexibleIds.add(entry.categoryId);
    }
  }

  const errors = issues.filter((entry) => entry.severity === 'error');
  return { isValid: errors.length === 0, issues };
}

function flexibilityEqual(
  first: BudgetFlexibility,
  second: BudgetFlexibility,
): boolean {
  if (first.mode !== second.mode) {
    return false;
  }

  if (first.mode === 'protected' || second.mode === 'protected') {
    return true;
  }

  return first.minimumPlanned.amountMinor === second.minimumPlanned.amountMinor;
}

function totalsEqual(first: BudgetTotals, second: BudgetTotals): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function findCategory(
  proposal: RescueProposal,
  categoryId: string,
): BudgetCategory | undefined {
  return proposal.proposedEvent.budget.categories.find(
    (category) => category.id === categoryId,
  );
}

/**
 * Re-validates a proposal against the current event immediately before approval.
 * This is intentionally independent of React and never mutates the event.
 */
export function validateRescueProposal(
  proposal: RescueProposal,
  currentEvent: CelebrationEvent,
  todayIso: string,
): RescueValidationResult {
  const issues: RescueValidationIssue[] = [];
  const currentSignature = createEventSnapshotSignature(currentEvent);

  if (
    proposal.eventId !== currentEvent.id ||
    proposal.originalEvent.id !== currentEvent.id ||
    proposal.proposedEvent.id !== currentEvent.id ||
    proposal.request.eventId !== currentEvent.id
  ) {
    issues.push(
      issue('event-mismatch', 'The proposal does not belong to the selected event.'),
    );
  }

  if (
    proposal.originalEventSignature !== currentSignature ||
    createEventSnapshotSignature(proposal.originalEvent) !== currentSignature
  ) {
    issues.push(
      issue(
        'proposal-stale',
        'The event changed after this proposal was generated. Nothing was applied. Analyze again to create a fresh proposal.',
      ),
    );
  }

  const requestValidation = validateRescueRequest(
    currentEvent,
    proposal.request,
    todayIso,
  );
  issues.push(...requestValidation.issues);

  if (!requestValidation.isValid) {
    return {
      isValid: false,
      issues,
    };
  }

  const effective = resolveRequirements(currentEvent, proposal.request);
  const proposed = proposal.proposedEvent;
  const proposedBudget = proposed.budget;
  const original = currentEvent;
  const expectedProtectedIds = effectiveProtectedCategoryIds(
    currentEvent,
    proposal.request,
  );
  const expectedProtectedSet = new Set(expectedProtectedIds);
  const flexibleById = new Map(
    proposal.request.flexibleCategories.map((entry) => [
      entry.categoryId,
      entry.minimumPlanned,
    ]),
  );

  if (
    proposed.name !== original.name ||
    proposed.category !== original.category ||
    proposed.venue !== original.venue ||
    proposed.status !== original.status ||
    proposed.origin !== original.origin
  ) {
    issues.push(
      issue('invalid-proposal', 'A rescue proposal cannot change the event identity or status.'),
    );
  }

  if (
    proposedBudget.id !== original.budget.id ||
    proposedBudget.eventId !== original.id ||
    proposedBudget.createdAt !== original.budget.createdAt
  ) {
    issues.push(
      issue('invalid-proposal', 'A rescue proposal cannot replace the saved budget identity.'),
    );
  }

  if (proposed.expectedGuests !== effective.expectedGuests) {
    issues.push(
      issue(
        'guest-count-changed',
        'The proposed guest count does not match the requested requirement.',
      ),
    );
  }

  if (proposed.startsAt !== effective.startsAt) {
    issues.push(
      issue('date-changed', 'The proposed event date does not match the requested requirement.'),
    );
  }

  if (proposedBudget.totalAvailable.amountMinor !== effective.totalAvailable.amountMinor) {
    issues.push(
      issue('total-changed', 'The proposed total budget does not match the requested budget.'),
    );
  }

  if (
    (proposed.setting ?? null) !== effective.setting ||
    (proposed.theme ?? null) !== effective.theme ||
    (proposed.accessibilityRequired ?? null) !== effective.accessibilityRequired ||
    (proposed.accessibilityAddressed ?? null) !== effective.accessibilityAddressed ||
    (proposed.contingencyPlanConfirmed ?? null) !== effective.contingencyPlanConfirmed
  ) {
    issues.push(
      issue(
        'requirements-changed',
        'The proposed readiness and preference fields do not match the request.',
      ),
    );
  }

  if (
    proposedBudget.emergencyReserve.enabled !== original.budget.emergencyReserve.enabled ||
    proposedBudget.emergencyReserve.target.amountMinor !==
      original.budget.emergencyReserve.target.amountMinor
  ) {
    issues.push(
      issue('invalid-proposal', 'Event Rescue cannot change the emergency reserve configuration.'),
    );
  }

  if (proposedBudget.categories.length !== original.budget.categories.length) {
    issues.push(
      issue(
        'invalid-proposal',
        'Event Rescue cannot add or remove budget categories. Use the Budget Planner for that.',
      ),
    );
  }

  for (const originalCategory of original.budget.categories) {
    const category = findCategory(proposal, originalCategory.id);

    if (!category) {
      issues.push(
        issue(
          'invalid-proposal',
          `Category “${originalCategory.name}” is missing from the proposal.`,
          { categoryId: originalCategory.id },
        ),
      );
      continue;
    }

    if (
      category.name !== originalCategory.name ||
      category.actual.amountMinor !== originalCategory.actual.amountMinor ||
      (category.notes ?? '') !== (originalCategory.notes ?? '')
    ) {
      issues.push(
        issue(
          'invalid-proposal',
          `The proposal changes the identity or actual spend of “${originalCategory.name}”.`,
          { categoryId: originalCategory.id },
        ),
      );
    }

    const isExpectedProtected = expectedProtectedSet.has(originalCategory.id);
    const requestedMinimum = flexibleById.get(originalCategory.id);

    if (isExpectedProtected) {
      if (category.flexibility.mode !== 'protected') {
        issues.push(
          issue(
            'protected-reduction',
            `Protected category “${originalCategory.name}” must remain protected.`,
            { categoryId: originalCategory.id },
          ),
        );
      } else if (category.planned.amountMinor < originalCategory.planned.amountMinor) {
        issues.push(
          issue(
            'protected-reduction',
            `Protected category “${originalCategory.name}” cannot be reduced below its saved plan.`,
            { categoryId: originalCategory.id },
          ),
        );
      }
    } else if (typeof requestedMinimum !== 'undefined') {
      if (
        category.flexibility.mode !== 'flexible' ||
        category.flexibility.minimumPlanned.amountMinor !== requestedMinimum.amountMinor
      ) {
        issues.push(
          issue(
            'invalid-proposal',
            `The proposed minimum for “${originalCategory.name}” does not match the request.`,
            { categoryId: originalCategory.id },
          ),
        );
      }
    } else if (!flexibilityEqual(category.flexibility, originalCategory.flexibility)) {
      issues.push(
        issue(
          'invalid-proposal',
          `The proposal changes the protection of “${originalCategory.name}” without a request.`,
          { categoryId: originalCategory.id },
        ),
      );
    }

    if (category.id === EMERGENCY_RESERVE_CATEGORY_ID && category.flexibility.mode !== 'protected') {
      issues.push(
        issue(
          'reserve-must-be-protected',
          'The emergency reserve must remain protected.',
          { categoryId: category.id },
        ),
      );
    }
  }

  for (const protectedId of expectedProtectedIds) {
    if (!findCategory(proposal, protectedId)) {
      issues.push(
        issue(
          'protected-reduction',
          `Protected category “${protectedId}” is missing from the proposal.`,
          { categoryId: protectedId },
        ),
      );
    }
  }

  const budgetValidation = validateBudget(proposedBudget);

  for (const budgetIssue of [
    ...budgetValidation.errors,
    ...budgetValidation.warnings,
  ]) {
    issues.push({
      code: budgetIssue.code === 'invalid-total' ? 'invalid-total' : 'invalid-proposal',
      severity: budgetIssue.severity,
      message: budgetIssue.message,
      ...(budgetIssue.categoryId ? { categoryId: budgetIssue.categoryId } : {}),
    });
  }

  let proposedTotals: BudgetTotals | null = null;

  try {
    proposedTotals = calculateBudgetTotals(proposedBudget);
  } catch {
    issues.push(
      issue('invalid-proposal', 'The proposed budget totals could not be calculated safely.'),
    );
  }

  if (proposedTotals) {
    if (proposedTotals.isOverBudget) {
      issues.push(
        issue(
          'budget-overrun',
          `The proposed plan is over budget by ${formatMoney(proposedTotals.overrun)}.`,
        ),
      );
    }

    if (!totalsEqual(proposedTotals, proposal.proposedBudget)) {
      issues.push(
        issue('invalid-proposal', 'The proposal budget summary does not match its allocations.'),
      );
    }
  }

  try {
    if (!totalsEqual(calculateBudgetTotals(currentEvent.budget), proposal.originalBudget)) {
      issues.push(
        issue('invalid-proposal', 'The original budget summary no longer matches the saved event.'),
      );
    }
  } catch {
    issues.push(
      issue('invalid-proposal', 'The saved budget totals could not be calculated safely.'),
    );
  }

  const expectedFlexibleIds = proposal.request.flexibleCategories.map(
    (entry) => entry.categoryId,
  );

  if (
    proposal.protectedCategoryIds.length !== expectedProtectedIds.length ||
    expectedProtectedIds.some((id) => !proposal.protectedCategoryIds.includes(id))
  ) {
    issues.push(
      issue('invalid-proposal', 'The proposal protection summary does not match the request.'),
    );
  }

  if (
    proposal.flexibleCategoryIds.length !== expectedFlexibleIds.length ||
    expectedFlexibleIds.some((id) => !proposal.flexibleCategoryIds.includes(id))
  ) {
    issues.push(
      issue('invalid-proposal', 'The proposal flexibility summary does not match the request.'),
    );
  }

  const errors = issues.filter((entry) => entry.severity === 'error');
  return { isValid: errors.length === 0, issues };
}
