import { formatMoney, isValidMoney } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import type { Money } from '@/types/domain';
import { validateBudgetCategories } from './validation';

export interface BudgetRepairInput {
  readonly totalBudget: Money;
  readonly categories: readonly BudgetCategory[];
}

export interface BudgetRepairReduction {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly originalPlanned: Money;
  readonly proposedPlanned: Money;
  readonly reduction: Money;
}

export interface BudgetRepairProposal {
  readonly feasible: boolean;
  readonly totalBudget: Money;
  /** Total planned expenditure before any proposal. */
  readonly originalTotal: Money;
  /** Total planned expenditure after the deterministic reductions. */
  readonly revisedTotal: Money;
  readonly totalReduced: Money;
  readonly shortfall: Money;
  readonly categories: readonly BudgetCategory[];
  readonly reductions: readonly BudgetRepairReduction[];
  readonly protectedPreserved: boolean;
  readonly unresolvedIssues: readonly string[];
  readonly explanation: string;
}

interface FlexibleCandidate {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly plannedMinor: number;
  readonly minimumMinor: number;
  readonly reducibleMinor: number;
}

function inr(amountMinor: number): Money {
  return { amountMinor, currency: 'INR' };
}

function addSafe(total: number, value: number): number {
  const next = total + value;

  if (!Number.isSafeInteger(next)) {
    throw new RangeError('Budget totals exceed the maximum safe integer range.');
  }

  return next;
}

function cloneCategory(category: BudgetCategory): BudgetCategory {
  return {
    ...category,
    planned: { ...category.planned },
    actual: { ...category.actual },
    flexibility:
      category.flexibility.mode === 'flexible'
        ? {
            mode: 'flexible',
            minimumPlanned: { ...category.flexibility.minimumPlanned },
          }
        : { mode: 'protected' },
  };
}

function sumPlanned(categories: readonly BudgetCategory[]): number | null {
  let total = 0;

  for (const category of categories) {
    if (!isValidMoney(category.planned) || category.planned.currency !== 'INR') {
      return null;
    }

    const next = total + category.planned.amountMinor;

    if (!Number.isSafeInteger(next)) {
      return null;
    }

    total = next;
  }

  return total;
}

function buildFailure(
  input: BudgetRepairInput,
  originalMinor: number,
  issues: readonly string[],
): BudgetRepairProposal {
  const shortfallMinor =
    isValidMoney(input.totalBudget) && input.totalBudget.currency === 'INR'
      ? Math.max(0, originalMinor - input.totalBudget.amountMinor)
      : 0;

  return {
    feasible: false,
    totalBudget: input.totalBudget,
    originalTotal: inr(originalMinor),
    revisedTotal: inr(originalMinor),
    totalReduced: inr(0),
    shortfall: inr(shortfallMinor),
    categories: [...input.categories],
    reductions: [],
    protectedPreserved: true,
    unresolvedIssues: issues,
    explanation: `No feasible repair was proposed. ${issues.join(' ')}`,
  };
}

/**
 * Greedy repair: reduce flexible categories with the largest reducible amount
 * first until the planned total fits the unchanged budget. Categories are
 * ordered by reducible amount descending, then by category identifier for a
 * deterministic tie-break. Protected categories and flexible minimums are
 * hard constraints. This is a feasible allocation repair, not a claim of
 * global financial optimality.
 */
