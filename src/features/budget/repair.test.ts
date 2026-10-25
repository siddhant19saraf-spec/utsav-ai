import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import { makeCategory } from '@/test/fixtures';
import { proposeBudgetRepair } from './repair';

function protectedCategory(
  id: string,
  plannedRupees: number,
  name = id,
): BudgetCategory {
  return makeCategory({
    id,
    name,
    planned: rupees(plannedRupees),
    flexibility: { mode: 'protected' },
  });
}

function flexibleCategory(
  id: string,
  plannedRupees: number,
  minimumRupees: number,
  name = id,
): BudgetCategory {
  return makeCategory({
    id,
    name,
    planned: rupees(plannedRupees),
    flexibility: { mode: 'flexible', minimumPlanned: rupees(minimumRupees) },
  });
}

function constrainedCategories(): BudgetCategory[] {
  return [
    protectedCategory('venue', 6_000, 'Venue'),
    flexibleCategory('decor', 3_000, 2_000, 'Décor'),
    flexibleCategory('catering', 2_000, 1_500, 'Catering'),
  ];
}

describe('proposeBudgetRepair', () => {
  it('proposes deterministic reductions from the largest reducible category first', () => {
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(10_000),
      categories: constrainedCategories(),
    });

    expect(proposal.feasible).toBe(true);
    expect(proposal.originalTotal).toEqual(rupees(11_000));
    expect(proposal.revisedTotal).toEqual(rupees(10_000));
    expect(proposal.totalReduced).toEqual(rupees(1_000));
    expect(proposal.shortfall).toEqual(rupees(0));
    expect(proposal.totalBudget).toEqual(rupees(10_000));
    expect(proposal.protectedPreserved).toBe(true);
    expect(proposal.unresolvedIssues).toEqual([]);
    expect(proposal.reductions).toEqual([
      {
        categoryId: 'decor',
        categoryName: 'Décor',
        originalPlanned: rupees(3_000),
        proposedPlanned: rupees(2_000),
        reduction: rupees(1_000),
      },
    ]);
  });

  it('never reduces protected categories or below flexible minimums', () => {
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(9_500),
      categories: constrainedCategories(),
    });

    expect(proposal.feasible).toBe(true);
    expect(proposal.protectedPreserved).toBe(true);
    expect(proposal.reductions.map((entry) => entry.categoryId)).toEqual([
      'decor',
      'catering',
    ]);
    expect(proposal.categories).toEqual([
      expect.objectContaining({
        id: 'venue',
        planned: rupees(6_000),
        flexibility: { mode: 'protected' },
      }),
      expect.objectContaining({
        id: 'decor',
        planned: rupees(2_000),
        flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
      }),
      expect.objectContaining({
        id: 'catering',
        planned: rupees(1_500),
        flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
      }),
    ]);
  });

  it('reduces only as much as needed', () => {
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(10_700),
      categories: constrainedCategories(),
    });

    expect(proposal.totalReduced).toEqual(rupees(300));
    expect(proposal.reductions).toEqual([
      expect.objectContaining({ categoryId: 'decor', reduction: rupees(300) }),
    ]);
  });

  it('breaks ties between equal reducible amounts by category identifier', () => {
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(900),
      categories: [
        protectedCategory('venue', 0),
        flexibleCategory('zebra', 500, 0),
        flexibleCategory('alpha', 500, 0),
      ],
    });

    expect(proposal.reductions.map((entry) => entry.categoryId)).toEqual(['alpha']);
    expect(proposal.reductions[0]?.reduction).toEqual(rupees(100));
  });

  it('reports an infeasible repair without pretending success', () => {
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(9_000),
      categories: constrainedCategories(),
    });

    expect(proposal.feasible).toBe(false);
    expect(proposal.revisedTotal).toEqual(rupees(9_500));
    expect(proposal.shortfall).toEqual(rupees(500));
    expect(proposal.protectedPreserved).toBe(true);
    expect(proposal.unresolvedIssues).toHaveLength(2);
    expect(proposal.explanation).toMatch(/no feasible repair exists/i);
  });

  it('does not mutate its input and returns cloned category objects', () => {
    const categories = constrainedCategories();
    const snapshot = JSON.parse(JSON.stringify(categories)) as unknown;
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(10_000),
      categories,
    });

    expect(categories).toEqual(snapshot);
    expect(proposal.categories).not.toBe(categories);
    expect(proposal.categories[0]).not.toBe(categories[0]);
    expect(proposal.categories[0]?.planned).not.toBe(categories[0]?.planned);
  });

  it('returns a no-op feasible proposal when already within budget', () => {
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(12_000),
      categories: constrainedCategories(),
    });

    expect(proposal.feasible).toBe(true);
    expect(proposal.reductions).toEqual([]);
    expect(proposal.revisedTotal).toEqual(proposal.originalTotal);
    expect(proposal.explanation).toMatch(/no reductions are needed/i);
  });

  it('rejects structurally invalid categories instead of proposing a repair', () => {
    const duplicate = protectedCategory('venue', 1_000);
    const proposal = proposeBudgetRepair({
      totalBudget: rupees(10_000),
      categories: [duplicate, { ...duplicate }],
    });

    expect(proposal.feasible).toBe(false);
    expect(proposal.unresolvedIssues.some((issue) => /used more than once/i.test(issue))).toBe(
      true,
    );
  });

  it('rejects an invalid total budget or unreadable amounts', () => {
    const invalidTotal = proposeBudgetRepair({
      totalBudget: { amountMinor: -1, currency: 'INR' },
      categories: constrainedCategories(),
    });
    expect(invalidTotal.feasible).toBe(false);
    expect(invalidTotal.unresolvedIssues).toContain(
      'The total budget is not a valid non-negative INR amount.',
    );

    const unreadable = proposeBudgetRepair({
      totalBudget: rupees(10_000),
      categories: [
        makeCategory({
          planned: { amountMinor: Number.NaN, currency: 'INR' },
        }),
      ],
    });
    expect(unreadable.feasible).toBe(false);
  });
});
