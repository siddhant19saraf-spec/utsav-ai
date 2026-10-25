import type { CelebrationEvent, EventCategory, Money } from '@/types/domain';
import { createId } from '@/lib/id';
import {
  createEventBudget,
  withUpdatedBudgetTotal,
} from '@/features/budget/mutations';

export interface EventDraft {
  readonly name: string;
  readonly category: EventCategory;
  readonly startsAt: string;
  readonly venue?: string;
  readonly expectedGuests: number;
  readonly budget: Money;
}

function hasSameAmount(first: Money, second: Money): boolean {
  return (
    first.amountMinor === second.amountMinor &&
    first.currency === second.currency
  );
}

export function createUserEvent(
  draft: EventDraft,
  id: string,
  now = new Date(),
): CelebrationEvent {
  const timestamp = now.toISOString();

  return {
    id,
    name: draft.name,
    category: draft.category,
    startsAt: draft.startsAt,
    expectedGuests: draft.expectedGuests,
    budget: createEventBudget(id, createId('budget'), draft.budget, timestamp),
    status: 'planning',
    origin: 'user',
    ...(draft.venue ? { venue: draft.venue } : {}),
  };
}

/**
 * Replaces editable event details only. Planning status, origin, optional
 * planning fields, budget categories, and the emergency reserve are preserved.
 * A changed total updates the budget metadata; unchanged totals keep the saved
 * budget object untouched.
 */
export function updateUserEvent(
  existing: CelebrationEvent,
  draft: EventDraft,
  now = new Date(),
): CelebrationEvent {
  const updatedAt = now.toISOString();
  const budget = hasSameAmount(existing.budget.totalAvailable, draft.budget)
    ? existing.budget
    : withUpdatedBudgetTotal(existing.budget, draft.budget, updatedAt);

  return {
    id: existing.id,
    name: draft.name,
    category: draft.category,
    startsAt: draft.startsAt,
    expectedGuests: draft.expectedGuests,
    budget,
    status: existing.status,
    origin: existing.origin,
    ...(draft.venue ? { venue: draft.venue } : {}),
    ...(existing.setting ? { setting: existing.setting } : {}),
    ...(existing.theme ? { theme: existing.theme } : {}),
    ...(typeof existing.accessibilityRequired === 'boolean'
      ? { accessibilityRequired: existing.accessibilityRequired }
      : {}),
    ...(typeof existing.accessibilityAddressed === 'boolean'
      ? { accessibilityAddressed: existing.accessibilityAddressed }
      : {}),
    ...(typeof existing.contingencyPlanConfirmed === 'boolean'
      ? { contingencyPlanConfirmed: existing.contingencyPlanConfirmed }
      : {}),
    updatedAt,
  };
}
