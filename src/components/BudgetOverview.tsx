import { AlertTriangle, ArrowRight, PieChart, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '@/lib/money';
import type { BudgetProtectionStatus } from '@/types/budget';
import type { Money } from '@/types/domain';
import { StatusBadge } from './StatusBadge';

export interface BudgetOverviewAllocation {
  readonly key: string;
  readonly label: string;
  readonly planned: Money;
  readonly actual: Money;
  readonly protection: BudgetProtectionStatus;
}

interface BudgetOverviewProps {
  readonly scopeLabel: string;
  readonly budgetHref: string;
  readonly totalBudget: Money;
  readonly plannedExpenses: Money;
  readonly actualExpenses: Money;
  readonly remaining: Money;
  readonly overrun: Money;
  readonly usagePercent: number;
  readonly isOverBudget: boolean;
  readonly allocations: readonly BudgetOverviewAllocation[];
  readonly protectedPlanned: Money;
  readonly flexiblePlanned: Money;
  readonly reservePlanned: Money;
  readonly reserveTarget: Money;
  readonly reserveConfigured: boolean;
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function protectionLabel(protection: BudgetProtectionStatus): string {
  if (protection === 'protected') {
    return 'Protected';
  }

  if (protection === 'flexible') {
    return 'Flexible';
  }

  return 'Mixed';
}

export function BudgetOverview({
  scopeLabel,
  budgetHref,
  totalBudget,
  plannedExpenses,
  actualExpenses,
  remaining,
  overrun,
  usagePercent,
  isOverBudget,
  allocations,
  protectedPlanned,
  flexiblePlanned,
  reservePlanned,
  reserveTarget,
  reserveConfigured,
}: BudgetOverviewProps) {
  const headingId = useId();
  const remainingDisplay = isOverBudget
    ? overrun
    : { amountMinor: Math.abs(remaining.amountMinor), currency: remaining.currency };
  const barPercent = clampPercent(usagePercent);
  const reserveFunded = reserveConfigured && reservePlanned.amountMinor >= reserveTarget.amountMinor;

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Money in view</p>
          <h2 id={headingId} className="mt-1 text-xl font-semibold text-ink">
            Budget overview
          </h2>
          <p className="mt-1 text-xs text-ink-muted">{scopeLabel}</p>
        </div>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-gold-200 bg-gold-50 text-gold-700"
          aria-hidden="true"
        >
          <PieChart className="size-5" strokeWidth={1.7} />
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-ink-muted">Planned allocations vs total budget</p>
        <StatusBadge tone={isOverBudget ? 'danger' : 'success'} showDot={false}>
          {isOverBudget ? 'Over budget' : 'Within budget'}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
          <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
            Total budget
          </dt>
          <dd className="mt-1.5 text-sm leading-snug font-semibold text-ink tabular-nums sm:text-base">
            {formatMoney(totalBudget)}
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
          <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
            Planned expenditure
          </dt>
          <dd className="mt-1.5 text-sm leading-snug font-semibold text-ink tabular-nums sm:text-base">
            {formatMoney(plannedExpenses)}
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
          <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
            Actual expenditure
          </dt>
          <dd className="mt-1.5 text-sm leading-snug font-semibold text-ink tabular-nums sm:text-base">
            {formatMoney(actualExpenses)}
          </dd>
        </div>
        <div
          className={`rounded-2xl border p-3.5 ${
            isOverBudget ? 'border-rust-100 bg-rust-50' : 'border-sage-100 bg-sage-50'
          }`}
        >
          <dt
            className={`flex items-center gap-1.5 text-[0.625rem] font-semibold tracking-[0.1em] uppercase ${
              isOverBudget ? 'text-rust-700' : 'text-sage-700'
            }`}
          >
            {isOverBudget ? (
              <AlertTriangle className="size-3.5" aria-hidden="true" strokeWidth={2} />
            ) : null}
            {isOverBudget ? 'Over budget' : 'Remaining budget'}
          </dt>
          <dd
            className={`mt-1.5 text-sm leading-snug font-semibold tabular-nums sm:text-base ${
              isOverBudget ? 'text-rust-700' : 'text-sage-700'
            }`}
          >
            {formatMoney(remainingDisplay)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <p className="font-medium text-ink-muted">Budget utilised</p>
          <p className="font-semibold text-ink tabular-nums">{usagePercent}%</p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-canvas-deep"
          role="progressbar"
          aria-label="Share of total budget planned"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={barPercent}
          aria-valuetext={`${usagePercent}% of budget planned${
            isOverBudget ? ', over budget' : ''
          }`}
        >
          <div
            className={`h-full rounded-full ${isOverBudget ? 'bg-rust-600' : 'bg-maroon-700'}`}
            style={{ width: `${barPercent}%` }}
          />
        </div>
        {isOverBudget ? (
          <p className="mt-2 text-xs font-medium text-rust-700">
            Planned expenditure exceeds the budget by {formatMoney(overrun)}. Review
            deterministic repair options in the planner.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">
            {formatMoney(remaining)} remains unallocated in this focus.
          </p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
        <div className="rounded-xl border border-maroon-100 bg-maroon-50/60 p-2.5">
          <dt className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-[0.06em] text-maroon-700 uppercase">
            <ShieldCheck className="size-3" aria-hidden="true" />
            Protected
          </dt>
          <dd className="mt-1 text-xs font-semibold text-ink tabular-nums">
            {formatMoney(protectedPlanned)}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface-muted p-2.5">
          <dt className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-[0.06em] text-ink-muted uppercase">
            <SlidersHorizontal className="size-3" aria-hidden="true" />
            Flexible
          </dt>
          <dd className="mt-1 text-xs font-semibold text-ink tabular-nums">
            {formatMoney(flexiblePlanned)}
          </dd>
        </div>
        <div className="rounded-xl border border-gold-200 bg-gold-50/70 p-2.5">
          <dt className="text-[0.625rem] font-semibold tracking-[0.06em] text-gold-700 uppercase">
            Reserve
          </dt>
          <dd className="mt-1 text-xs font-semibold text-ink tabular-nums">
            {reserveConfigured ? formatMoney(reservePlanned) : 'Off'}
          </dd>
          <dd className="mt-0.5 text-[0.625rem] text-ink-muted">
            {reserveConfigured
              ? reserveFunded
                ? 'Target met'
                : `of ${formatMoney(reserveTarget)} target`
              : 'Not configured'}
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Allocation breakdown</h3>
          <Link to={budgetHref} className="btn-ghost text-xs">
            Open planner
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {allocations.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {allocations.map((allocation) => {
              const share =
                totalBudget.amountMinor > 0
                  ? Math.round((allocation.planned.amountMinor / totalBudget.amountMinor) * 100)
                  : 0;

              return (
                <li key={allocation.key}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 font-medium text-ink">
                      {allocation.label}
                      <span className="ml-1.5 font-normal text-ink-soft">
                        · {protectionLabel(allocation.protection)}
                      </span>
                    </span>
                    <span className="shrink-0 text-ink-muted tabular-nums">
                      {formatMoney(allocation.planned)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas-deep">
                    <div
                      className="h-full rounded-full bg-gold-500"
                      style={{ width: `${clampPercent(share)}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-ink-soft tabular-nums">
                    {share}% of total budget · {formatMoney(allocation.actual)} actual
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            No expense categories are recorded for this focus. Open the planner to add the
            first category — no amounts are invented for you.
          </p>
        )}
      </div>

      <p className="mt-5 text-[0.6875rem] leading-relaxed text-ink-soft">
        Totals are calculated in code from integer paise. AI is never used for budget
        arithmetic.
      </p>
    </section>
  );
}
