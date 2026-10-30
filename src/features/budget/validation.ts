import { formatMoney, isValidMoney } from '@/lib/money';
import type { BudgetCategory, EventBudget } from '@/types/budget';
import type { Money } from '@/types/domain';
import {
  BUDGET_CATEGORY_ID_PATTERN,
  BUDGET_CATEGORY_NAME_MAX_LENGTH,
  BUDGET_CATEGORY_NOTES_MAX_LENGTH,
  EMERGENCY_RESERVE_CATEGORY_ID,
} from './budgetConstants';

export type BudgetIssueSeverity = 'error' | 'warning';

export type BudgetIssueCode =
  | 'invalid-total'
  | 'invalid-timestamp'
  | 'empty-category-id'
  | 'invalid-category-id'
  | 'duplicate-category-id'
  | 'empty-category-name'
  | 'category-name-too-long'
  | 'invalid-planned-amount'
  | 'invalid-actual-amount'
  | 'invalid-minimum-allocation'
  | 'minimum-exceeds-planned'
  | 'invalid-protection'
  | 'notes-too-long'
  | 'allocation-exceeds-budget'
  | 'protected-allocation-exceeds-budget'
  | 'actual-exceeds-planned'
  | 'actual-exceeds-budget'
  | 'reserve-target-invalid'
  | 'reserve-category-missing'
  | 'reserve-insufficient'
  | 'reserve-category-not-protected'
  | 'disabled-reserve-with-allocation';

export interface BudgetValidationIssue {
  readonly code: BudgetIssueCode;
  readonly severity: BudgetIssueSeverity;
  readonly message: string;
  readonly categoryId?: string;
}

export interface BudgetValidationResult {
  readonly errors: readonly BudgetValidationIssue[];
  readonly warnings: readonly BudgetValidationIssue[];
  readonly isValid: boolean;
}

interface IssueOptions {
  readonly severity?: BudgetIssueSeverity;
  readonly categoryId?: string;
}

function issue(
  code: BudgetIssueCode,
  message: string,
  options: IssueOptions = {},
): BudgetValidationIssue {
  return {
    code,
    severity: options.severity ?? 'error',
    message,
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
  };
}

