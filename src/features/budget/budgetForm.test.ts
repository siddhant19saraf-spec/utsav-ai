import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import { makeCategory } from '@/test/fixtures';
import {
  createCategoryFromForm,
  getInitialCategoryForm,
  parseBudgetAmountInput,
  validateBudgetCategoryForm,
  type BudgetCategoryFormValues,
} from './budgetForm';

function validValues(
  overrides: Partial<BudgetCategoryFormValues> = {},
): BudgetCategoryFormValues {
  return {
    name: 'Venue',
    planned: '1,20,000',
    actual: '25,000',
    protection: 'flexible',
    minimum: '80,000',
    notes: '',
    ...overrides,
  };
}

describe('parseBudgetAmountInput', () => {
  it('parses Indian grouping and paise into integer minor units', () => {
    expect(parseBudgetAmountInput('1,20,000')).toBe(12_000_000);
    expect(parseBudgetAmountInput(' 1250.50 ')).toBe(125_050);
    expect(parseBudgetAmountInput('0')).toBe(0);
  });

  it('accepts the ₹100 crore cap and rejects amounts above it', () => {
    expect(parseBudgetAmountInput('1,00,00,00,000')).toBe(100_000_000_000);
    expect(parseBudgetAmountInput('1,00,00,00,000.01')).toBeNull();
  });

  it('rejects empty, negative, ambiguous, and over-precise amounts', () => {
    expect(parseBudgetAmountInput('')).toBeNull();
    expect(parseBudgetAmountInput('   ')).toBeNull();
    expect(parseBudgetAmountInput('-50')).toBeNull();
    expect(parseBudgetAmountInput('₹1,250')).toBeNull();
    expect(parseBudgetAmountInput('1e6')).toBeNull();
    expect(parseBudgetAmountInput('12.345')).toBeNull();
  });
});

describe('getInitialCategoryForm', () => {
  it('starts a new category empty with a zero actual and flexible protection', () => {
    expect(getInitialCategoryForm()).toEqual({
      name: '',
      planned: '',
      actual: '0',
      protection: 'flexible',
      minimum: '0',
      notes: '',
    });
  });

  it('maps a protected category without exposing a minimum', () => {
    const category = makeCategory({
      name: 'Venue',
      planned: rupees(1_200),
      actual: rupees(150),
      flexibility: { mode: 'protected' },
      notes: 'Signed contract',
    });

    expect(getInitialCategoryForm(category)).toEqual({
      name: 'Venue',
      planned: '1200',
      actual: '150',
      protection: 'protected',
      minimum: '0',
      notes: 'Signed contract',
    });
  });

  it('maps a flexible category and formats paise for editing', () => {
    const category = makeCategory({
      planned: { amountMinor: 125_050, currency: 'INR' },
      flexibility: {
        mode: 'flexible',
        minimumPlanned: { amountMinor: 80_000, currency: 'INR' },
      },
    });

    const values = getInitialCategoryForm(category);

    expect(values.planned).toBe('1250.5');
    expect(values.minimum).toBe('800');
  });
});

describe('validateBudgetCategoryForm', () => {
  it('accepts a valid flexible category and trims text fields', () => {
    const result = validateBudgetCategoryForm(
      validValues({ name: '  Décor  ', notes: '  Vendor quote attached.  ' }),
    );

    expect(result).toEqual({
      ok: true,
      input: {
        name: 'Décor',
        plannedMinor: 12_000_000,
        actualMinor: 2_500_000,
        flexibility: {
          mode: 'flexible',
          minimumPlanned: { amountMinor: 8_000_000, currency: 'INR' },
        },
        notes: 'Vendor quote attached.',
      },
    });
  });

  it('accepts a protected category without requiring a minimum', () => {
    const result = validateBudgetCategoryForm(
      validValues({ protection: 'protected', minimum: 'not a number' }),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.input.flexibility).toEqual({ mode: 'protected' });
    }
  });

  it('requires a category name', () => {
    const result = validateBudgetCategoryForm(validValues({ name: '   ' }));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.name).toMatch(/enter a category name/i);
    }
  });

  it('rejects names and notes beyond their limits', () => {
    const longName = validateBudgetCategoryForm(validValues({ name: 'a'.repeat(81) }));
    const longNotes = validateBudgetCategoryForm(
      validValues({ notes: 'a'.repeat(401) }),
    );

    expect(longName.ok).toBe(false);
    expect(longNotes.ok).toBe(false);

    if (!longName.ok) {
      expect(longName.errors.name).toMatch(/80 characters/i);
    }

    if (!longNotes.ok) {
      expect(longNotes.errors.notes).toMatch(/400 characters/i);
    }
  });

  it('rejects invalid planned and actual amounts', () => {
    const missing = validateBudgetCategoryForm(validValues({ planned: '' }));
    const negative = validateBudgetCategoryForm(validValues({ actual: '-1' }));
    const overPrecise = validateBudgetCategoryForm(validValues({ planned: '12.345' }));
    const overCap = validateBudgetCategoryForm(validValues({ planned: '1,00,00,00,001' }));

    for (const result of [missing, negative, overPrecise, overCap]) {
      expect(result.ok).toBe(false);
    }

    if (!missing.ok) {
      expect(missing.errors.planned).toMatch(/planned amount/i);
    }

    if (!negative.ok) {
      expect(negative.errors.actual).toMatch(/actual amount/i);
    }
  });

  it('requires a minimum for flexible categories', () => {
    const result = validateBudgetCategoryForm(validValues({ minimum: '' }));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.minimum).toMatch(/enter a minimum/i);
    }
  });

  it('rejects a minimum above the planned amount', () => {
    const result = validateBudgetCategoryForm(
      validValues({ planned: '1,000', minimum: '1,000.01' }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors.minimum).toMatch(/cannot be higher/i);
    }
  });
});

describe('createCategoryFromForm', () => {
  it('builds an INR category from validated input', () => {
    const category = createCategoryFromForm(
      {
        name: 'Catering',
        plannedMinor: 500_000,
        actualMinor: 50_000,
        flexibility: {
          mode: 'flexible',
          minimumPlanned: { amountMinor: 300_000, currency: 'INR' },
        },
      },
      'category-catering',
    );

    expect(category).toEqual({
      id: 'category-catering',
      name: 'Catering',
      planned: { amountMinor: 500_000, currency: 'INR' },
      actual: { amountMinor: 50_000, currency: 'INR' },
      flexibility: {
        mode: 'flexible',
        minimumPlanned: { amountMinor: 300_000, currency: 'INR' },
      },
    });
  });

  it('includes notes only when provided', () => {
    const withoutNotes = createCategoryFromForm(
      {
        name: 'Venue',
        plannedMinor: 100,
        actualMinor: 0,
        flexibility: { mode: 'protected' },
      },
      'category-venue',
    );
    const withNotes = createCategoryFromForm(
      {
        name: 'Venue',
        plannedMinor: 100,
        actualMinor: 0,
        flexibility: { mode: 'protected' },
        notes: 'Deposit paid',
      },
      'category-venue',
    );

    expect(withoutNotes).not.toHaveProperty('notes');
    expect(withNotes.notes).toBe('Deposit paid');
  });
});