export function proposeBudgetRepair(input: BudgetRepairInput): BudgetRepairProposal {
  const validationIssues = validateBudgetCategories(input.categories);
  const blockingIssues = validationIssues.filter(
    (validationIssue) => validationIssue.severity === 'error',
  );
  const originalMinor = sumPlanned(input.categories);

  if (blockingIssues.length > 0 || originalMinor === null) {
    return buildFailure(input, originalMinor ?? 0, [
      ...blockingIssues.map((entry) => entry.message),
      ...(originalMinor === null
        ? ['Planned category totals could not be added safely.']
        : []),
    ]);
  }

  if (!isValidMoney(input.totalBudget) || input.totalBudget.currency !== 'INR') {
    return buildFailure(input, originalMinor, [
      'The total budget is not a valid non-negative INR amount.',
    ]);
  }

  const totalMinor = input.totalBudget.amountMinor;
  const overageMinor = originalMinor - totalMinor;

  if (overageMinor <= 0) {
    return {
      feasible: true,
      totalBudget: input.totalBudget,
      originalTotal: inr(originalMinor),
      revisedTotal: inr(originalMinor),
      totalReduced: inr(0),
      shortfall: inr(0),
      categories: input.categories.map(cloneCategory),
      reductions: [],
      protectedPreserved: true,
      unresolvedIssues: [],
      explanation:
        'The current planned allocations already fit the total budget, so no reductions are needed.',
    };
  }

  const candidates: FlexibleCandidate[] = [];

  for (const category of input.categories) {
    if (category.flexibility.mode !== 'flexible') {
      continue;
    }

    const plannedMinor = category.planned.amountMinor;
    const minimumMinor = category.flexibility.minimumPlanned.amountMinor;

    candidates.push({
      categoryId: category.id,
      categoryName: category.name,
      plannedMinor,
      minimumMinor,
      reducibleMinor: Math.max(0, plannedMinor - minimumMinor),
    });
  }

  candidates.sort((first, second) => {
    if (first.reducibleMinor !== second.reducibleMinor) {
      return second.reducibleMinor - first.reducibleMinor;
    }

    return first.categoryId.localeCompare(second.categoryId);
  });

  let remainingOverage = overageMinor;
  const proposedByCategory = new Map<string, number>();

  for (const candidate of candidates) {
    if (remainingOverage <= 0) {
      break;
    }

    const reduction = Math.min(candidate.reducibleMinor, remainingOverage);

    if (reduction <= 0) {
      continue;
    }

    proposedByCategory.set(candidate.categoryId, candidate.plannedMinor - reduction);
    remainingOverage -= reduction;
  }

  const proposedCategories = input.categories.map((category) => {
    const proposedPlannedMinor = proposedByCategory.get(category.id);

    if (typeof proposedPlannedMinor === 'undefined') {
      return cloneCategory(category);
    }

    return { ...cloneCategory(category), planned: inr(proposedPlannedMinor) };
  });

  const reductions: BudgetRepairReduction[] = input.categories
    .filter((category) => proposedByCategory.has(category.id))
    .map((category) => {
      const proposedMinor = proposedByCategory.get(category.id) ?? category.planned.amountMinor;

      return {
        categoryId: category.id,
        categoryName: category.name,
        originalPlanned: { ...category.planned },
        proposedPlanned: inr(proposedMinor),
        reduction: inr(category.planned.amountMinor - proposedMinor),
      };
    });

  const revisedMinor = proposedCategories.reduce(
    (total, category) => addSafe(total, category.planned.amountMinor),
    0,
  );
  const shortfallMinor = Math.max(0, revisedMinor - totalMinor);
  const feasible = shortfallMinor === 0;
  const protectedPreserved = input.categories
    .filter((category) => category.flexibility.mode === 'protected')
    .every((category) => {
      const proposed = proposedCategories.find((entry) => entry.id === category.id);
      return proposed?.planned.amountMinor === category.planned.amountMinor;
    });

  const unresolvedIssues = feasible
    ? []
    : [
        `The plan remains ${formatMoney(inr(shortfallMinor))} over budget.`,
        'Protected categories cannot be reduced, and flexible categories are already at their configured minimum allocations.',
      ];

  const explanation = feasible
    ? `Reduced ${reductions.length} flexible categor${reductions.length === 1 ? 'y' : 'ies'} by ${formatMoney(inr(originalMinor - revisedMinor))}. Protected categories and flexible minimums were preserved, and the total budget was not changed.`
    : `No feasible repair exists with these constraints. ${unresolvedIssues.join(' ')}`;

  return {
    feasible,
    totalBudget: input.totalBudget,
    originalTotal: inr(originalMinor),
    revisedTotal: inr(revisedMinor),
    totalReduced: inr(originalMinor - revisedMinor),
    shortfall: inr(shortfallMinor),
    categories: proposedCategories,
    reductions,
    protectedPreserved,
    unresolvedIssues,
    explanation,
  };
}
