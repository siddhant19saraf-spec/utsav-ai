import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileWarning,
  Info,
  ListTodo,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatTaskDate } from '@/lib/date';
import { formatActivityDateTime } from '@/lib/dateTime';
import { formatMoney } from '@/lib/money';
import { StatusBadge } from '@/components/StatusBadge';
import type { AiPlanEnvelope } from './contracts';
import {
  selectionHasBlockingIssues,
  type AiPlanIssue,
  type AiPlanValidation,
  type AiValidationArea,
} from './planValidation';

export interface AiPlanSelection {
  readonly timelineIndexes: readonly number[];
  readonly taskIndexes: readonly number[];
}

interface AiPlanResultProps {
  readonly envelope: AiPlanEnvelope;
  readonly validation: AiPlanValidation;
  readonly selection: AiPlanSelection;
  readonly onToggleTimeline: (index: number) => void;
  readonly onToggleTask: (index: number) => void;
  readonly previewOpen: boolean;
  readonly onPreview: () => void;
  readonly onCancelPreview: () => void;
  readonly onApply: () => void;
  readonly applyPending: boolean;
  readonly applyError: string;
  readonly appliedMessage: string;
  readonly stale: boolean;
  readonly eventId: string | null;
  readonly eventName: string | null;
  readonly riskTitles: ReadonlyMap<string, string>;
}

const areaLabels: Record<AiValidationArea, string> = {
  timeline: 'Timeline',
  tasks: 'Tasks',
  budget: 'Budget',
  catering: 'Catering',
  risks: 'Risks',
  plan: 'Plan',
};

const severityMeta = {
  error: { label: 'Blocker', tone: 'danger' as const },
  warning: { label: 'Review', tone: 'warning' as const },
  info: { label: 'Note', tone: 'info' as const },
};

const budgetPriorityLabels = {
  essential: 'Essential',
  important: 'Important',
  optional: 'Optional',
} as const;

function money(amountMinor: number | null): string {
  return amountMinor === null
    ? 'Not available'
    : formatMoney({ amountMinor, currency: 'INR' });
}

function itemIsBlocked(issues: readonly AiPlanIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.severity === 'error' ||
      issue.code === 'timeline-duplicate' ||
      issue.code === 'task-duplicate',
  );
}

