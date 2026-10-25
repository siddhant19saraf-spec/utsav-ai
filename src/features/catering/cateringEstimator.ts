import { findCateringCategory } from '@/features/budget/catering';
import { getGuestCounts, type GuestCounts } from '@/features/guests/guestRules';
import { isValidMoney } from '@/lib/money';
import type { CelebrationEvent, Guest, Money } from '@/types/domain';

export const MAX_BUFFER_PERCENT = 100;

export interface DietaryPreferenceCount {
  readonly label: string;
  readonly count: number;
}

export interface CateringEstimate {
  readonly attendeeSource: 'confirmed' | 'expected';
  readonly guestRecords: number;
  readonly counts: GuestCounts;
  readonly baseAttendees: number;
  readonly bufferPercent: number;
  readonly bufferAttendees: number;
  readonly estimatedAttendees: number;
  readonly perPersonCost: Money;
  readonly baseCost: Money;
  readonly bufferCost: Money;
  readonly estimatedCost: Money;
  readonly cateringCategory: {
    readonly id: string;
    readonly name: string;
    readonly planned: Money;
  } | null;
  readonly differenceFromPlanMinor: number | null;
  readonly percentOfTotalBudget: number;
  readonly dietaryPreferences: readonly DietaryPreferenceCount[];
}

function invalid(message: string): never {
  throw new RangeError(message);
}

function requireCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a non-negative whole number.`);
  }

  return value;
}

function requireCost(money: Money): number {
  if (!isValidMoney(money) || money.currency !== 'INR') {
    invalid('The per-person cost must be a non-negative integer INR amount.');
  }

  return money.amountMinor;
}

function multiplySafe(amountMinor: number, multiplier: number): number {
  const product = BigInt(amountMinor) * BigInt(multiplier);

  if (product > BigInt(Number.MAX_SAFE_INTEGER)) {
    invalid('The catering estimate exceeds the supported amount range.');
  }

  return Number(product);
}

function bufferHeadcount(baseAttendees: number, bufferPercent: number): number {
  const scaled = BigInt(baseAttendees) * BigInt(bufferPercent);
  const divisor = 100n;
  const rounded = (scaled + divisor - 1n) / divisor;

  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    invalid('The catering buffer exceeds the supported range.');
  }

  return Number(rounded);
}

function confirmedDietaryPreferences(
  guests: readonly Guest[],
): DietaryPreferenceCount[] {
  const preferences = new Map<string, { label: string; count: number }>();

  for (const guest of guests) {
    if (guest.rsvp !== 'confirmed') {
      continue;
    }

    const label = guest.dietaryPreference?.trim();

    if (!label) {
      continue;
    }

    const key = label.toLowerCase();
    const current = preferences.get(key) ?? { label, count: 0 };
    current.count += 1;
    preferences.set(key, current);
  }

  return [...preferences.values()]
    .sort(
      (first, second) =>
        second.count - first.count || first.label.localeCompare(second.label),
    )
    .map((entry) => ({ label: entry.label, count: entry.count }));
}

/**
 * Deterministic planning estimate. Confirmed RSVPs are used when guest records
 * exist; otherwise the event's expected guest count is used and labelled.
 * No vendor price or market rate is inferred.
 */
export function calculateCateringEstimate(
  event: CelebrationEvent,
  guests: readonly Guest[],
  perPersonCost: Money,
  bufferPercent: number,
): CateringEstimate {
  if (!Number.isSafeInteger(bufferPercent) || bufferPercent < 0 || bufferPercent > MAX_BUFFER_PERCENT) {
    invalid(`The buffer must be a whole percentage from 0 to ${MAX_BUFFER_PERCENT}.`);
  }

  const perPersonMinor = requireCost(perPersonCost);
  const eventGuests = guests.filter((guest) => guest.eventId === event.id);
  const counts = getGuestCounts(eventGuests);
  const guestRecords = eventGuests.length;
  const attendeeSource = guestRecords > 0 ? 'confirmed' : 'expected';
  const baseAttendees =
    attendeeSource === 'confirmed'
      ? requireCount(counts.confirmed, 'Confirmed attendance')
      : requireCount(event.expectedGuests, 'Expected guests');

  if (baseAttendees <= 0 && eventGuests.length === 0) {
    invalid('The event does not have a usable expected guest count.');
  }

  const bufferAttendees = bufferHeadcount(baseAttendees, bufferPercent);
  const estimatedAttendees = baseAttendees + bufferAttendees;

  if (!Number.isSafeInteger(estimatedAttendees)) {
    invalid('The estimated attendee count exceeds the supported range.');
  }

  const baseCostMinor = multiplySafe(perPersonMinor, baseAttendees);
  const bufferCostMinor = multiplySafe(perPersonMinor, bufferAttendees);
  const estimatedCostMinor = multiplySafe(perPersonMinor, estimatedAttendees);
  const catering = findCateringCategory(event.budget.categories);
  const totalBudgetMinor = event.budget.totalAvailable.amountMinor;

  return {
    attendeeSource,
    guestRecords,
    counts,
    baseAttendees,
    bufferPercent,
    bufferAttendees,
    estimatedAttendees,
    perPersonCost: { amountMinor: perPersonMinor, currency: 'INR' },
    baseCost: { amountMinor: baseCostMinor, currency: 'INR' },
    bufferCost: { amountMinor: bufferCostMinor, currency: 'INR' },
    estimatedCost: { amountMinor: estimatedCostMinor, currency: 'INR' },
    cateringCategory: catering
      ? {
          id: catering.id,
          name: catering.name,
          planned: { ...catering.planned },
        }
      : null,
    differenceFromPlanMinor: catering
      ? estimatedCostMinor - catering.planned.amountMinor
      : null,
    percentOfTotalBudget:
      totalBudgetMinor > 0
        ? Math.round((estimatedCostMinor / totalBudgetMinor) * 100)
        : estimatedCostMinor > 0
          ? 100
          : 0,
    dietaryPreferences: confirmedDietaryPreferences(eventGuests),
  };
}
