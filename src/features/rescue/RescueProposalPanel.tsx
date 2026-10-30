import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CornerUpLeft,
  Info,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import type { RefObject } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatEventDate } from '@/lib/date';
import { formatCount } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { BudgetCategory } from '@/types/budget';
import type { CelebrationEvent, Money } from '@/types/domain';
import {
  rescueChangeKindLabels,
  rescueFlexibilityLabel,
  rescueSettingLabel,
  rescueThemeLabel,
} from './rescueLabels';
import { isApprovableProposal } from './rescueProposalRules';
import type { RescueChange, RescueProposal } from './rescueTypes';

interface RescueProposalPanelProps {
  readonly proposal: RescueProposal;
  readonly feasible: boolean;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  readonly onReturn: () => void;
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
}

function findCategory(
  event: CelebrationEvent,
  categoryId: string,
): BudgetCategory | undefined {
  return event.budget.categories.find((category) => category.id === categoryId);
}

function differenceLabel(
  originalCategory: BudgetCategory,
  proposedCategory: BudgetCategory | undefined,
): string {
  if (!proposedCategory) {
    return 'Missing';
  }

  const difference =
    proposedCategory.planned.amountMinor - originalCategory.planned.amountMinor;

  if (difference === 0) {
    return 'No change';
  }

  return `${difference > 0 ? 'Increase' : 'Reduction'} of ${formatMoney({
    amountMinor: Math.abs(difference),
    currency: 'INR',
  })}`;
}

function remainingLabel(totals: { readonly isOverBudget: boolean }): string {
  return totals.isOverBudget ? 'Overrun' : 'Remaining';
}

function remainingValue(totals: {
  readonly isOverBudget: boolean;
  readonly overrun: Money;
  readonly remaining: Money;
}): Money {
  return totals.isOverBudget ? totals.overrun : totals.remaining;
}

function ComparisonItem({
  label,
  original,
  proposed,
}: {
  readonly label: string;
  readonly original: string;
  readonly proposed: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-muted/60 p-3.5">
      <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
        {label}
      </dt>
      <dd className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="text-ink-muted">{original}</span>
        <ArrowRight className="size-3.5 text-ink-soft" aria-hidden="true" />
        <span className="font-semibold text-ink tabular-nums">{proposed}</span>
      </dd>
    </div>
  );
}

function ChangeCard({ change }: { readonly change: RescueChange }) {
  return (
    <li className="rounded-2xl border border-line bg-surface-muted/50 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="neutral" showDot={false}>
          {rescueChangeKindLabels[change.kind]}
        </StatusBadge>
        <h4 className="text-sm font-semibold text-ink">{change.label}</h4>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <span className="rounded-md bg-canvas-deep px-1.5 py-0.5 tabular-nums">
          {change.before}
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-ink-soft" aria-hidden="true" />
        <span className="rounded-md bg-gold-50 px-1.5 py-0.5 font-semibold text-ink tabular-nums">
          {change.after}
        </span>
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">Expected impact: </span>
        {change.impact}
      </p>
      <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-ink-soft">
        <RotateCcw className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        {change.reversible
          ? 'Reversible through a later manual edit; approval itself has no undo step.'
          : 'This change cannot be reversed after approval.'}
      </p>
    </li>
  );
}

