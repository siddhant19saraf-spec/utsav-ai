import { AlertTriangle, CornerUpLeft } from 'lucide-react';
import type { RefObject } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import type { CelebrationEvent } from '@/types/domain';
import { RescueFindingsPanel } from './RescueFindingsPanel';
import { RescueProposalPanel } from './RescueProposalPanel';
import { isApprovableProposal } from './rescueProposalRules';
import type { RescueResult } from './rescueTypes';

interface RescueResultPanelProps {
  readonly event: CelebrationEvent;
  readonly result: RescueResult;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  readonly onReturn: () => void;
}

export function RescueResultPanel({
  event,
  result,
  headingRef,
  onAccept,
  onReject,
  onReturn,
}: RescueResultPanelProps) {
  const approvable = isApprovableProposal(result.proposal, result.feasible);

  return (
    <div className="space-y-5">
      <section
        className="surface-card p-5 sm:p-6"
        aria-labelledby="rescue-results-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Analysis result</p>
            <h2
              ref={headingRef}
              id="rescue-results-heading"
              tabIndex={-1}
              className="mt-1 text-xl font-semibold text-ink"
            >
              Rescue analysis for {event.name}
            </h2>
          </div>
          <StatusBadge
            tone={
              approvable
                ? 'success'
                : result.feasible
                  ? 'warning'
                  : 'danger'
            }
            showDot={false}
          >
            {approvable
              ? 'Proposal ready for review'
              : result.feasible
                ? 'No approvable changes'
                : 'No approvable plan'}
          </StatusBadge>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
          {result.explanation}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Nothing has been applied to the saved event. Review the findings and every
          proposed action before deciding.
        </p>
      </section>

      <RescueFindingsPanel
        findings={result.findings}
        categories={event.budget.categories}
      />

      {result.proposal ? (
        <RescueProposalPanel
          proposal={result.proposal}
          feasible={result.feasible}
          onAccept={onAccept}
          onReject={onReject}
          onReturn={onReturn}
        />
      ) : (
        <section
          className="surface-card p-5 sm:p-6"
          aria-labelledby="rescue-no-proposal-heading"
        >
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-rust-100 bg-rust-50 text-rust-700"
              aria-hidden="true"
            >
              <AlertTriangle className="size-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2
                id="rescue-no-proposal-heading"
                className="text-lg font-semibold text-ink"
              >
                No proposal was generated
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                {result.explanation}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                No saved data was modified. Correct the highlighted requirements or
                review the constraints above, then analyze again.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReturn}
            className="btn-secondary mt-4"
          >
            <CornerUpLeft className="size-4" aria-hidden="true" />
            Return to editing
          </button>
        </section>
      )}
    </div>
  );
}
