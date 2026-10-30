import { calculateBudgetTotals, type BudgetTotals } from '@/features/budget/calculations';
import { validateBudget } from '@/features/budget/validation';
import { formatCount } from '@/lib/format';
import { isValidMoney } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import type { CelebrationEvent } from '@/types/domain';
import type { RiskSeverity } from '@/types/risk';
import type { RiskThresholds } from './riskConfig';
import type { RiskAnalysisError, RiskDetection } from './riskTypes';
import {
  analysisError,
  detection,
  entity,
  evidence,
  formatInr,
  percent,
} from './riskDetectorSupport';

/**
 * Maximum amount that flexible categories could give up without crossing their
 * saved minimums. Returns null when the saved values cannot be treated safely.
 */
function flexibleReductionCapacity(
  categories: readonly BudgetCategory[],
): number | null {
  let capacity = 0;

  for (const category of categories) {
    if (category.flexibility.mode !== 'flexible') {
      continue;
    }

    if (
      !isValidMoney(category.planned) ||
      category.planned.currency !== 'INR' ||
      !isValidMoney(category.flexibility.minimumPlanned) ||
      category.flexibility.minimumPlanned.currency !== 'INR'
    ) {
      return null;
    }

    const gap =
      category.planned.amountMinor - category.flexibility.minimumPlanned.amountMinor;

    if (gap < 0) {
      return null;
    }

    capacity += gap;

    if (!Number.isSafeInteger(capacity)) {
      return null;
    }
  }

  return capacity;
}

interface BudgetAnalysis {
  readonly detections: readonly RiskDetection[];
  readonly errors: readonly RiskAnalysisError[];
  readonly totals: BudgetTotals | null;
}

