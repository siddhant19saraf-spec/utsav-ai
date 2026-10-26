import type { CelebrationEvent, EventCategory } from '@/types/domain';
import { addDays, isValidIsoDate } from '@/lib/date';
import { eventCategories } from '@/lib/eventMeta';
import { MAX_BUDGET_AMOUNT_MINOR, MAX_EVENT_GUESTS } from '@/lib/limits';
import { formatMinorForInput, parseRupeesToMinor } from '@/lib/money';
import type { EventDraft } from './eventMutations';

export const MAX_EVENT_BUDGET_MINOR = MAX_BUDGET_AMOUNT_MINOR;

export interface EventFormValues {
  readonly name: string;
  readonly category: EventCategory;
  readonly startsAt: string;
  readonly venue: string;
  readonly expectedGuests: string;
  readonly budget: string;
}

export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>;

export type EventFormResult =
  | { readonly ok: true; readonly draft: EventDraft }
  | { readonly ok: false; readonly errors: EventFormErrors };

export interface EventFormValidationOptions {
  /**
   * The saved date may stay in the past so an existing event can still be
   * corrected. Choosing a different past date remains invalid.
   */
  readonly originalStartsAt?: string;
}

function parseGuestCount(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const count = Number(normalized);
  return Number.isSafeInteger(count) && count >= 1 && count <= MAX_EVENT_GUESTS
    ? count
    : null;
}

export function getInitialEventForm(todayIso: string): EventFormValues {
  return {
    name: '',
    category: 'wedding',
    startsAt: addDays(todayIso, 60),
    venue: '',
    expectedGuests: '',
    budget: '',
  };
}

export function getEventFormValues(event: CelebrationEvent): EventFormValues {
  return {
    name: event.name,
    category: event.category,
    startsAt: event.startsAt,
    venue: event.venue ?? '',
    expectedGuests: String(event.expectedGuests),
    budget: formatMinorForInput(event.budget.totalAvailable.amountMinor),
  };
}

export function validateEventForm(
  values: EventFormValues,
  todayIso: string,
  options: EventFormValidationOptions = {},
): EventFormResult {
  const errors: EventFormErrors = {};
  const name = values.name.trim();
  const venue = values.venue.trim();
  const startsAt = values.startsAt.trim();
  const guests = parseGuestCount(values.expectedGuests);
  const budgetMinor = parseRupeesToMinor(values.budget);

  if (name.length === 0) {
    errors.name = 'Enter an event name.';
  } else if (name.length < 2) {
    errors.name = 'Use at least two characters for the event name.';
  } else if (name.length > 80) {
    errors.name = 'Keep the event name to 80 characters or fewer.';
  }

  if (!eventCategories.includes(values.category)) {
    errors.category = 'Choose an event category.';
  }

  if (!isValidIsoDate(startsAt)) {
    errors.startsAt = 'Choose a valid event date.';
  } else if (startsAt < todayIso && startsAt !== options.originalStartsAt) {
    errors.startsAt = 'Choose today or a future date.';
  }

  if (venue.length > 120) {
    errors.venue = 'Keep the venue to 120 characters or fewer.';
  }

  if (guests === null) {
    errors.expectedGuests = 'Enter a whole number between 1 and 1,00,000.';
  }

  if (budgetMinor === null || budgetMinor <= 0) {
    errors.budget = 'Enter a positive amount in rupees, with up to two decimal places.';
  } else if (budgetMinor > MAX_EVENT_BUDGET_MINOR) {
    errors.budget = 'Keep the budget at ₹100 crore or below.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (guests === null || budgetMinor === null) {
    return {
      ok: false,
      errors: {
        expectedGuests: 'Enter a valid guest count.',
        budget: 'Enter a valid budget.',
      },
    };
  }

  return {
    ok: true,
    draft: {
      name,
      category: values.category,
      startsAt,
      expectedGuests: guests,
      budget: { amountMinor: budgetMinor, currency: 'INR' },
      ...(venue ? { venue } : {}),
    },
  };
}
