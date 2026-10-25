import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import { makeBudget, makeCategory } from '@/test/fixtures';
import {
  calculateActualExpenses,
  calculateBudgetTotals,
  calculateBudgetUtilization,
  calculateBudgetVariance,
  calculateCategoryVariance,
  calculateEmergencyReserve,
  calculateRemainingBudget,
  calculateTotalPlanned,
  detectOverspending,
  isOverBudget,
  isValidBudgetAmount,
} from './calculations';

function category(plannedMinor: number, actualMinor: number): BudgetCategory {
  return makeCategory({
    planned: { amountMinor: plannedMinor, currency: 'INR' },
    actual: { amountMinor: actualMinor, currency: 'INR' },
  });
}

describe('calculateTotalPlanned and calculateActualExpenses', () => {
  it('sums integer paise without currency rounding drift', () => {
    const categories = [category(1_001, 11), category(2_050, 29), category(3, 0)];

    expect(calculateTotalPlanned(categories)).toEqual({
      amountMinor: 3_054,
      currency: 'INR',
    });
    expect(calculateActualExpenses(categories)).toEqual({
      amountMinor: 40,
      currency: 'INR',
    });
  });

  it('returns zero for empty category lists', () => {
    expect(calculateTotalPlanned([])).toEqual({ amountMinor: 0, currency: 'INR' });
    expect(calculateActualExpenses([])).toEqual({ amountMinor: 0, currency: 'INR' });
  });

  it.each([
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['fractional', 10.5],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects %s planned amounts', (_label, amountMinor) => {
    expect(() => calculateTotalPlanned([category(amountMinor, 0)])).toThrow(RangeError);
  });

  it('rejects negative actual amounts and non-INR currencies', () => {
    expect(() => calculateActualExpenses([category(0, -1)])).toThrow(RangeError);
    expect(() =>
      calculateTotalPlanned([
        makeCategory({ planned: { amountMinor: 100, currency: 'USD' } }),
      ]),
    ).toThrow(RangeError);
  });

  it('rejects totals that exceed the safe integer range', () => {
    expect(() =>
      calculateTotalPlanned([
        category(Number.MAX_SAFE_INTEGER, 0),
        category(1, 0),
      ]),
    ).toThrow(RangeError);
  });
});

describe('calculateRemainingBudget', () => {
  it('subtracts planned expenditure from the total budget', () => {
    expect(calculateRemainingBudget(rupees(1_000), rupees(300))).toEqual(rupees(700));
  });

  it('returns a negative remaining amount when over budget', () => {
    expect(calculateRemainingBudget(rupees(1_000), rupees(1_250))).toEqual(rupees(-250));
  });

  it('handles a zero budget and rejects invalid inputs', () => {
    expect(calculateRemainingBudget(rupees(0), rupees(0))).toEqual(rupees(0));
    expect(() => calculateRemainingBudget(rupees(0), rupees(-1))).toThrow(RangeError);
    expect(() =>
      calculateRemainingBudget(
        { amountMinor: Number.NaN, currency: 'INR' },
        rupees(0),
      ),
    ).toThrow(RangeError);
  });
});

describe('calculateBudgetUtilization', () => {
  it('calculates rounded percentages against the total budget', () => {
    expect(calculateBudgetUtilization(rupees(1_000), rupees(500))).toBe(50);
    expect(calculateBudgetUtilization(rupees(1_000), rupees(999))).toBe(100);
    expect(calculateBudgetUtilization(rupees(1_000), rupees(1_001))).toBe(100);
    expect(calculateBudgetUtilization({ amountMinor: 3, currency: 'INR' }, { amountMinor: 1, currency: 'INR' })).toBe(33);
  });

  it('defines zero-budget behavior explicitly', () => {
    expect(calculateBudgetUtilization(rupees(0), rupees(0))).toBe(0);
    expect(calculateBudgetUtilization(rupees(0), rupees(100))).toBe(100);
  });

  it('rejects invalid inputs', () => {
    expect(() =>
      calculateBudgetUtilization(
        { amountMinor: Number.POSITIVE_INFINITY, currency: 'INR' },
        rupees(1),
      ),
    ).toThrow(RangeError);
  });
});

describe('isOverBudget and detectOverspending', () => {
  it('detects planned overruns but treats equality as within budget', () => {
    expect(isOverBudget(rupees(1_000), rupees(1_001))).toBe(true);
    expect(isOverBudget(rupees(1_000), rupees(1_000))).toBe(false);
    expect(isOverBudget(rupees(1_000), rupees(999))).toBe(false);
  });

  it('reports planned, actual, and plan-based overspending separately', () => {
    expect(detectOverspending(rupees(1_000), rupees(1_200), rupees(1_300))).toEqual({
      plannedExceedsBudget: true,
      actualExceedsBudget: true,
      actualExceedsPlan: true,
    });
    expect(detectOverspending(rupees(1_000), rupees(500), rupees(600))).toEqual({
      plannedExceedsBudget: false,
      actualExceedsBudget: false,
      actualExceedsPlan: true,
    });
  });
});