export function RescueProposalPanel({
  proposal,
  feasible,
  onAccept,
  onReject,
  onReturn,
  headingRef,
}: RescueProposalPanelProps) {
  const { originalEvent, proposedEvent, originalBudget, proposedBudget } = proposal;
  const canApply = isApprovableProposal(proposal, feasible);
  const protectedCategories = proposal.protectedCategoryIds
    .map((categoryId) => findCategory(proposedEvent, categoryId))
    .filter((category): category is BudgetCategory => Boolean(category));
  const flexibleCategories = proposal.flexibleCategoryIds
    .map((categoryId) => findCategory(proposedEvent, categoryId))
    .filter((category): category is BudgetCategory => Boolean(category));

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="rescue-proposal-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Proposal review</p>
          <h2
            ref={headingRef}
            id="rescue-proposal-heading"
            tabIndex={-1}
            className="mt-1 text-xl font-semibold text-ink"
          >
            Original versus proposed plan
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-muted">
            This is a temporary plan. The saved event stays exactly as it is until you
            explicitly accept the proposal.
          </p>
        </div>
        <StatusBadge tone={canApply ? 'success' : 'warning'} showDot={false}>
          {canApply ? 'Ready for approval' : 'Not approvable as-is'}
        </StatusBadge>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ComparisonItem
          label="Total budget"
          original={formatMoney(originalBudget.totalBudget)}
          proposed={formatMoney(proposedBudget.totalBudget)}
        />
        <ComparisonItem
          label="Planned expenditure"
          original={formatMoney(originalBudget.planned)}
          proposed={formatMoney(proposedBudget.planned)}
        />
        <ComparisonItem
          label={`${remainingLabel(originalBudget)} / ${remainingLabel(proposedBudget)}`}
          original={formatMoney(remainingValue(originalBudget))}
          proposed={formatMoney(remainingValue(proposedBudget))}
        />
        <ComparisonItem
          label="Actual spend (unchanged)"
          original={formatMoney(originalBudget.actual)}
          proposed={formatMoney(proposedBudget.actual)}
        />
        <ComparisonItem
          label="Expected guests"
          original={formatCount(originalEvent.expectedGuests)}
          proposed={formatCount(proposedEvent.expectedGuests)}
        />
        <ComparisonItem
          label="Event date"
          original={formatEventDate(originalEvent.startsAt)}
          proposed={formatEventDate(proposedEvent.startsAt)}
        />
        <ComparisonItem
          label="Setting"
          original={rescueSettingLabel(originalEvent.setting)}
          proposed={rescueSettingLabel(proposedEvent.setting)}
        />
        <ComparisonItem
          label="Theme"
          original={rescueThemeLabel(originalEvent.theme)}
          proposed={rescueThemeLabel(proposedEvent.theme)}
        />
        <ComparisonItem
          label="Protected allocations"
          original={formatMoney(originalBudget.protectedPlanned)}
          proposed={formatMoney(proposedBudget.protectedPlanned)}
        />
      </dl>

      <div
        className="mt-6 overflow-x-auto rounded-2xl border border-line"
        role="region"
        aria-label="Scrollable category budget comparison"
        tabIndex={0}
      >
        <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Category-by-category budget differences between the saved event and the
            proposed plan
          </caption>
          <thead>
            <tr className="bg-surface-muted text-[0.6875rem] tracking-[0.08em] text-ink-soft uppercase">
              <th scope="col" className="px-3.5 py-3 font-semibold">
                Category
              </th>
              <th scope="col" className="px-3.5 py-3 font-semibold">
                Protection
              </th>
              <th scope="col" className="px-3.5 py-3 text-right font-semibold">
                Original plan
              </th>
              <th scope="col" className="px-3.5 py-3 text-right font-semibold">
                Proposed plan
              </th>
              <th scope="col" className="px-3.5 py-3 text-right font-semibold">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            {originalEvent.budget.categories.map((originalCategory) => {
              const proposedCategory = findCategory(proposedEvent, originalCategory.id);
              const changed =
                proposedCategory &&
                proposedCategory.planned.amountMinor !==
                  originalCategory.planned.amountMinor;

              return (
                <tr
                  key={originalCategory.id}
                  className="border-t border-line align-top"
                >
                  <th
                    scope="row"
                    className="px-3.5 py-3 font-medium text-ink"
                  >
                    {originalCategory.name}
                  </th>
                  <td className="px-3.5 py-3 text-xs text-ink-muted">
                    {rescueFlexibilityLabel(
                      proposedCategory?.flexibility ?? originalCategory.flexibility,
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-right text-ink-muted tabular-nums">
                    {formatMoney(originalCategory.planned)}
                  </td>
                  <td className="px-3.5 py-3 text-right font-semibold text-ink tabular-nums">
                    {proposedCategory ? formatMoney(proposedCategory.planned) : '—'}
                  </td>
                  <td
                    className={`px-3.5 py-3 text-right text-xs font-semibold tabular-nums ${
                      !proposedCategory
                        ? 'text-rust-700'
                        : changed
                          ? 'text-maroon-700'
                          : 'text-ink-soft'
                    }`}
                  >
                    {differenceLabel(originalCategory, proposedCategory)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-maroon-100 bg-maroon-50/50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="size-4 text-maroon-700" aria-hidden="true" />
            Protected priorities ({protectedCategories.length})
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            These allocations are never reduced by this proposal.
          </p>
          {protectedCategories.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {protectedCategories.map((category) => (
                <li
                  key={category.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-xs"
                >
                  <span className="font-medium text-ink">{category.name}</span>
                  <span className="text-ink-muted tabular-nums">
                    {formatMoney(category.planned)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2.5 text-xs text-ink-muted">
              No protected priorities are recorded for this plan.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-surface-muted/60 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal className="size-4 text-ink-soft" aria-hidden="true" />
            Eligible flexible categories ({flexibleCategories.length})
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            The deterministic repair may reduce these categories, never below their
            minimum.
          </p>
          {flexibleCategories.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {flexibleCategories.map((category) => (
                <li
                  key={category.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-xs"
                >
                  <span className="font-medium text-ink">{category.name}</span>
                  <span className="text-ink-muted">
                    {rescueFlexibilityLabel(category.flexibility)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2.5 text-xs text-ink-muted">
              No category is eligible for automated reduction.
            </p>
          )}
        </div>
      </div>

      <section className="mt-6" aria-labelledby="rescue-actions-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="rescue-actions-heading" className="text-base font-semibold text-ink">
            Proposed actions ({proposal.changes.length})
          </h3>
          <StatusBadge tone="neutral" showDot={false}>
            All changes applied together on approval
          </StatusBadge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Each action explains what changes, why it is expected to help, and whether it
          can be reversed later.
        </p>
        {proposal.changes.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {proposal.changes.map((change) => (
              <ChangeCard key={change.id} change={change} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-line bg-surface-muted/70 px-4 py-3 text-sm text-ink-muted">
            No changes are proposed. There is nothing to approve, and the saved event
            remains unchanged.
          </p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="rescue-validation-heading">
        <h3
          id="rescue-validation-heading"
          className="text-base font-semibold text-ink"
        >
          Validation and remaining issues
        </h3>
        <div
          className={`mt-3 flex items-start gap-2.5 rounded-2xl border px-4 py-3.5 text-sm leading-relaxed ${
            canApply
              ? 'border-sage-100 bg-sage-50 text-sage-700'
              : 'border-rust-100 bg-rust-50 text-rust-700'
          }`}
        >
          {canApply ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <p>
            {canApply
              ? 'The proposed plan passed the required deterministic validation: budget totals recalculated, no overrun, protected categories preserved, and amounts non-negative.'
              : proposal.changes.length === 0
                ? 'This proposal cannot be accepted because it contains no changes.'
                : 'This proposal cannot be accepted because it did not pass the required validation. The checks below explain why.'}
          </p>
        </div>

        {proposal.validation.issues.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {proposal.validation.issues.map((issue, index) => (
              <li
                key={`${issue.code}-${issue.categoryId ?? 'plan'}-${index}`}
                className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-muted px-3.5 py-3 text-xs leading-relaxed text-ink-muted sm:flex-row sm:items-start sm:gap-2.5"
              >
                <StatusBadge
                  tone={issue.severity === 'error' ? 'danger' : 'warning'}
                  showDot={false}
                >
                  {issue.severity === 'error' ? 'Error' : 'Warning'}
                </StatusBadge>
                <span className="pt-0.5">{issue.message}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-ink">
            Remaining issues ({proposal.unresolvedIssues.length})
          </h4>
          {proposal.unresolvedIssues.length > 0 ? (
            <>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                This proposal does not resolve the following items. They are reported so
                acceptance never implies more than the checked plan supports.
              </p>
              <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-ink-muted">
                {proposal.unresolvedIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
              <Info
                className="mt-0.5 size-3.5 shrink-0 text-ink-soft"
                aria-hidden="true"
              />
              No additional risks were reported from the available data. This is not a
              guarantee that the event is fully prepared.
            </p>
          )}
        </div>
      </section>

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <h3 className="text-base font-semibold text-ink">Approval controls</h3>
            <p id="rescue-approval-note" className="mt-1 text-xs leading-relaxed text-ink-muted">
              Accepting replaces the saved event with this proposed plan in one atomic
              update. Rejecting or returning to editing leaves the original event
              unchanged. No change is applied without your explicit approval.
            </p>
            {!canApply ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-rust-700">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Acceptance is unavailable until a valid proposal with at least one change
                is generated.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onReturn}
              className="btn-secondary"
            >
              <CornerUpLeft className="size-4" aria-hidden="true" />
              Return to editing
            </button>
            <button
              type="button"
              onClick={onReject}
              className="btn-secondary"
            >
              <XCircle className="size-4" aria-hidden="true" />
              Reject proposal
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!canApply}
              aria-describedby="rescue-approval-note"
              className="btn-primary"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Accept proposal
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
