import {
  ArrowRight,
  CheckCircle2,
  Info,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useId } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatMoney } from '@/lib/money';
import type { BudgetRepairProposal } from './repair';

interface BudgetRepairPanelProps {
  readonly proposal: BudgetRepairProposal;
  readonly onApply: () => void;
  readonly onDismiss: () => void;
}

export function BudgetRepairPanel({ proposal, onApply, onDismiss }: BudgetRepairPanelProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`surface-card p-5 sm:p-6 ${
        proposal.feasible ? 'border-sage-100' : 'border-rust-100'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-2xl border ${
              proposal.feasible
                ? 'border-sage-100 bg-sage-50 text-sage-700'
                : 'border-rust-100 bg-rust-50 text-rust-700'
            }`}
            aria-hidden="true"
          >
            {proposal.feasible ? (
              <ShieldCheck className="size-5" strokeWidth={1.8} />
            ) : (
              <ShieldAlert className="size-5" strokeWidth={1.8} />
            )}
          </span>
          <div>
            <p className="eyebrow">Reviewed repair</p>
            <h2 id={headingId} className="mt-0.5 text-lg font-semibold text-ink">
              {proposal.feasible ? 'A feasible repair is ready' : 'No feasible repair exists'}
            </h2>
          </div>
        </div>
        <StatusBadge
          tone={proposal.feasible ? 'success' : 'danger'}
          showDot={false}
        >
          {proposal.feasible ? 'Feasible' : 'Infeasible'}
        </StatusBadge>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{proposal.explanation}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-muted p-3">
          <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
            Total budget
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">
            {formatMoney(proposal.totalBudget)}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface-muted p-3">
          <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
            Before
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">
            {formatMoney(proposal.originalTotal)}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface-muted p-3">
          <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
            After proposal
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">
            {formatMoney(proposal.revisedTotal)}
          </dd>
        </div>
      </dl>

      {proposal.reductions.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase">
            Proposed reductions
          </h3>
          <ul className="mt-2 space-y-2">
            {proposal.reductions.map((reduction) => (
              <li
                key={reduction.categoryId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs"
              >
                <span className="font-medium text-ink">{reduction.categoryName}</span>
                <span className="flex items-center gap-1.5 text-ink-muted tabular-nums">
                  {formatMoney(reduction.originalPlanned)}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                  <span className="font-semibold text-ink">
                    {formatMoney(reduction.proposedPlanned)}
                  </span>
                  <StatusBadge tone="success" showDot={false}>
                    −{formatMoney(reduction.reduction)}
                  </StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal.unresolvedIssues.length > 0 ? (
        <div className="mt-4 rounded-xl border border-rust-100 bg-rust-50 px-3.5 py-3">
          <h3 className="text-xs font-semibold text-rust-700">Unresolved issues</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-rust-700">
            {proposal.unresolvedIssues.map((unresolved) => (
              <li key={unresolved}>{unresolved}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-gold-200 bg-gold-50/70 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
        <Info className="mt-0.5 size-3.5 shrink-0 text-gold-700" aria-hidden="true" />
        <p>
          Nothing has changed yet. The engine uses a deterministic greedy rule, preserves
          protected categories and flexible minimums, and never changes the total budget. A
          feasible repair is not claimed to be globally optimal.
        </p>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDismiss} className="btn-secondary">
          <X className="size-4" aria-hidden="true" />
          Dismiss proposal
        </button>
        {proposal.feasible ? (
          <button type="button" onClick={onApply} className="btn-primary">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Approve and apply
          </button>
        ) : null}
      </div>
    </section>
  );
}