describe('variance calculations', () => {
  it('calculates planned minus actual across categories', () => {
    expect(
      calculateBudgetVariance([category(100_000, 40_000), category(50_000, 55_000)]),
    ).toEqual(rupees(550));
  });

  it('returns a negative variance when actual spend exceeds plan', () => {
    expect(calculateBudgetVariance([category(10_000, 15_000)])).toEqual(rupees(-50));
    expect(calculateCategoryVariance(category(10_000, 15_000))).toEqual(rupees(-50));
  });
});

describe('calculateEmergencyReserve', () => {
  it('reports the target, protected allocation, and shortfall', () => {
    const budget = makeBudget({
      totalAvailable: rupees(1_000),
      emergencyReserve: { enabled: true, target: rupees(200) },
      categories: [
        makeCategory({
          id: 'emergency-reserve',
          name: 'Emergency reserve',
          planned: rupees(150),
          flexibility: { mode: 'protected' },
        }),
      ],
    });

    expect(calculateEmergencyReserve(budget)).toEqual({
      configured: true,
      target: rupees(200),
      allocated: rupees(150),
      shortfall: rupees(50),
      isProtected: true,
    });
  });

  it('reports a met target and an unconfigured reserve honestly', () => {
    const funded = makeBudget({
      emergencyReserve: { enabled: true, target: rupees(100) },
      categories: [
        makeCategory({
          id: 'emergency-reserve',
          name: 'Emergency reserve',
          planned: rupees(100),
          flexibility: { mode: 'protected' },
        }),
      ],
    });
    expect(calculateEmergencyReserve(funded).shortfall).toEqual(rupees(0));

    expect(calculateEmergencyReserve(makeBudget())).toEqual({
      configured: false,
      target: rupees(0),
      allocated: rupees(0),
      shortfall: rupees(0),
      isProtected: false,
    });
  });

  it('rejects an invalid target instead of guessing', () => {
    const budget = makeBudget({
      emergencyReserve: {
        enabled: true,
        target: { amountMinor: Number.NaN, currency: 'INR' },
      },
    });
    expect(() => calculateEmergencyReserve(budget)).toThrow(RangeError);
  });
});

describe('calculateBudgetTotals', () => {
  const budget = makeBudget({
    totalAvailable: rupees(1_000),
    emergencyReserve: { enabled: true, target: rupees(100) },
    categories: [
      makeCategory({
        id: 'venue',
        name: 'Venue',
        planned: rupees(600),
        actual: rupees(200),
        flexibility: { mode: 'protected' },
      }),
      makeCategory({
        id: 'decor',
        name: 'Décor',
        planned: rupees(300),
        actual: rupees(400),
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

  it('combines totals, protection, reserve, and overspending flags', () => {
    const totals = calculateBudgetTotals(budget);

    expect(totals.totalBudget).toEqual(rupees(1_000));
    expect(totals.planned).toEqual(rupees(1_000));
    expect(totals.actual).toEqual(rupees(600));
    expect(totals.remaining).toEqual(rupees(0));
    expect(totals.overrun).toEqual(rupees(0));
    expect(totals.isOverBudget).toBe(false);
    expect(totals.utilizationPercent).toBe(100);
    expect(totals.actualUtilizationPercent).toBe(60);
    expect(totals.variance).toEqual(rupees(400));
    expect(totals.protectedPlanned).toEqual(rupees(700));
    expect(totals.flexiblePlanned).toEqual(rupees(300));
    expect(totals.reserve.allocated).toEqual(rupees(100));
    expect(totals.overspending).toEqual({
      plannedExceedsBudget: false,
      actualExceedsBudget: false,
      actualExceedsPlan: false,
    });
  });

  it('reports overrun and remaining consistently when planned exceeds the budget', () => {
    const totals = calculateBudgetTotals(
      makeBudget({
        totalAvailable: rupees(500),
        categories: [category(60_000, 0)],
      }),
    );

    expect(totals.isOverBudget).toBe(true);
    expect(totals.remaining).toEqual(rupees(-100));
    expect(totals.overrun).toEqual(rupees(100));
    expect(totals.utilizationPercent).toBe(120);
  });

  it('handles a zero budget without dividing by zero', () => {
    const noSpend = calculateBudgetTotals(makeBudget({ totalAvailable: rupees(0) }));
    expect(noSpend.utilizationPercent).toBe(0);
    expect(noSpend.actualUtilizationPercent).toBe(0);

    const spendWithoutBudget = calculateBudgetTotals(
      makeBudget({
        totalAvailable: rupees(0),
        categories: [category(0, 100)],
      }),
    );
    expect(spendWithoutBudget.actualUtilizationPercent).toBe(100);
    expect(spendWithoutBudget.overspending.actualExceedsBudget).toBe(true);
  });

  it('rejects malformed category amounts rather than returning fake totals', () => {
    expect(() =>
      calculateBudgetTotals(
        makeBudget({ categories: [category(Number.NaN, 0)] }),
      ),
    ).toThrow(RangeError);
  });
});

describe('isValidBudgetAmount', () => {
  it('accepts only non-negative safe integers', () => {
    expect(isValidBudgetAmount(0)).toBe(true);
    expect(isValidBudgetAmount(100)).toBe(true);
    expect(isValidBudgetAmount(-1)).toBe(false);
    expect(isValidBudgetAmount(1.5)).toBe(false);
    expect(isValidBudgetAmount(Number.NaN)).toBe(false);
    expect(isValidBudgetAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidBudgetAmount('100')).toBe(false);
  });
});
