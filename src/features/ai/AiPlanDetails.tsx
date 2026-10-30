import { AlertTriangle, ShieldAlert, UtensilsCrossed, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AiPlan } from './contracts';
import type { AiPlanValidation } from './planValidation';
import {
  budgetPriorityLabels,
  formatAdvisoryMoney,
} from './aiPlanPresentation';

export function BudgetSuggestions({
  plan,
  validation,
}: {
  readonly plan: AiPlan;
  readonly validation: AiPlanValidation;
}) {
  if (plan.budgetCategories.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="ai-budget-heading"
      className="surface-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Advisory allocation</p>
          <h2
            id="ai-budget-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Suggested budget categories
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Parsed as integer paise by the app. These suggestions are never applied
            by this page.
          </p>
        </div>
        <Wallet className="size-5 text-gold-700" aria-hidden="true" />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">
            Suggested budget categories with planned amounts and rationale
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-[0.6875rem] tracking-[0.08em] text-ink-soft uppercase">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Category
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Priority
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">
                Suggested
              </th>
              <th scope="col" className="py-2 font-semibold">
                Rationale
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {plan.budgetCategories.map((category, index) => (
              <tr key={`${category.name}-${index}`}>
                <td className="py-2.5 pr-3 font-semibold text-ink">
                  {category.name}
                </td>
                <td className="py-2.5 pr-3 text-xs text-ink-muted">
                  {budgetPriorityLabels[category.priority]}
                </td>
                <td className="py-2.5 pr-3 text-right font-semibold text-ink tabular-nums">
                  {formatAdvisoryMoney(category.plannedMinor)}
                </td>
                <td className="py-2.5 text-xs leading-relaxed text-ink-muted">
                  {category.rationale}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <th scope="row" colSpan={2} className="py-2.5 pr-3 text-left text-xs font-semibold text-ink">
                Suggested total
              </th>
              <td className="py-2.5 pr-3 text-right font-semibold text-ink tabular-nums">
                {formatAdvisoryMoney(validation.budget.suggestedTotalMinor)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function CateringSuggestion({
  plan,
  validation,
}: {
  readonly plan: AiPlan;
  readonly validation: AiPlanValidation;
}) {
  if (!plan.catering) {
    return null;
  }

  return (
    <section
      aria-labelledby="ai-catering-heading"
      className="surface-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Assumption only</p>
          <h2
            id="ai-catering-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Catering suggestion
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            The app calculator uses the values below. No vendor price, current market
            rate, booking, or availability was checked.
          </p>
        </div>
        <UtensilsCrossed className="size-5 text-gold-700" aria-hidden="true" />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface-muted/55 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-semibold text-ink-muted">
            Base attendees
          </dt>
          <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
            {plan.catering.recommendedAttendeeCount}
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted/55 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-semibold text-ink-muted">
            Buffer
          </dt>
          <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
            {plan.catering.bufferPercent}%
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted/55 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-semibold text-ink-muted">
            Per-person cost
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink tabular-nums">
            {plan.catering.perPersonCostMinor === null
              ? 'Not supplied'
              : formatAdvisoryMoney(plan.catering.perPersonCostMinor)}
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted/55 px-3 py-2.5">
          <dt className="text-[0.6875rem] font-semibold text-ink-muted">
            App-calculated total
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink tabular-nums">
            {validation.catering?.totalCostMinor === null ||
            validation.catering === null
              ? 'Not calculated'
              : formatAdvisoryMoney(validation.catering.totalCostMinor)}
          </dd>
        </div>
      </dl>

      <p className="mt-2 text-xs text-ink-muted">
        {validation.catering
          ? `${validation.catering.totalAttendees} attendees including a ${validation.catering.bufferAttendees}-person buffer.`
          : 'The app could not calculate an estimate from the supplied values.'}
      </p>

      {plan.catering.notes.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {plan.catering.notes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted"
            >
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-600"
                aria-hidden="true"
              />
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function RiskSummary({
  plan,
  riskTitles,
  eventId,
}: {
  readonly plan: AiPlan;
  readonly riskTitles: ReadonlyMap<string, string>;
  readonly eventId: string | null;
}) {
  if (!plan.riskSummary) {
    return null;
  }

  return (
    <section
      aria-labelledby="ai-risk-summary-heading"
      className="surface-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Existing deterministic findings</p>
          <h2
            id="ai-risk-summary-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Risk summary
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Risk Intelligence owns severity and evidence. The summary may explain
            findings, but it cannot create, resolve, or recalculate them.
          </p>
        </div>
        <ShieldAlert className="size-5 text-rust-700" aria-hidden="true" />
      </div>

      {plan.riskSummary.overview ? (
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {plan.riskSummary.overview}
        </p>
      ) : null}

      {plan.riskSummary.items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {plan.riskSummary.items.map((item) => (
            <li
              key={item.findingId}
              className="rounded-2xl border border-line bg-surface-muted/55 px-3.5 py-3"
            >
              <p className="text-sm font-semibold text-ink">
                {riskTitles.get(item.findingId) ?? 'Saved risk finding'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {item.summary}
              </p>
              {eventId ? (
                <Link
                  to={`/risks?event=${eventId}`}
                  className="mt-1.5 inline-flex text-xs font-semibold text-maroon-700 hover:text-maroon-900 dark:hover:text-maroon-100"
                >
                  Review the saved finding in Risk Intelligence
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          No risks were summarized.
        </p>
      )}
    </section>
  );
}

export function Alternatives({ plan }: { readonly plan: AiPlan }) {
  if (plan.alternatives.length === 0 && plan.tradeOffs.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="ai-alternatives-heading"
      className="surface-card p-5 sm:p-6"
    >
      <p className="eyebrow">Decisions to weigh</p>
      <h2
        id="ai-alternatives-heading"
        className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
      >
        Alternatives and trade-offs
      </h2>

      {plan.alternatives.length > 0 ? (
        <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
          {plan.alternatives.map((alternative) => (
            <li
              key={`${alternative.title}-${alternative.summary}`}
              className="rounded-2xl border border-line bg-surface-muted/55 px-3.5 py-3"
            >
              <p className="text-sm font-semibold text-ink">
                {alternative.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {alternative.summary}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink">
                <span className="font-semibold">Trade-off:</span>{' '}
                {alternative.tradeOff}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {plan.tradeOffs.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {plan.tradeOffs.map((tradeOff) => (
            <li
              key={tradeOff}
              className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted"
            >
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0 text-gold-600"
                aria-hidden="true"
              />
              {tradeOff}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