export function analyzeBudget(
  event: CelebrationEvent,
  thresholds: RiskThresholds,
): BudgetAnalysis {
  const detections: RiskDetection[] = [];
  const errors: RiskAnalysisError[] = [];
  const validation = validateBudget(event.budget);
  let totals: BudgetTotals | null = null;

  try {
    totals = calculateBudgetTotals(event.budget);
  } catch {
    errors.push(
      analysisError(
        event,
        'financial.budget-invalid',
        'The saved budget could not be totalled safely; financial checks were limited.',
      ),
    );
  }

  if (validation.errors.length > 0 || totals === null) {
    const issues = validation.errors.slice(0, 3).map((issue) => issue.message);

    detections.push(
      detection(event, 'financial.budget-invalid', {
        category: 'financial',
        severity: 'critical',
        certainty: 'confirmed',
        title: 'Saved budget data is invalid',
        explanation:
          'Some saved budget values cannot be used for reliable totals. Financial risks may be understated until these values are corrected.',
        evidence: [
          evidence(
            'Validation errors',
            `${formatCount(validation.errors.length)} found`,
          ),
          ...issues.map((message) => evidence('Issue', message)),
        ],
        recommendedAction:
          'Open the Budget Planner, correct the highlighted category amounts or reserve configuration, and review the recalculated totals. Nothing was changed automatically.',
        relatedEntities: [entity('event', event.id), entity('budget', event.budget.id)],
        sourceModule: 'budget-engine',
      }),
    );
  }

  if (!totals) {
    return { detections, errors, totals };
  }

  const totalMinor = totals.totalBudget.amountMinor;

  if (totals.isOverBudget) {
    const overrunPercent = percent(totals.overrun.amountMinor, totalMinor);
    const protectedExceedsTotal = totals.protectedPlanned.amountMinor > totalMinor;
    const severity: RiskSeverity =
      overrunPercent >= thresholds.criticalOverrunPercent || protectedExceedsTotal
        ? 'critical'
        : 'high';

    detections.push(
      detection(event, 'financial.planned-overrun', {
        category: 'financial',
        severity,
        certainty: 'confirmed',
        title: 'Planned spending exceeds the total budget',
        explanation:
          'Planned category allocations add up to more than the saved total budget. Every allocation must fit the ceiling before commitments are made.',
        evidence: [
          evidence('Total budget', formatInr(totalMinor)),
          evidence('Planned spending', formatInr(totals.planned.amountMinor)),
          evidence('Overrun', formatInr(totals.overrun.amountMinor)),
          evidence('Overrun share', `${overrunPercent}%`),
          evidence('Protected allocations', formatInr(totals.protectedPlanned.amountMinor)),
        ],
        recommendedAction:
          'Reduce planned amounts for flexible categories in the Budget Planner or explicitly raise the total budget. Event Rescue can propose deterministic reductions, but it never applies them without your approval.',
        relatedEntities: [entity('event', event.id), entity('budget', event.budget.id)],
        sourceModule: 'budget-engine',
      }),
    );

    const capacity = flexibleReductionCapacity(event.budget.categories);

    if (capacity !== null && capacity < totals.overrun.amountMinor) {
      const gap = totals.overrun.amountMinor - capacity;

      detections.push(
        detection(event, 'financial.protected-reduction-required', {
          category: 'financial',
          severity: 'high',
          certainty: 'confirmed',
          title: 'Protected categories would need to be reduced',
          explanation:
            'Even after using every flexible reduction down to its saved minimum, the plan would still exceed the total budget. Closing the gap would require cutting protected categories or minimums, which automatic repair must not do.',
          evidence: [
            evidence('Overrun', formatInr(totals.overrun.amountMinor)),
            evidence('Maximum flexible reduction', formatInr(capacity)),
            evidence('Remaining gap', formatInr(gap)),
            evidence('Protected allocations', formatInr(totals.protectedPlanned.amountMinor)),
          ],
          recommendedAction:
            'Decide explicitly whether to add budget or change a category’s protection in the Budget Planner. Event Rescue will not reduce protected categories or flexible minimums on its own.',
          relatedEntities: [
            entity('event', event.id),
            entity('budget', event.budget.id),
          ],
          sourceModule: 'budget-engine',
        }),
      );
    }
  }

  if (totals.overspending.actualExceedsBudget) {
    detections.push(
      detection(event, 'financial.actual-overrun', {
        category: 'financial',
        severity: 'high',
        certainty: 'confirmed',
        title: 'Recorded actual spend exceeds the total budget',
        explanation:
          'Actual amounts already recorded across categories are above the saved total budget. This is spending that has happened, not a projection.',
        evidence: [
          evidence('Total budget', formatInr(totalMinor)),
          evidence('Actual spend', formatInr(totals.actual.amountMinor)),
          evidence(
            'Excess',
            formatInr(totals.actual.amountMinor - totalMinor),
          ),
        ],
        recommendedAction:
          'Review the recorded actual amounts in the Budget Planner and reconcile invoices. Increase the budget only if that is a genuine decision; do not adjust actual spend to hide the overrun.',
        relatedEntities: [entity('event', event.id), entity('budget', event.budget.id)],
        sourceModule: 'budget-engine',
      }),
    );
  }

  const reserve = totals.reserve;

  if (reserve.configured && reserve.shortfall.amountMinor > 0) {
    const shortfallPercent = percent(
      reserve.shortfall.amountMinor,
      reserve.target.amountMinor,
    );
    const severity: RiskSeverity =
      reserve.allocated.amountMinor === 0 ||
      shortfallPercent >= thresholds.reserveShortfallHighPercent
        ? 'high'
        : 'medium';

    detections.push(
      detection(event, 'financial.reserve-shortfall', {
        category: 'financial',
        severity,
        certainty: 'confirmed',
        title: 'Emergency reserve is below its target',
        explanation:
          'The reserve is enabled, but its protected allocation is below the configured target. The reserve is part of the budget, not extra money.',
        evidence: [
          evidence('Reserve target', formatInr(reserve.target.amountMinor)),
          evidence('Reserve allocated', formatInr(reserve.allocated.amountMinor)),
          evidence('Shortfall', formatInr(reserve.shortfall.amountMinor)),
          evidence('Share below target', `${shortfallPercent}%`),
        ],
        recommendedAction:
          'Fund the reserve from flexible categories in the Budget Planner, or lower the target in an explicit decision. The reserve must remain protected.',
        relatedEntities: [
          entity('event', event.id),
          entity('budget', event.budget.id),
          entity('budget-category', 'emergency-reserve'),
        ],
        sourceModule: 'budget-engine',
      }),
    );
  }

  return { detections, errors, totals };
}
