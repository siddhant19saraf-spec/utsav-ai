import { formatMinorForInput, parseRupeesToMinor } from '@/lib/money';
import type { BudgetCategory, BudgetFlexibility } from '@/types/budget';
import {
  BUDGET_CATEGORY_NAME_MAX_LENGTH,
  BUDGET_CATEGORY_NOTES_MAX_LENGTH,
  MAX_BUDGET_AMOUNT_MINOR,
} from './budgetConstants';

export type BudgetProtectionChoice = 'protected' | 'flexible';

export interface BudgetCategoryFormValues {
  readonly name: string;
  readonly planned: string;
  readonly actual: string;
  readonly protection: BudgetProtectionChoice;
  readonly minimum: string;
  readonly notes: string;
}

export type BudgetCategoryFormField = keyof BudgetCategoryFormValues;
export type BudgetCategoryFormErrors = Partial<Record<BudgetCategoryFormField, string>>;

export interface BudgetCategoryFormInput {
  readonly name: string;
  readonly plannedMinor: number;
  readonly actualMinor: number;
  readonly flexibility: BudgetFlexibility;
  readonly notes?: string;
}

export type BudgetCategoryFormResult =
  | { readonly ok: true; readonly input: BudgetCategoryFormInput }
  | { readonly ok: false; readonly errors: BudgetCategoryFormErrors };

export const BUDGET_CATEGORY_FIELD_ORDER: readonly BudgetCategoryFormField[] = [
  'name',
  'planned',
  'actual',
  'protection',
  'minimum',
  'notes',
];

export function parseBudgetAmountInput(value: string): number | null {
  const amountMinor = parseRupeesToMinor(value);

  if (amountMinor === null || amountMinor > MAX_BUDGET_AMOUNT_MINOR) {
    return null;
  }

  return amountMinor;
}

export function getInitialCategoryForm(
  category?: BudgetCategory,
): BudgetCategoryFormValues {
  if (!category) {
    return {
      name: '',
      planned: '',
      actual: '0',
      protection: 'flexible',
      minimum: '0',
      notes: '',
    };
  }

  return {
    name: category.name,
    planned: formatMinorForInput(category.planned.amountMinor),
    actual: formatMinorForInput(category.actual.amountMinor),
    protection: category.flexibility.mode,
    minimum:
      category.flexibility.mode === 'flexible'
        ? formatMinorForInput(category.flexibility.minimumPlanned.amountMinor)
        : '0',
    notes: category.notes ?? '',
  };
}

export function validateBudgetCategoryForm(
  values: BudgetCategoryFormValues,
): BudgetCategoryFormResult {
  const errors: BudgetCategoryFormErrors = {};
  const name = values.name.trim();
  const notes = values.notes.trim();
  const plannedMinor = parseBudgetAmountInput(values.planned);
  const actualMinor = parseBudgetAmountInput(values.actual);
  const minimumMinor =
    values.protection === 'flexible' ? parseBudgetAmountInput(values.minimum) : 0;

  if (!name) {
    errors.name = 'Enter a category name.';
  } else if (name.length > BUDGET_CATEGORY_NAME_MAX_LENGTH) {
    errors.name = `Keep the category name to ${BUDGET_CATEGORY_NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (plannedMinor === null) {
    errors.planned = 'Enter a planned amount from ₹0 to ₹100 crore, with up to two decimal places.';
  }

  if (actualMinor === null) {
    errors.actual = 'Enter an actual amount from ₹0 to ₹100 crore, with up to two decimal places.';
  }

  if (values.protection === 'flexible' && minimumMinor === null) {
    errors.minimum = 'Enter a minimum from ₹0 to ₹100 crore, with up to two decimal places.';
  } else if (
    minimumMinor !== null &&
    plannedMinor !== null &&
    minimumMinor > plannedMinor
  ) {
    errors.minimum = 'The minimum cannot be higher than the planned amount.';
  }

  if (notes.length > BUDGET_CATEGORY_NOTES_MAX_LENGTH) {
    errors.notes = `Keep notes to ${BUDGET_CATEGORY_NOTES_MAX_LENGTH} characters or fewer.`;
  }

  if (
    Object.keys(errors).length > 0 ||
    plannedMinor === null ||
    actualMinor === null ||
    minimumMinor === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      name,
      plannedMinor,
      actualMinor,
      flexibility:
        values.protection === 'protected'
          ? { mode: 'protected' }
          : {
              mode: 'flexible',
              minimumPlanned: { amountMinor: minimumMinor, currency: 'INR' },
            },
      ...(notes ? { notes } : {}),
    },
  };
}

export function createCategoryFromForm(
  input: BudgetCategoryFormInput,
  id: string,
): BudgetCategory {
  return {
    id,
    name: input.name,
    planned: { amountMinor: input.plannedMinor, currency: 'INR' },
    actual: { amountMinor: input.actualMinor, currency: 'INR' },
    flexibility: input.flexibility,
    ...(input.notes ? { notes: input.notes } : {}),
  };
}
