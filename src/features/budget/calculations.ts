import { isValidMoney, isValidMinorUnits } from '@/lib/money';
import type { EventBudget, BudgetCategory } from '@/types/budget';
import type { Money } from '@/types/domain';
import { EMERGENCY_RESERVE_CATEGORY_ID } from './budgetConstants';

export interface EmergencyReserveStatus {
  readonly configured: boolean;
  readonly target: Money;
  readonly allocated: Money;
  readonly shortfall: Money;
  readonly isProtected: boolean;
}

export interface OverspendingStatus {
  readonly plannedExceedsBudget: boolean;
  readonly actualExceedsBudget: boolean;
  readonly actualExceedsPlan: boolean;
}

export interface BudgetTotals {
  readonly totalBudget: Money;
  readonly planned: Money;
  readonly actual: Money;
  readonly remaining: Money;
  readonly overrun: Money;
  readonly isOverBudget: boolean;
  readonly utilizationPercent: number;
  readonly actualUtilizationPercent: number;
  readonly variance: Money;
  readonly protectedPlanned: Money;
  readonly flexiblePlanned: Money;
  readonly reserve: EmergencyReserveStatus;
  readonly overspending: OverspendingStatus;
}

function requireInrAmount(money: Money, label: string): number {
  if (!isValidMoney(money) || money.currency !== 'INR') {
    throw new RangeError(`${label} must be a non-negative safe integer amount in INR paise.`);
  }

  return money.amountMinor;
}

function addSafe(total: number, value: number): number {
  const next = total + value;

  if (!Number.isSafeInteger(next)) {
    throw new RangeError('Budget totals exceed the maximum safe integer range.');
  }

  return next;
}

function subtractSafe(first: number, second: number): number {
  const result = first - second;

  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Budget totals exceed the maximum safe integer range.');
  }

  return result;
}

function inr(amountMinor: number): Money {
  return { amountMinor, currency: 'INR' };
}

function sumCategoryField(
  categories: readonly BudgetCategory[],
  field: 'planned' | 'actual',
): number {
  let total = 0;

  for (const category of categories) {
    const amount = requireInrAmount(category[field], `Category “${category.name}” ${field} amount`);
    total = addSafe(total, amount);
  }

  return total;
}

export function calculateTotalPlanned(categories: readonly BudgetCategory[]): Money {
  return inr(sumCategoryField(categories, 'planned'));
}

export function calculateActualExpenses(categories: readonly BudgetCategory[]): Money {
  return inr(sumCategoryField(categories, 'actual'));
}

export function calculateRemainingBudget(totalBudget: Money, plannedExpenses: Money): Money {
  return inr(
    subtractSafe(
      requireInrAmount(totalBudget, 'Total budget'),
      requireInrAmount(plannedExpenses, 'Planned expenses'),
    ),
  );
}

/**
 * Planned allocation as a percentage of the total budget.
 * A zero budget with allocations is treated as 100% utilised; zero with no
 * allocations is 0%.
 */
export function calculateBudgetUtilization(
  totalBudget: Money,
  plannedExpenses: Money,
): number {
  const totalMinor = requireInrAmount(totalBudget, 'Total budget');
  const plannedMinor = requireInrAmount(plannedExpenses, 'Planned expenses');

  if (totalMinor === 0) {
    return plannedMinor === 0 ? 0 : 100;
  }

  return Math.round((plannedMinor / totalMinor) * 100);
}

export function isOverBudget(totalBudget: Money, plannedExpenses: Money): boolean {
  return (
    requireInrAmount(plannedExpenses, 'Planned expenses') >
    requireInrAmount(totalBudget, 'Total budget')
  );
}

export function detectOverspending(
  totalBudget: Money,
  plannedExpenses: Money,
  actualExpenses: Money,
): OverspendingStatus {
  const totalMinor = requireInrAmount(totalBudget, 'Total budget');
  const plannedMinor = requireInrAmount(plannedExpenses, 'Planned expenses');
  const actualMinor = requireInrAmount(actualExpenses, 'Actual expenses');

  return {
    plannedExceedsBudget: plannedMinor > totalMinor,
    actualExceedsBudget: actualMinor > totalMinor,
    actualExceedsPlan: actualMinor > plannedMinor,
  };
}

/** Planned expenditure minus actual expenditure. Positive means spending is behind plan. */
export function calculateBudgetVariance(categories: readonly BudgetCategory[]): Money {
  return inr(
    subtractSafe(
      sumCategoryField(categories, 'planned'),
      sumCategoryField(categories, 'actual'),
    ),
  );
}

export function calculateCategoryVariance(category: BudgetCategory): Money {
  return inr(
    subtractSafe(
      requireInrAmount(category.planned, 'Category planned amount'),
      requireInrAmount(category.actual, 'Category actual amount'),
    ),
  );
}

export function calculateEmergencyReserve(budget: EventBudget): EmergencyReserveStatus {
  const targetMinor = requireInrAmount(
    budget.emergencyReserve.target,
    'Emergency reserve target',
  );
  const reserveCategory = budget.categories.find(
    (category) => category.id === EMERGENCY_RESERVE_CATEGORY_ID,
  );
  const allocatedMinor = reserveCategory
    ? requireInrAmount(reserveCategory.planned, 'Emergency reserve allocation')
    : 0;

  return {
    configured: budget.emergencyReserve.enabled,
    target: inr(targetMinor),
    allocated: inr(allocatedMinor),
    shortfall: inr(Math.max(0, targetMinor - allocatedMinor)),
    isProtected: reserveCategory?.flexibility.mode === 'protected',
  };
}

export function calculateBudgetTotals(budget: EventBudget): BudgetTotals {
  const totalMinor = requireInrAmount(budget.totalAvailable, 'Total budget');
  const plannedMinor = sumCategoryField(budget.categories, 'planned');
  const actualMinor = sumCategoryField(budget.categories, 'actual');
  const protectedMinor = budget.categories.reduce((total, category) => {
    if (category.flexibility.mode !== 'protected') {
      return total;
    }

    return addSafe(
      total,
      requireInrAmount(category.planned, `Category “${category.name}” planned amount`),
    );
  }, 0);
  const flexibleMinor = subtractSafe(plannedMinor, protectedMinor);
  const reserve = calculateEmergencyReserve(budget);

  const totalBudget = inr(totalMinor);
  const planned = inr(plannedMinor);
  const actual = inr(actualMinor);
  const remainingMinor = subtractSafe(totalMinor, plannedMinor);

  return {
    totalBudget,
    planned,
    actual,
    remaining: inr(remainingMinor),
    overrun: inr(Math.max(0, subtractSafe(plannedMinor, totalMinor))),
    isOverBudget: plannedMinor > totalMinor,
    utilizationPercent: calculateBudgetUtilization(totalBudget, planned),
    actualUtilizationPercent:
      totalMinor === 0
        ? actualMinor === 0
          ? 0
          : 100
        : Math.round((actualMinor / totalMinor) * 100),
    variance: inr(subtractSafe(plannedMinor, actualMinor)),
    protectedPlanned: inr(protectedMinor),
    flexiblePlanned: inr(flexibleMinor),
    reserve,
    overspending: detectOverspending(totalBudget, planned, actual),
  };
}

export function isValidBudgetAmount(value: unknown): value is number {
  return isValidMinorUnits(value);
}
