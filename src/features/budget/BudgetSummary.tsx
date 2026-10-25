import {
  AlertTriangle,
  CheckCircle2,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import { SummaryCard } from '@/components/SummaryCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatMoney } from '@/lib/money';
import type { EventBudget } from '@/types/budget';
import type { BudgetTotals } from './calculations';
import type { BudgetValidationResult } from './validation';

interface BudgetSummaryProps {
  readonly budget: EventBudget;
  readonly totals: BudgetTotals;
  readonly validation: BudgetValidationResult;
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

export function BudgetSummary({ budget, totals, validation }: BudgetSummaryProps) {
  const remainingLabel = totals.isOverBudget ? 'Over budget' : 'Remaining available';
  const remainingValue = totals.isOverBudget
    ? formatMoney(totals.overrun)
    : formatMoney(totals.remaining);
  const validationIssues = [...validation.errors, ...validation.warnings];
  const reserveFunded = totals.reserve.allocated.amountMinor >= totals.reserve.target.amountMinor;

  return (
    <div className="space-y-5">
      <section
        aria-label="Budget summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4"
      >
        <SummaryCard
          label="Total budget"
          value={formatMoney(totals.totalBudget)}
          detail="Available for this event"
          icon={Wallet}
          accent="maroon"
        />
        <SummaryCard
          label="Planned expenditure"
          value={formatMoney(totals.planned)}
          detail="Allocated across expense categories"
          icon={ReceiptText}
          accent="gold"
        />
        <SummaryCard
          label="Actual expenditure"
          value={formatMoney(totals.actual)}
          detail="Recorded spend, not planned amounts"
          icon={PiggyBank}
          accent="slate"
        />
        <SummaryCard
          label={remainingLabel}
          value={remainingValue}
          detail={
            totals.isOverBudget
              ? `Planned allocations exceed the budget by ${formatMoney(totals.overrun)}`
              : totals.variance.amountMinor >= 0
                ? `${formatMoney(totals.variance)} of plan not yet spent`
                : `${formatMoney({
                    amountMinor: -totals.variance.amountMinor,
                    currency: 'INR',
                  })} spent above plan`
          }
          icon={AlertTriangle}
          accent={totals.isOverBudget ? 'maroon' : 'sage'}
        />
      </section>

      {totals.isOverBudget ? (
        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3.5 text-sm text-rust-700"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="leading-relaxed">
            <strong className="font-semibold">Budget overrun:</strong> planned expenditure is{' '}
            {formatMoney(totals.overrun)} above the total budget. Repair options can reduce
            flexible categories without touching protected allocations.
          </p>
        </div>
      ) : null}

      <section className="surface-card p-5 sm:p-6" aria-labelledby="budget-utilization-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Budget health</p>
            <h2 id="budget-utilization-heading" className="mt-1 text-xl font-semibold text-ink">
              Utilization and safeguards
            </h2>
          </div>
          <StatusBadge
            tone={totals.isOverBudget ? 'danger' : 'success'}
            showDot={false}
          >
            {totals.isOverBudget ? 'Over budget' : 'Within budget'}
          </StatusBadge>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p className="font-semibold text-ink">Budget utilization</p>
              <p className="font-semibold text-ink tabular-nums">{totals.utilizationPercent}%</p>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-canvas-deep"
              role="progressbar"
              aria-label="Planned budget utilization"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clampPercent(totals.utilizationPercent)}
              aria-valuetext={`${totals.utilizationPercent}% of the total budget planned`}
            >
              <div
                className={`h-full rounded-full ${
                  totals.isOverBudget ? 'bg-rust-600' : 'bg-maroon-700'
                }`}
                style={{ width: `${clampPercent(totals.utilizationPercent)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              {formatMoney(totals.planned)} of {formatMoney(totals.totalBudget)} planned.
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p className="font-semibold text-ink">Actual spend against budget</p>
              <p className="font-semibold text-ink tabular-nums">
                {totals.actualUtilizationPercent}%
              </p>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-canvas-deep"
              role="progressbar"
              aria-label="Actual expenditure against total budget"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clampPercent(totals.actualUtilizationPercent)}
              aria-valuetext={`${formatMoney(totals.actual)} spent of ${formatMoney(totals.totalBudget)}`}
            >
              <div
                className="h-full rounded-full bg-sage-600"
                style={{ width: `${clampPercent(totals.actualUtilizationPercent)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              Actual spend is money already recorded. It does not replace planned allocations.
            </p>
          </div>

          <dl className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-2xl border border-maroon-100 bg-maroon-50/60 p-3.5">
              <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-maroon-700 uppercase">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Protected
              </dt>
              <dd className="mt-1.5 text-sm font-semibold text-ink tabular-nums">
                {formatMoney(totals.protectedPlanned)}
              </dd>
              <dd className="mt-1 text-[0.6875rem] leading-relaxed text-ink-muted">
                Never reduced automatically
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
              <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-muted uppercase">
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                Flexible
              </dt>
              <dd className="mt-1.5 text-sm font-semibold text-ink tabular-nums">
                {formatMoney(totals.flexiblePlanned)}
              </dd>
              <dd className="mt-1 text-[0.6875rem] leading-relaxed text-ink-muted">
                Reducible down to category minimums
              </dd>
            </div>
            <div className="rounded-2xl border border-gold-200 bg-gold-50/70 p-3.5">
              <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-gold-700 uppercase">
                {reserveFunded && totals.reserve.configured ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <PiggyBank className="size-3.5" aria-hidden="true" />
                )}
                Emergency reserve
              </dt>
              <dd className="mt-1.5 text-sm font-semibold text-ink tabular-nums">
                {budget.emergencyReserve.enabled
                  ? `${formatMoney(totals.reserve.allocated)} of ${formatMoney(totals.reserve.target)}`
                  : 'Not configured'}
              </dd>
              <dd className="mt-1 text-[0.6875rem] leading-relaxed text-ink-muted">
                {!budget.emergencyReserve.enabled
                  ? 'Included in the budget only when enabled'
                  : totals.reserve.shortfall.amountMinor > 0
                    ? `${formatMoney(totals.reserve.shortfall)} below target`
                    : 'Target met and protected'}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6" aria-labelledby="budget-checks-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Deterministic checks</p>
            <h2 id="budget-checks-heading" className="mt-1 text-lg font-semibold text-ink">
              Validation summary
            </h2>
          </div>
          <StatusBadge tone={validation.isValid ? 'success' : 'danger'} showDot={false}>
            {validation.isValid ? 'Configuration valid' : 'Configuration errors'}
          </StatusBadge>
        </div>

        {validationIssues.length === 0 ? (
          <p className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-sage-700"
              aria-hidden="true"
            />
            No budget issues detected. Category amounts, protection rules, and reserve settings
            pass the current checks.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {validationIssues.map((entry, index) => (
              <li
                key={`${entry.code}-${entry.categoryId ?? 'budget'}-${index}`}
                className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-muted px-3.5 py-3 text-xs leading-relaxed text-ink-muted sm:flex-row sm:items-start sm:gap-2.5"
              >
                <StatusBadge
                  tone={entry.severity === 'error' ? 'danger' : 'warning'}
                  showDot={false}
                >
                  {entry.severity === 'error' ? 'Error' : 'Warning'}
                </StatusBadge>
                <span className="pt-0.5">{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
