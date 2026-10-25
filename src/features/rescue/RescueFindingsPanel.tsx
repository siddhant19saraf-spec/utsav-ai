import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { RefObject } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import type { BudgetCategory } from '@/types/budget';
import { summarizeFindings } from './findings';
import {
  rescueAreaLabels,
  rescueCertaintyLabels,
  rescueCertaintyTones,
  rescueSeverityLabels,
  rescueSeverityTones,
} from './rescueLabels';
import type { RescueFinding } from './rescueTypes';

interface RescueFindingsPanelProps {
  readonly findings: readonly RescueFinding[];
  readonly categories: readonly BudgetCategory[];
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
}

function SeverityIcon({ kind }: { readonly kind: RescueFinding['severity'] }) {
  if (kind === 'critical') {
    return <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />;
  }

  if (kind === 'warning') {
    return <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />;
  }

  return <Info className="size-4 shrink-0" aria-hidden="true" />;
}

export function RescueFindingsPanel({
  findings,
  categories,
  headingRef,
}: RescueFindingsPanelProps) {
  const summary = summarizeFindings(findings);
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="rescue-findings-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Problem summary</p>
          <h2
            ref={headingRef}
            id="rescue-findings-heading"
            tabIndex={-1}
            className="mt-1 text-xl font-semibold text-ink"
          >
            Detected planning problems
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-muted">
            Findings separate confirmed calculations, missing information, potential risks,
            and planning assumptions. Nothing here changes the saved event.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Finding counts">
          <StatusBadge tone="danger">
            {summary.critical} critical
          </StatusBadge>
          <StatusBadge tone="warning">
            {summary.warning} warning{summary.warning === 1 ? '' : 's'}
          </StatusBadge>
          <StatusBadge tone="info">
            {summary.info} information
          </StatusBadge>
        </div>
      </div>

      {findings.length === 0 ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-2xl border border-sage-100 bg-sage-50 px-4 py-3.5 text-sm leading-relaxed text-sage-700">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          No problems were detected from the available event, budget, task, and readiness data.
        </p>
      ) : (
        <ul className="mt-5 space-y-3.5">
          {findings.map((finding) => (
            <li
              key={finding.id}
              className={`rounded-2xl border px-4 py-4 ${
                finding.severity === 'critical'
                  ? 'border-rust-100 bg-rust-50/50'
                  : finding.severity === 'warning'
                    ? 'border-gold-200 bg-gold-50/45'
                    : 'border-line bg-surface-muted/60'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={rescueSeverityTones[finding.severity]}
                  showDot={false}
                >
                  <SeverityIcon kind={finding.severity} />
                  {rescueSeverityLabels[finding.severity]}
                </StatusBadge>
                <StatusBadge
                  tone={rescueCertaintyTones[finding.certainty]}
                  showDot={false}
                >
                  {rescueCertaintyLabels[finding.certainty]}
                </StatusBadge>
                <span className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                  {rescueAreaLabels[finding.area]}
                </span>
              </div>

              <h3 className="mt-2.5 text-base font-semibold text-ink">{finding.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {finding.description}
              </p>

              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                <span className="font-semibold text-ink-muted">Why this was generated: </span>
                {finding.explanation}
              </p>

              {finding.recommendedAction ? (
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">Recommended action: </span>
                  {finding.recommendedAction}
                </p>
              ) : null}

              {finding.constraints.length > 0 ? (
                <div className="mt-2.5">
                  <h4 className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                    Constraints respected
                  </h4>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-muted">
                    {finding.constraints.map((constraint) => (
                      <li key={constraint}>{constraint}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {finding.affectedCategoryIds.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                    Affected categories
                  </span>
                  {finding.affectedCategoryIds.map((categoryId) => (
                    <StatusBadge key={categoryId} tone="neutral" showDot={false}>
                      {categoryNames.get(categoryId) ?? categoryId}
                    </StatusBadge>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
