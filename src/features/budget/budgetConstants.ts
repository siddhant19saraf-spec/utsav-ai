export const EMERGENCY_RESERVE_CATEGORY_ID = 'emergency-reserve';

export const BUDGET_CATEGORY_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
export const BUDGET_CATEGORY_NAME_MAX_LENGTH = 80;
export const BUDGET_CATEGORY_NOTES_MAX_LENGTH = 400;
/** Matches the event-creation cap of ₹100 crore, expressed in paise. */
export const MAX_BUDGET_AMOUNT_MINOR = 100_000_000_000;

export interface BudgetCategoryTemplate {
  readonly name: string;
  readonly protectedByDefault: boolean;
}

export const BUDGET_CATEGORY_TEMPLATES: readonly BudgetCategoryTemplate[] = [
  { name: 'Venue', protectedByDefault: true },
  { name: 'Catering', protectedByDefault: true },
  { name: 'Décor', protectedByDefault: false },
  { name: 'Cake and desserts', protectedByDefault: false },
  { name: 'Entertainment', protectedByDefault: false },
  { name: 'Photography', protectedByDefault: true },
  { name: 'Transport', protectedByDefault: false },
  { name: 'Miscellaneous', protectedByDefault: false },
];
