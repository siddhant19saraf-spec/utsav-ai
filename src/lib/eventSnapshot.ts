import type { BudgetCategory, EventBudget } from '@/types/budget';
import type { CelebrationEvent } from '@/types/domain';

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

export function cloneEventBudget(budget: EventBudget): EventBudget {
  return {
    ...budget,
    totalAvailable: { ...budget.totalAvailable },
    categories: budget.categories.map(cloneCategory),
    emergencyReserve: {
      ...budget.emergencyReserve,
      target: { ...budget.emergencyReserve.target },
    },
  };
}

export function cloneEvent(event: CelebrationEvent): CelebrationEvent {
  return {
    ...event,
    budget: cloneEventBudget(event.budget),
  };
}

/**
 * Canonical snapshot used to detect stale rescue proposals. Optional fields are
 * normalised to null so absent and explicit clearing states differ consistently,
 * while the category order remains part of the plan identity.
 */
export function createEventSnapshotSignature(event: CelebrationEvent): string {
  return JSON.stringify({
    id: event.id,
    name: event.name,
    category: event.category,
    startsAt: event.startsAt,
    venue: event.venue ?? null,
    expectedGuests: event.expectedGuests,
    status: event.status,
    origin: event.origin,
    setting: event.setting ?? null,
    theme: event.theme ?? null,
    accessibilityRequired: event.accessibilityRequired ?? null,
    accessibilityAddressed: event.accessibilityAddressed ?? null,
    contingencyPlanConfirmed: event.contingencyPlanConfirmed ?? null,
    updatedAt: event.updatedAt ?? null,
    budget: {
      id: event.budget.id,
      eventId: event.budget.eventId,
      totalAvailable: { ...event.budget.totalAvailable },
      emergencyReserve: {
        enabled: event.budget.emergencyReserve.enabled,
        target: { ...event.budget.emergencyReserve.target },
      },
      createdAt: event.budget.createdAt,
      updatedAt: event.budget.updatedAt,
      categories: event.budget.categories.map((category) => ({
        id: category.id,
        name: category.name,
        planned: { ...category.planned },
        actual: { ...category.actual },
        flexibility:
          category.flexibility.mode === 'protected'
            ? { mode: 'protected' }
            : {
                mode: 'flexible',
                minimumPlanned: { ...category.flexibility.minimumPlanned },
              },
        notes: category.notes ?? null,
      })),
    },
  });
}
