import type { BudgetCategory, EmergencyReserveConfig, EventBudget } from '@/types/budget';
import type { Money } from '@/types/domain';
import { EMERGENCY_RESERVE_CATEGORY_ID } from './budgetConstants';

const zeroInr: Money = { amountMinor: 0, currency: 'INR' };

export function createEventBudget(
  eventId: string,
  budgetId: string,
  totalAvailable: Money,
  timestamp: string,
): EventBudget {
  return {
    id: budgetId,
    eventId,
    totalAvailable,
    categories: [],
    emergencyReserve: { enabled: false, target: { ...zeroInr } },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function withUpdatedBudgetTotal(
  budget: EventBudget,
  totalAvailable: Money,
  updatedAt: string,
): EventBudget {
  return {
    ...budget,
    totalAvailable,
    updatedAt,
  };
}

export function withUpsertedCategory(
  budget: EventBudget,
  category: BudgetCategory,
  updatedAt: string,
): EventBudget {
  const exists = budget.categories.some((entry) => entry.id === category.id);
  const categories = exists
    ? budget.categories.map((entry) => (entry.id === category.id ? category : entry))
    : [...budget.categories, category];

  return {
    ...budget,
    categories,
    updatedAt,
  };
}

export function withRemovedCategory(
  budget: EventBudget,
  categoryId: string,
  updatedAt: string,
): EventBudget {
  return {
    ...budget,
    categories: budget.categories.filter((entry) => entry.id !== categoryId),
    updatedAt,
  };
}

export function withReplacedCategories(
  budget: EventBudget,
  categories: readonly BudgetCategory[],
  updatedAt: string,
): EventBudget {
  return {
    ...budget,
    categories,
    updatedAt,
  };
}

export function withEmergencyReserve(
  budget: EventBudget,
  config: EmergencyReserveConfig,
  updatedAt: string,
): EventBudget {
  if (!config.enabled) {
    return {
      ...budget,
      categories: budget.categories.filter(
        (category) => category.id !== EMERGENCY_RESERVE_CATEGORY_ID,
      ),
      emergencyReserve: config,
      updatedAt,
    };
  }

  const existing = budget.categories.find(
    (category) => category.id === EMERGENCY_RESERVE_CATEGORY_ID,
  );
  const reserveCategory: BudgetCategory = {
    id: EMERGENCY_RESERVE_CATEGORY_ID,
    name: existing?.name ?? 'Emergency reserve',
    planned: config.target,
    actual: existing?.actual ?? { ...zeroInr },
    flexibility: { mode: 'protected' },
    ...(existing?.notes ? { notes: existing.notes } : {}),
  };

  return {
    ...budget,
    categories: existing
      ? budget.categories.map((category) =>
          category.id === EMERGENCY_RESERVE_CATEGORY_ID ? reserveCategory : category,
        )
      : [...budget.categories, reserveCategory],
    emergencyReserve: config,
    updatedAt,
  };
}
