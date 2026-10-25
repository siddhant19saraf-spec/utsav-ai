import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { BudgetCategory, EventBudget } from '@/types/budget';
import { makeBudget, makeCategory } from '@/test/fixtures';
import {
  toValidationResult,
  validateBudget,
  validateBudgetCategories,
  type BudgetValidationIssue,
} from './validation';

function codes(issues: readonly BudgetValidationIssue[]): string[] {
  return issues.map((entry) => entry.code);
}

function validBudget(): EventBudget {
  return makeBudget({
    totalAvailable: rupees(1_000),
    emergencyReserve: { enabled: true, target: rupees(100) },
    categories: [
      makeCategory({
        id: 'venue',
        name: 'Venue',
        planned: rupees(600),
        actual: rupees(100),
        flexibility: { mode: 'protected' },
      }),
      makeCategory({
        id: 'decor',
        name: 'Décor',
        planned: rupees(300),
        actual: rupees(100),
        flexibility: { mode: 'flexible', minimumPlanned: rupees(100) },
      }),
      makeCategory({
        id: 'emergency-reserve',
        name: 'Emergency reserve',
        planned: rupees(100),
        actual: rupees(0),
        flexibility: { mode: 'protected' },
      }),
    ],
  });
}

describe('validateBudget', () => {
  it('accepts a structurally valid, within-budget configuration', () => {
    expect(validateBudget(validBudget())).toEqual({
      errors: [],
      warnings: [],
      isValid: true,
    });
  });

  it('treats overruns as warnings so the budget can still be edited', () => {
    const budget = validBudget();
    const validation = validateBudget({
      ...budget,
      totalAvailable: rupees(500),
    });

    expect(validation.isValid).toBe(true);
    expect(codes(validation.warnings)).toEqual(
      expect.arrayContaining([
        'allocation-exceeds-budget',
        'protected-allocation-exceeds-budget',
      ]),
    );
  });

  it('warns separately when actual spend exceeds the plan or the budget', () => {
    const budget = validBudget();
    const validation = validateBudget({
      ...budget,
      categories: budget.categories.map((category) =>
        category.id === 'decor'
          ? { ...category, actual: rupees(1_100) }
          : category,
      ),
    });

    expect(validation.isValid).toBe(true);
    expect(codes(validation.warnings)).toEqual(
      expect.arrayContaining(['actual-exceeds-planned', 'actual-exceeds-budget']),
    );
  });

  it('rejects invalid totals and timestamps', () => {
    const validation = validateBudget({
      ...validBudget(),
      totalAvailable: { amountMinor: -1, currency: 'INR' },
      createdAt: 'not-a-date',
    });

    expect(validation.isValid).toBe(false);
    expect(codes(validation.errors)).toEqual(
      expect.arrayContaining(['invalid-total', 'invalid-timestamp']),
    );
  });
});

describe('validateBudgetCategories', () => {
  it('rejects duplicate identifiers', () => {
    const duplicate = makeCategory({ id: 'venue' });
    const issues = validateBudgetCategories([duplicate, { ...duplicate }]);

    expect(codes(issues)).toContain('duplicate-category-id');
  });

  it('rejects invalid identifiers, names, amounts, and protection modes', () => {
    const invalid = {
      ...makeCategory(),
      id: 'Not Valid',
      name: ' ',
      planned: { amountMinor: Number.NaN, currency: 'INR' },
      actual: { amountMinor: Number.POSITIVE_INFINITY, currency: 'INR' },
      flexibility: { mode: 'both' },
    } as unknown as BudgetCategory;

    const issues = validateBudgetCategories([invalid]);

    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        'invalid-category-id',
        'empty-category-name',
        'invalid-planned-amount',
        'invalid-actual-amount',
        'invalid-protection',
      ]),
    );
  });

  it('rejects a flexible minimum above the planned amount', () => {
    const issues = validateBudgetCategories([
      makeCategory({
        planned: rupees(100),
        flexibility: { mode: 'flexible', minimumPlanned: rupees(200) },
      }),
    ]);

    expect(codes(issues)).toContain('minimum-exceeds-planned');
  });

  it('rejects invalid minimums, long names, and long notes', () => {
    const issues = validateBudgetCategories([
      makeCategory({
        name: 'x'.repeat(81),
        notes: 'n'.repeat(401),
        flexibility: {
          mode: 'flexible',
          minimumPlanned: { amountMinor: Number.NaN, currency: 'INR' },
        },
      }),
    ]);

    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        'category-name-too-long',
        'notes-too-long',
        'invalid-minimum-allocation',
      ]),
    );
  });

  it('warns when actual spend exceeds the planned amount', () => {
    const issues = validateBudgetCategories([
      makeCategory({ planned: rupees(100), actual: rupees(150) }),
    ]);
    const warning = issues.find((entry) => entry.code === 'actual-exceeds-planned');

    expect(warning?.severity).toBe('warning');
  });
});

describe('emergency reserve validation', () => {
  it('requires a positive target and a protected reserve category when enabled', () => {
    const budget = validBudget();
    const validation = validateBudget({
      ...budget,
      emergencyReserve: { enabled: true, target: rupees(0) },
      categories: budget.categories.filter(
        (category) => category.id !== 'emergency-reserve',
      ),
    });

    expect(codes(validation.errors)).toEqual(
      expect.arrayContaining(['reserve-target-invalid', 'reserve-category-missing']),
    );
  });

  it('requires the reserve category to be protected', () => {
    const budget = validBudget();
    const validation = validateBudget({
      ...budget,
      categories: budget.categories.map((category) =>
        category.id === 'emergency-reserve'
          ? {
              ...category,
              flexibility: { mode: 'flexible', minimumPlanned: rupees(0) },
            }
          : category,
      ),
    });

    expect(codes(validation.errors)).toContain('reserve-category-not-protected');
  });

  it('warns when the reserve is underfunded or disabled with an allocation', () => {
    const underfunded = validBudget();
    const underfundedValidation = validateBudget({
      ...underfunded,
      emergencyReserve: { enabled: true, target: rupees(200) },
    });
    const shortfall = underfundedValidation.warnings.find(
      (entry) => entry.code === 'reserve-insufficient',
    );
    expect(shortfall?.severity).toBe('warning');

    const disabledValidation = validateBudget({
      ...underfunded,
      emergencyReserve: { enabled: false, target: rupees(100) },
    });
    expect(codes(disabledValidation.warnings)).toContain(
      'disabled-reserve-with-allocation',
    );
  });
});

describe('toValidationResult', () => {
  it('splits errors and warnings and marks validity from errors only', () => {
    const result = toValidationResult([
      {
        code: 'invalid-total',
        severity: 'error',
        message: 'Bad total.',
      },
      {
        code: 'allocation-exceeds-budget',
        severity: 'warning',
        message: 'Over budget.',
      },
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.isValid).toBe(false);
  });
});