function IssueList({ issues }: { readonly issues: readonly AiPlanIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {issues.map((issue) => (
        <li key={issue.id} className="flex items-start gap-2 text-xs leading-relaxed">
          <span
            className={`mt-1 size-1.5 shrink-0 rounded-full ${
              issue.severity === 'error'
                ? 'bg-rust-700'
                : issue.severity === 'warning'
                  ? 'bg-gold-600'
                  : 'bg-slate-blue-700'
            }`}
            aria-hidden="true"
          />
          <span className="text-ink-muted">
            <span className="font-semibold text-ink">
              {severityMeta[issue.severity].label}:
            </span>{' '}
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ValidationSummary({
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
              {money(validation.budget.suggestedTotalMinor)}
            </span>
            {validation.budget.eventTotalMinor !== null ? (
              <>
                {' '}
                · saved total budget:{' '}
                <span className="font-semibold text-ink tabular-nums">
                  {money(validation.budget.eventTotalMinor)}
                </span>
                {validation.budget.overBudget ? (
                  <span className="font-semibold text-rust-700">
                    {' '}
                    · over by {money(
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

export function AiPlanResult({
  envelope,
  validation,
  selection,
  onToggleTimeline,
  onToggleTask,
  previewOpen,
  onPreview,
  onCancelPreview,
  onApply,
  applyPending,
  applyError,
  appliedMessage,
  stale,
  eventId,
  eventName,
  riskTitles,
}: AiPlanResultProps) {
  const plan = envelope.plan;
  const isProvider = envelope.source === 'provider';
  const blockingSelection = selectionHasBlockingIssues(
    validation,
    selection.timelineIndexes,
    selection.taskIndexes,
  );
  const selectedCount =
    selection.timelineIndexes.length + selection.taskIndexes.length;
  const canPreview =
    eventId !== null &&
    selectedCount > 0 &&
    !blockingSelection &&
    !stale &&
    !appliedMessage;

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="ai-proposal-heading"
        className="surface-card overflow-hidden"
      >
        <div
          className={`px-5 py-4 sm:px-6 ${
            isProvider
              ? 'border-b border-maroon-100 bg-maroon-50/60'
              : 'border-b border-gold-200 bg-gold-50/60'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isProvider ? (
                <Sparkles
                  className="size-4 text-maroon-700"
                  aria-hidden="true"
                />
              ) : (
                <ShieldCheck
                  className="size-4 text-gold-700"
                  aria-hidden="true"
                />
              )}
              <p className="text-xs font-semibold tracking-[0.1em] text-ink uppercase">
                {isProvider ? 'AI suggestion' : 'Local deterministic outline'}
              </p>
            </div>
            <StatusBadge tone={isProvider ? 'info' : 'warning'} showDot={false}>
              {isProvider ? 'Generated by AI' : 'Not AI-generated'}
            </StatusBadge>
          </div>
          <h2
            id="ai-proposal-heading"
            className="mt-2 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            {isProvider ? 'Review the proposal before using it' : 'Reference outline from saved data'}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {isProvider
              ? `Provider: ${envelope.provider.name} · Model: ${envelope.provider.model}. Every value below is an unconfirmed suggestion until you approve specific additions.`
              : 'This outline repeats saved facts and the app’s rule-based preparation tasks. It does not contain AI-written advice.'}{' '}
            Request {envelope.requestId}.
          </p>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <section aria-labelledby="ai-overview-heading">
            <h3
              id="ai-overview-heading"
              className="text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase"
            >
              Overview
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">
              {plan.overview}
            </p>
          </section>

          {plan.assumptions.length > 0 ? (
            <section aria-labelledby="ai-assumptions-heading">
              <h3
                id="ai-assumptions-heading"
                className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase"
              >
                <Info className="size-3.5" aria-hidden="true" />
                Assumptions requiring confirmation
              </h3>
              <ul className="mt-2 space-y-1.5">
                {plan.assumptions.map((assumption) => (
                  <li
                    key={assumption}
                    className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted"
                  >
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-600"
                      aria-hidden="true"
                    />
                    {assumption}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {plan.gaps.length > 0 ? (
            <section aria-labelledby="ai-gaps-heading">
              <h3
                id="ai-gaps-heading"
                className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase"
              >
                <FileWarning className="size-3.5" aria-hidden="true" />
                Gaps and follow-up questions
              </h3>
              <ul className="mt-2 space-y-2.5">
                {plan.gaps.map((gap) => (
                  <li
                    key={`${gap.title}-${gap.detail}`}
                    className="rounded-2xl border border-line bg-surface-muted/55 px-3.5 py-3"
                  >
                    <p className="text-sm font-semibold text-ink">{gap.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                      {gap.detail}
                    </p>
                    {gap.question ? (
                      <p className="mt-1.5 text-xs font-medium text-maroon-700">
                        Ask: {gap.question}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>

      <ValidationSummary
        validation={validation}
        hasBudgetSuggestions={plan.budgetCategories.length > 0}
      />

      {plan.budgetCategories.length > 0 ? (
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
                      {money(category.plannedMinor)}
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
                    {money(validation.budget.suggestedTotalMinor)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="ai-timeline-heading"
        className="surface-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Proposed schedule</p>
            <h2
              id="ai-timeline-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
            >
              Timeline suggestions
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Selected activities are created only after approval. The app rechecks
              times, end-after-start, duplicates, and overlaps against the latest saved
              timeline. Overlaps are review prompts, never automatic changes.
            </p>
          </div>
          <Clock3 className="size-5 text-gold-700" aria-hidden="true" />
        </div>

        {plan.timeline.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-line bg-surface-muted/55 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            This proposal contains no timeline suggestions.
          </p>
        ) : (
          <fieldset className="mt-4">
            <legend className="sr-only">Select timeline suggestions to add</legend>
            <ul className="space-y-2.5">
              {plan.timeline.map((activity, index) => {
                const issues = validation.timelineIssues[index] ?? [];
                const blocked = itemIsBlocked(issues);
                const checked = selection.timelineIndexes.includes(index);
                const descriptionId = `ai-timeline-issues-${index}`;

                return (
                  <li
                    key={`${activity.title}-${index}`}
                    className={`rounded-2xl border px-3.5 py-3 ${
                      blocked
                        ? 'border-rust-100 bg-rust-50/35'
                        : 'border-line bg-surface-muted/40'
                    }`}
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={blocked}
                        onChange={() => onToggleTimeline(index)}
                        aria-describedby={issues.length > 0 ? descriptionId : undefined}
                        className="mt-1 size-4 shrink-0 accent-[var(--color-maroon-800)]"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink">
                            {activity.title}
                          </span>
                          <StatusBadge tone="neutral" showDot={false}>
                            {activity.priority} priority
                          </StatusBadge>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          <time dateTime={activity.startsAt}>
                            {formatActivityDateTime(activity.startsAt)}
                          </time>{' '}
                          –{' '}
                          <time dateTime={activity.endsAt}>
                            {formatActivityDateTime(activity.endsAt)}
                          </time>
                          {activity.location ? ` · ${activity.location}` : ''}
                        </span>
                        {activity.description ? (
                          <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                            {activity.description}
                          </span>
                        ) : null}
                        <span id={descriptionId}>
                          <IssueList issues={issues} />
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
      </section>

      <section aria-labelledby="ai-tasks-heading" className="surface-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Proposed action list</p>
            <h2
              id="ai-tasks-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
            >
              Task suggestions
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Selected tasks are added as open tasks with the due dates shown. Duplicate
              titles and invalid dates are blocked by the app.
            </p>
          </div>
          <ListTodo className="size-5 text-gold-700" aria-hidden="true" />
        </div>

        {plan.tasks.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-line bg-surface-muted/55 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            This proposal contains no task suggestions.
          </p>
        ) : (
          <fieldset className="mt-4">
            <legend className="sr-only">Select task suggestions to add</legend>
            <ul className="space-y-2.5">
              {plan.tasks.map((task, index) => {
                const issues = validation.taskIssues[index] ?? [];
                const blocked = itemIsBlocked(issues);
                const checked = selection.taskIndexes.includes(index);
                const descriptionId = `ai-task-issues-${index}`;

                return (
                  <li
                    key={`${task.title}-${index}`}
                    className={`rounded-2xl border px-3.5 py-3 ${
                      blocked
                        ? 'border-rust-100 bg-rust-50/35'
                        : 'border-line bg-surface-muted/40'
                    }`}
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={blocked}
                        onChange={() => onToggleTask(index)}
                        aria-describedby={issues.length > 0 ? descriptionId : undefined}
                        className="mt-1 size-4 shrink-0 accent-[var(--color-maroon-800)]"
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink">
                            {task.title}
                          </span>
                          <StatusBadge tone="neutral" showDot={false}>
                            {task.priority} priority
                          </StatusBadge>
                          {task.milestone ? (
                            <StatusBadge tone="info" showDot={false}>
                              Milestone
                            </StatusBadge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          Due{' '}
                          <time dateTime={task.dueDate}>
                            {formatTaskDate(task.dueDate)}
                          </time>
                        </span>
                        {task.description ? (
                          <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                            {task.description}
                          </span>
                        ) : null}
                        <span id={descriptionId}>
                          <IssueList issues={issues} />
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
      </section>

      {plan.catering ? (
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
                  : money(plan.catering.perPersonCostMinor)}
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
                  : money(validation.catering.totalCostMinor)}
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
      ) : null}

      {plan.riskSummary ? (
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
      ) : null}

      {plan.alternatives.length > 0 || plan.tradeOffs.length > 0 ? (
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
      ) : null}

      <section
        aria-labelledby="ai-apply-heading"
        className="surface-card border-maroon-100 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Approval</p>
            <h2
              id="ai-apply-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
            >
              Preview and add selected items
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Nothing is applied automatically. On approval, the app revalidates this
              plan against the latest saved event and adds only the selected tasks and
              activities. Budgets, guests, protected priorities, and the event itself are
              never changed.
            </p>
          </div>
          <span className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold text-ink-muted tabular-nums">
            {selectedCount} selected
          </span>
        </div>

        {appliedMessage ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-sage-100 bg-sage-50/70 px-4 py-3"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-sage-700">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Additions approved
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {appliedMessage}
            </p>
          </div>
        ) : eventId === null ? (
          <p className="mt-4 rounded-2xl border border-gold-200 bg-gold-50/60 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            This is an advisory plan because no saved event is selected. Create or select
            an event to apply task and timeline additions. Budget suggestions remain
            advisory in every case.
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              {eventName
                ? `Additions would be attached to “${eventName}”.`
                : 'Additions would be attached to the selected event.'}
            </p>

            {stale ? (
              <p
                role="alert"
                className="mt-3 rounded-2xl border border-gold-200 bg-gold-50/70 px-4 py-3 text-xs leading-relaxed text-ink-muted"
              >
                The event, budget, guests, tasks, activities, or open risks changed after
                this plan was generated. Applying is disabled. Generate a fresh plan to
                review the latest state.
              </p>
            ) : null}

            {blockingSelection ? (
              <p
                role="alert"
                className="mt-3 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-xs leading-relaxed text-rust-700"
              >
                At least one selected item has a blocker or duplicate. Deselect it before
                previewing the additions.
              </p>
            ) : null}

            {applyError ? (
              <p
                role="alert"
                className="mt-3 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-xs leading-relaxed text-rust-700"
              >
                {applyError}
              </p>
            ) : null}

            {previewOpen ? (
              <div
                role="region"
                aria-labelledby="ai-preview-heading"
                className="mt-4 rounded-2xl border border-line-strong bg-surface-muted/55 px-4 py-4"
              >
                <h3
                  id="ai-preview-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Exact changes to add
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                      Tasks to create ({selection.taskIndexes.length})
                    </p>
                    {selection.taskIndexes.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-muted">None selected.</p>
                    ) : (
                      <ul className="mt-1.5 space-y-1">
                        {selection.taskIndexes.map((index) => {
                          const task = plan.tasks[index];

                          return task ? (
                            <li
                              key={`preview-task-${index}`}
                              className="text-xs leading-relaxed text-ink-muted"
                            >
                              · {task.title} · due {formatTaskDate(task.dueDate)}
                            </li>
                          ) : null;
                        })}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                      Activities to create ({selection.timelineIndexes.length})
                    </p>
                    {selection.timelineIndexes.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-muted">None selected.</p>
                    ) : (
                      <ul className="mt-1.5 space-y-1">
                        {selection.timelineIndexes.map((index) => {
                          const activity = plan.timeline[index];

                          return activity ? (
                            <li
                              key={`preview-activity-${index}`}
                              className="text-xs leading-relaxed text-ink-muted"
                            >
                              · {activity.title} ·{' '}
                              {formatActivityDateTime(activity.startsAt)}
                            </li>
                          ) : null;
                        })}
                      </ul>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-soft">
                  The app will create new open tasks and scheduled activities. It will
                  not delete, move, or edit anything that already exists.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onApply}
                    disabled={applyPending || !canPreview}
                    className="btn-primary min-h-10 px-4 py-2 text-xs"
                  >
                    {applyPending ? 'Adding…' : 'Approve and add to event'}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelPreview}
                    disabled={applyPending}
                    className="btn-secondary min-h-10 px-4 py-2 text-xs"
                  >
                    Back to selection
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onPreview}
                  disabled={!canPreview}
                  className="btn-primary min-h-10 px-4 py-2 text-xs"
                >
                  <Eye className="size-4" aria-hidden="true" />
                  Preview selected changes
                </button>
                <span className="text-xs leading-relaxed text-ink-muted">
                  {selectedCount === 0
                    ? 'Select at least one task or activity.'
                    : stale
                      ? 'Generate a fresh plan before applying.'
                      : blockingSelection
                        ? 'Deselect blocked items to continue.'
                        : 'A second confirmation is required before anything is saved.'}
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
