import { MAX_BUDGET_AMOUNT_MINOR } from '@/features/budget/budgetConstants';
import { isValidIsoDate } from '@/lib/date';
import { formatMinorForInput, formatMoney, parseRupeesToMinor } from '@/lib/money';
import type { CelebrationEvent, EventSetting } from '@/types/domain';
import type { RescueRequest } from './rescueTypes';
import {
  MAX_RESCUE_GUESTS,
  MAX_RESCUE_THEME_LENGTH,
  isEventSetting,
  requirementsFromEvent,
} from './rescueValidation';

export type RescueTriState = '' | 'yes' | 'no';

export interface RescueFormValues {
  readonly startsAt: string;
  readonly expectedGuests: string;
  readonly totalBudget: string;
  readonly setting: '' | EventSetting;
  readonly theme: string;
  readonly accessibilityRequired: RescueTriState;
  readonly accessibilityAddressed: RescueTriState;
  readonly contingencyPlanConfirmed: RescueTriState;
  readonly protectedCategoryIds: readonly string[];
  readonly minimums: Readonly<Record<string, string>>;
}

export type RescueFormErrors = Readonly<Record<string, string>>;

export type RescueFormResult =
  | { readonly ok: true; readonly request: RescueRequest }
  | { readonly ok: false; readonly errors: RescueFormErrors };

function triStateToBoolean(value: RescueTriState): boolean | null {
  if (value === 'yes') {
    return true;
  }

  if (value === 'no') {
    return false;
  }

  return null;
}

export function getInitialRescueForm(event: CelebrationEvent): RescueFormValues {
  const minimums: Record<string, string> = {};

  for (const category of event.budget.categories) {
    if (category.flexibility.mode === 'flexible') {
      minimums[category.id] = formatMinorForInput(
        category.flexibility.minimumPlanned.amountMinor,
      );
    }
  }

  return {
    startsAt: event.startsAt,
    expectedGuests: String(event.expectedGuests),
    totalBudget: formatMinorForInput(event.budget.totalAvailable.amountMinor),
    setting: event.setting ?? '',
    theme: event.theme ?? '',
    accessibilityRequired:
      event.accessibilityRequired === true
        ? 'yes'
        : event.accessibilityRequired === false
          ? 'no'
          : '',
    accessibilityAddressed:
      event.accessibilityAddressed === true
        ? 'yes'
        : event.accessibilityAddressed === false
          ? 'no'
          : '',
    contingencyPlanConfirmed:
      event.contingencyPlanConfirmed === true
        ? 'yes'
        : event.contingencyPlanConfirmed === false
          ? 'no'
          : '',
    protectedCategoryIds: [],
    minimums,
  };
}

/**
 * Turns editable form values into a typed rescue request. This validates the
 * same boundary rules as the engine and never mutates the saved event.
 */
export function createRescueRequestFromForm(
  event: CelebrationEvent,
  values: RescueFormValues,
  todayIso: string,
): RescueFormResult {
  const errors: Record<string, string> = {};
  const startsAt = values.startsAt.trim();
  const guestText = values.expectedGuests.trim();
  const totalMinor = parseRupeesToMinor(values.totalBudget);
  const theme = values.theme.trim();
  const protectedIds = [...new Set(values.protectedCategoryIds)];
  const categoriesById = new Map(
    event.budget.categories.map((category) => [category.id, category]),
  );

  if (!isValidIsoDate(startsAt)) {
    errors.startsAt = 'Choose a valid event date.';
  } else if (startsAt < todayIso) {
    errors.startsAt = 'Choose today or a future event date.';
  }

  if (!/^\d+$/.test(guestText)) {
    errors.expectedGuests = 'Enter a whole number of guests.';
  } else {
    const guests = Number(guestText);

    if (
      !Number.isSafeInteger(guests) ||
      guests < 1 ||
      guests > MAX_RESCUE_GUESTS
    ) {
      errors.expectedGuests = `Enter between 1 and ${new Intl.NumberFormat('en-IN').format(MAX_RESCUE_GUESTS)} guests.`;
    }
  }

  if (totalMinor === null || totalMinor > MAX_BUDGET_AMOUNT_MINOR) {
    errors.totalBudget =
      'Enter a total from ₹0 to ₹100 crore, with up to two decimal places.';
  }

  if (!isEventSetting(values.setting) && values.setting !== '') {
    errors.setting = 'Choose a valid event setting.';
  }

  if (theme.length > MAX_RESCUE_THEME_LENGTH) {
    errors.theme = `Keep the theme to ${MAX_RESCUE_THEME_LENGTH} characters or fewer.`;
  }

  for (const categoryId of protectedIds) {
    if (!categoriesById.has(categoryId)) {
      errors.protected = 'Choose only categories from this event.';
      break;
    }
  }

  const protectedSet = new Set(protectedIds);
  const flexibleCategories: RescueRequest['flexibleCategories'][number][] = [];

  for (const category of event.budget.categories) {
    if (category.flexibility.mode === 'protected' || protectedSet.has(category.id)) {
      continue;
    }

    const minimumText = values.minimums[category.id] ?? '';
    const minimumMinor = parseRupeesToMinor(minimumText);

    if (minimumMinor === null || minimumMinor > MAX_BUDGET_AMOUNT_MINOR) {
      errors[`minimum:${category.id}`] =
        'Enter a valid minimum with up to two decimal places.';
      continue;
    }

    if (minimumMinor > category.planned.amountMinor) {
      errors[`minimum:${category.id}`] = `The minimum cannot exceed the current plan of ${formatMoney(
        category.planned,
      )}.`;
      continue;
    }

    flexibleCategories.push({
      categoryId: category.id,
      minimumPlanned: { amountMinor: minimumMinor, currency: 'INR' },
    });
  }

  if (Object.keys(errors).length > 0 || totalMinor === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    request: {
      eventId: event.id,
      current: requirementsFromEvent(event),
      changes: {
        startsAt,
        expectedGuests: Number(guestText),
        totalAvailable: { amountMinor: totalMinor, currency: 'INR' },
        setting: values.setting === '' ? null : values.setting,
        theme: theme ? theme : null,
        accessibilityRequired: triStateToBoolean(values.accessibilityRequired),
        accessibilityAddressed: triStateToBoolean(values.accessibilityAddressed),
        contingencyPlanConfirmed: triStateToBoolean(
          values.contingencyPlanConfirmed,
        ),
      },
      protectedCategoryIds: protectedIds,
      flexibleCategories,
    },
  };
}
