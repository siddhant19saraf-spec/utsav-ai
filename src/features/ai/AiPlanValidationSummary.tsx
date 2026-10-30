import { Wallet } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import type { AiPlanValidation } from './planValidation';
import {
  areaLabels,
  formatAdvisoryMoney,
  severityMeta,
} from './aiPlanPresentation';

export function ValidationSummary({
  validation,
  hasBudgetSuggestions,
}: {
  readonly validation: AiPlanValidation;
  readonly hasBudgetSuggestions: boolean;
}) {
  const ordered = [...validation.issues].sort(
    (first, second) =>
      (first.severity === 'error' ? 0 : first.severity === 'warning' ? 1 : 2) -
        (second.severity === 'error'
          ? 0
          : second.severity === 'warning'
            ? 1
            : 2) || first.id.localeCompare(second.id),
  );

  return (
    <section aria-labelledby="ai-checks-heading" className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Deterministic checks</p>
          <h2
            id="ai-checks-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            What the app verified
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            These checks use the app’s budget, task, activity, and risk rules. They do
            not rely on the model’s arithmetic or claims.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {validation.errorCount > 0 ? (
            <StatusBadge tone="danger" showDot={false}>
              {validation.errorCount} blocker{validation.errorCount === 1 ? '' : 's'}
            </StatusBadge>
          ) : null}
          {validation.warningCount > 0 ? (
            <StatusBadge tone="warning" showDot={false}>
              {validation.warningCount} review note
              {validation.warningCount === 1 ? '' : 's'}
            </StatusBadge>
          ) : null}
          {validation.issues.length === 0 ? (
            <StatusBadge tone="success" showDot={false}>
              No structural issues found
            </StatusBadge>
          ) : null}
        </div>
      </div>

      {hasBudgetSuggestions ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface-muted/55 px-4 py-3.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink">
            <Wallet className="size-3.5 text-gold-700" aria-hidden="true" />
            Budget comparison (app calculation)
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            Suggested allocation:{' '}
            <span className="font-semibold text-ink tabular-nums">
              {formatAdvisoryMoney(validation.budget.suggestedTotalMinor)}
            </span>
            {validation.budget.eventTotalMinor !== null ? (
              <>
                {' '}
                · saved total budget:{' '}
                <span className="font-semibold text-ink tabular-nums">
                  {formatAdvisoryMoney(validation.budget.eventTotalMinor)}
                </span>
                {validation.budget.overBudget ? (
                  <span className="font-semibold text-rust-700">
                    {' '}
                    · over by {formatAdvisoryMoney(
                      (validation.budget.suggestedTotalMinor ?? 0) -
                        (validation.budget.eventTotalMinor ?? 0),
                    )}
                  </span>
                ) : null}
              </>
            ) : (
              ' · no saved event budget to compare'
            )}
          </p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-soft">
            Budget suggestions are advisory. This page never edits the saved budget,
            protected categories, or the event total.
          </p>
        </div>
      ) : null}

      {ordered.length > 0 ? (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface-muted/35">
          {ordered.map((issue) => (
            <li key={issue.id} className="flex items-start gap-3 px-4 py-3">
              <StatusBadge
                tone={severityMeta[issue.severity].tone}
                showDot={false}
              >
                {severityMeta[issue.severity].label}
              </StatusBadge>
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                  {areaLabels[issue.area]}
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                  {issue.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-sage-100 bg-sage-50/60 px-4 py-3 text-xs leading-relaxed text-ink-muted">
          No structural or arithmetic issue was found in this proposal. That does not
          make it a booking, a verified price, or a guarantee that the event is feasible.
        </p>
      )}
    </section>
  );
}