function inr(amountMinor: number): Money {
  return { amountMinor, currency: 'INR' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads a value that may have crossed an untrusted boundary. Unlike a type
 * assertion, this keeps `unknown` honest: a non-object reads as an empty
 * record, so field checks below see `undefined` instead of throwing.
 */
function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isInrMoney(value: unknown): value is Money {
  return isValidMoney(value) && value.currency === 'INR';
}

const categoryIdPattern = BUDGET_CATEGORY_ID_PATTERN;

function inspectCategory(
  category: BudgetCategory,
  index: number,
): BudgetValidationIssue[] {
  const issues: BudgetValidationIssue[] = [];
  const candidate = asRecord(category);
  const id = typeof candidate.id === 'string' ? candidate.id : '';
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const idOption = id ? { categoryId: id } : {};

  if (!id) {
    issues.push(
      issue('empty-category-id', `Category ${index + 1} is missing an identifier.`),
    );
  } else if (!categoryIdPattern.test(id)) {
    issues.push(
      issue(
        'invalid-category-id',
        `Category identifier “${id}” must start with a lowercase letter and contain only lowercase letters, numbers, or hyphens.`,
        idOption,
      ),
    );
  }

  if (!name.trim()) {
    issues.push(
      issue('empty-category-name', `Category ${index + 1} needs a name.`, idOption),
    );
  } else if (name.length > BUDGET_CATEGORY_NAME_MAX_LENGTH) {
    issues.push(
      issue(
        'category-name-too-long',
        `“${name.slice(0, 32)}…” is longer than ${BUDGET_CATEGORY_NAME_MAX_LENGTH} characters.`,
        idOption,
      ),
    );
  }

  if (!isInrMoney(candidate.planned)) {
    issues.push(
      issue(
        'invalid-planned-amount',
        `Category “${name || id || index + 1}” must have a non-negative integer planned amount in INR paise.`,
        idOption,
      ),
    );
  }

  if (!isInrMoney(candidate.actual)) {
    issues.push(
      issue(
        'invalid-actual-amount',
        `Category “${name || id || index + 1}” must have a non-negative integer actual amount in INR paise.`,
        idOption,
      ),
    );
  }

  const flexibility = candidate.flexibility;

  if (!isRecord(flexibility) || (flexibility.mode !== 'protected' && flexibility.mode !== 'flexible')) {
    issues.push(
      issue(
        'invalid-protection',
        `Category “${name || id || index + 1}” must be exactly protected or flexible.`,
        idOption,
      ),
    );
  } else if (flexibility.mode === 'flexible') {
    if (!isInrMoney(flexibility.minimumPlanned)) {
      issues.push(
        issue(
          'invalid-minimum-allocation',
          `Flexible category “${name || id}” needs a non-negative integer minimum allocation.`,
          idOption,
        ),
      );
    } else if (
      isInrMoney(candidate.planned) &&
      flexibility.minimumPlanned.amountMinor > candidate.planned.amountMinor
    ) {
      issues.push(
        issue(
          'minimum-exceeds-planned',
          `The minimum for “${name || id}” cannot exceed its planned allocation of ${formatMoney(candidate.planned)}.`,
          idOption,
        ),
      );
    }
  }

  if (
    typeof candidate.notes !== 'undefined' &&
    (typeof candidate.notes !== 'string' ||
      candidate.notes.length > BUDGET_CATEGORY_NOTES_MAX_LENGTH)
  ) {
    issues.push(
      issue(
        'notes-too-long',
        `Notes for “${name || id}” must be text of ${BUDGET_CATEGORY_NOTES_MAX_LENGTH} characters or fewer.`,
        idOption,
      ),
    );
  }

  if (
    isInrMoney(candidate.planned) &&
    isInrMoney(candidate.actual) &&
    candidate.actual.amountMinor > candidate.planned.amountMinor
  ) {
    issues.push(
      issue(
        'actual-exceeds-planned',
        `Actual spend for “${name || id}” is ${formatMoney(candidate.actual)}, above its ${formatMoney(candidate.planned)} plan.`,
        { ...idOption, severity: 'warning' },
      ),
    );
  }

  return issues;
}

export function validateBudgetCategories(
  categories: readonly BudgetCategory[],
): BudgetValidationIssue[] {
  const issues: BudgetValidationIssue[] = [];
  const seenIds = new Set<string>();

  categories.forEach((category, index) => {
    for (const categoryIssue of inspectCategory(category, index)) {
      issues.push(categoryIssue);
    }

    const id = asRecord(category).id;

    if (typeof id === 'string' && id) {
      if (seenIds.has(id)) {
        issues.push(
          issue(
            'duplicate-category-id',
            `Category identifier “${id}” is used more than once. Identifiers must be unique.`,
            { categoryId: id },
          ),
        );
      }

      seenIds.add(id);
    }
  });

  return issues;
}

export function toValidationResult(
  issues: readonly BudgetValidationIssue[],
): BudgetValidationResult {
  const errors = issues.filter((entry) => entry.severity === 'error');
  const warnings = issues.filter((entry) => entry.severity === 'warning');

  return { errors, warnings, isValid: errors.length === 0 };
}

export function validateBudget(budget: EventBudget): BudgetValidationResult {
  const issues: BudgetValidationIssue[] = [];
  const totalAvailable = asRecord(budget).totalAvailable;

  if (!isInrMoney(totalAvailable)) {
    issues.push(
      issue(
        'invalid-total',
        'The total budget must be a non-negative integer amount in INR paise.',
      ),
    );
  }

  for (const timestamp of [budget.createdAt, budget.updatedAt]) {
    if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
      issues.push(
        issue('invalid-timestamp', 'Budget timestamps must be valid ISO 8601 date-time strings.'),
      );
      break;
    }
  }

  issues.push(...validateBudgetCategories(budget.categories));

  const reserveTarget = asRecord(budget.emergencyReserve).target;

  if (!isInrMoney(reserveTarget)) {
    issues.push(
      issue(
        'reserve-target-invalid',
        'The emergency reserve target must be a non-negative integer amount in INR paise.',
      ),
    );
  }

  const reserveCategory = budget.categories.find(
    (category) => category.id === EMERGENCY_RESERVE_CATEGORY_ID,
  );

  if (budget.emergencyReserve.enabled) {
    if (
      isInrMoney(reserveTarget) &&
      reserveTarget.amountMinor <= 0
    ) {
      issues.push(
        issue(
          'reserve-target-invalid',
          'An enabled emergency reserve needs a positive target amount.',
        ),
      );
    }

    if (!reserveCategory) {
      issues.push(
        issue(
          'reserve-category-missing',
          'The emergency reserve is enabled but no protected reserve allocation exists.',
        ),
      );
    } else {
      const reserveFlexibility = asRecord(reserveCategory).flexibility;

      if (
        !isRecord(reserveFlexibility) ||
        reserveFlexibility.mode !== 'protected'
      ) {
        issues.push(
          issue(
            'reserve-category-not-protected',
            'The emergency reserve category must be protected so repairs cannot reduce it.',
            { categoryId: reserveCategory.id },
          ),
        );
      }

      if (
        isInrMoney(reserveTarget) &&
        isInrMoney(reserveCategory.planned) &&
        reserveCategory.planned.amountMinor < reserveTarget.amountMinor
      ) {
        issues.push(
          issue(
            'reserve-insufficient',
            `The emergency reserve is funded at ${formatMoney(reserveCategory.planned)} against a ${formatMoney(reserveTarget)} target.`,
            { categoryId: reserveCategory.id, severity: 'warning' },
          ),
        );
      }
    }
  } else if (
    reserveCategory &&
    isInrMoney(reserveCategory.planned) &&
    reserveCategory.planned.amountMinor > 0
  ) {
    issues.push(
      issue(
        'disabled-reserve-with-allocation',
        'The emergency reserve is switched off but a reserve allocation is still present.',
        { categoryId: reserveCategory.id, severity: 'warning' },
      ),
    );
  }

  if (isInrMoney(totalAvailable)) {
    let plannedMinor = 0;
    let actualMinor = 0;
    let protectedMinor = 0;
    let amountsAreSafe = true;

    for (const category of budget.categories) {
      const categoryRecord = asRecord(category);
      const planned = categoryRecord.planned;
      const actual = categoryRecord.actual;

      if (!isInrMoney(planned) || !isInrMoney(actual)) {
        amountsAreSafe = false;
        continue;
      }

      const nextPlanned = plannedMinor + planned.amountMinor;
      const nextActual = actualMinor + actual.amountMinor;

      if (!Number.isSafeInteger(nextPlanned) || !Number.isSafeInteger(nextActual)) {
        amountsAreSafe = false;
        break;
      }

      plannedMinor = nextPlanned;
      actualMinor = nextActual;

      const flexibility = categoryRecord.flexibility;

      if (isRecord(flexibility) && flexibility.mode === 'protected') {
        protectedMinor += planned.amountMinor;

        if (!Number.isSafeInteger(protectedMinor)) {
          amountsAreSafe = false;
          break;
        }
      }
    }

    if (amountsAreSafe) {
      if (plannedMinor > totalAvailable.amountMinor) {
        issues.push(
          issue(
            'allocation-exceeds-budget',
            `Planned allocations of ${formatMoney(inr(plannedMinor))} exceed the ${formatMoney(inr(totalAvailable.amountMinor))} budget by ${formatMoney(inr(plannedMinor - totalAvailable.amountMinor))}.`,
            { severity: 'warning' },
          ),
        );
      }

      if (protectedMinor > totalAvailable.amountMinor) {
        issues.push(
          issue(
            'protected-allocation-exceeds-budget',
            `Protected allocations alone total ${formatMoney(inr(protectedMinor))}, above the total budget. Automatic repair cannot reduce protected categories.`,
            { severity: 'warning' },
          ),
        );
      }

      if (actualMinor > totalAvailable.amountMinor) {
        issues.push(
          issue(
            'actual-exceeds-budget',
            `Actual spend of ${formatMoney(inr(actualMinor))} already exceeds the total budget.`,
            { severity: 'warning' },
          ),
        );
      }
    }
  }

  return toValidationResult(issues);
}
