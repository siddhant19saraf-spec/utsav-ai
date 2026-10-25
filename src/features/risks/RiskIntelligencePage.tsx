import {
  CircleCheck,
  FilterX,
  OctagonAlert,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SummaryCard } from '@/components/SummaryCard';
import type { RiskCategory, RiskSeverity } from '@/types/risk';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { RiskFindingCard } from './RiskFindingCard';
import {
  riskCategories,
  riskCategoryMeta,
  riskSeverityMeta,
  riskSeverityOrder,
  riskStatuses,
  riskStatusMeta,
} from './riskPresentation';
import {
  ALL_RISK_CATEGORIES,
  ALL_RISK_EVENTS,
  ALL_RISK_SEVERITIES,
  filterRiskFindings,
  selectFindingsForEvent,
  selectRiskCounts,
  type RiskCounts,
  type RiskFilter,
  type RiskStatusFilter,
} from './riskSelectors';

function parseCategoryFilter(value: string): RiskCategory | typeof ALL_RISK_CATEGORIES {
  return riskCategories.find((category) => category === value) ?? ALL_RISK_CATEGORIES;
}

function parseSeverityFilter(value: string): RiskSeverity | typeof ALL_RISK_SEVERITIES {
  return riskSeverityOrder.find((severity) => severity === value) ?? ALL_RISK_SEVERITIES;
}

function parseStatusFilter(value: string): RiskStatusFilter {
  return riskStatuses.find((status) => status === value) ?? 'open';
}

function scopeDescription(counts: RiskCounts, focusEventName: string | null): string {
  return focusEventName
    ? `For ${focusEventName} · ${counts.total} ${
        counts.total === 1 ? 'finding' : 'findings'
      } recorded`
    : `Across all events · ${counts.total} ${
        counts.total === 1 ? 'finding' : 'findings'
      } recorded`;
}

export function RiskIntelligencePage() {
  const {
    workspace,
    riskAnalysisErrors,
    dismissRiskFinding,
    restoreRiskFinding,
    refreshRiskAnalysis,
  } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('event');
  const focusEvent =
    workspace.events.find((event) => event.id === requestedEventId) ?? null;
  const activeEventId = focusEvent?.id ?? ALL_RISK_EVENTS;
  const [category, setCategory] = useState<RiskCategory | typeof ALL_RISK_CATEGORIES>(
    ALL_RISK_CATEGORIES,
  );
  const [severity, setSeverity] = useState<RiskSeverity | typeof ALL_RISK_SEVERITIES>(
    ALL_RISK_SEVERITIES,
  );
  const [status, setStatus] = useState<RiskStatusFilter>('open');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [lastDismissed, setLastDismissed] = useState<{
    readonly id: string;
    readonly title: string;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [focusRequest, setFocusRequest] = useState(0);
  const [isRefreshing, startRefresh] = useTransition();
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const findings = workspace.riskFindings ?? [];
  const scopedFindings = selectFindingsForEvent(findings, activeEventId);
  const counts = selectRiskCounts(scopedFindings);
  const filter: RiskFilter = {
    eventId: activeEventId,
    category,
    severity,
    status,
  };
  const visibleFindings = filterRiskFindings(findings, filter);
  const filtersActive =
    activeEventId !== ALL_RISK_EVENTS ||
    category !== ALL_RISK_CATEGORIES ||
    severity !== ALL_RISK_SEVERITIES ||
    status !== 'open';

  useEffect(() => {
    if (focusRequest > 0) {
      resultsHeadingRef.current?.focus();
    }
  }, [focusRequest]);

  function restoreFocusToResults() {
    setFocusRequest((current) => current + 1);
  }

  function handleEventChange(value: string) {
    const nextParams = new URLSearchParams(searchParams);

    if (value === ALL_RISK_EVENTS) {
      nextParams.delete('event');
    } else {
      nextParams.set('event', value);
    }

    setSearchParams(nextParams, { replace: true });
    setConfirmingId(null);
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
    setCategory(ALL_RISK_CATEGORIES);
    setSeverity(ALL_RISK_SEVERITIES);
    setStatus('open');
    setConfirmingId(null);
    setNotice('Filters cleared. Showing open findings for all events.');
  }

  function handleConfirmDismiss(findingId: string) {
    const finding = findings.find((entry) => entry.id === findingId);
    const result = dismissRiskFinding(findingId);

    if (!result.ok) {
      setActionError(result.message);
      setConfirmingId(null);
      return;
    }

    setActionError('');
    setConfirmingId(null);
    setLastDismissed(
      finding ? { id: finding.id, title: finding.title } : null,
    );
    setNotice(result.message);
    restoreFocusToResults();
  }

  function handleRestore(findingId: string) {
    const result = restoreRiskFinding(findingId);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    setActionError('');
    setLastDismissed(null);
    setNotice('Dismissal undone. The finding is open again and its issue has not been changed.');
    restoreFocusToResults();
  }

  function handleRefresh() {
    startRefresh(() => {
      const result = refreshRiskAnalysis();
      setNotice(result.message);
      setActionError(result.ok ? '' : result.message);
    });
  }

  function handleStatusFilter(value: string) {
    setStatus(parseStatusFilter(value));
    setConfirmingId(null);
  }

  const emptyResultsTitle =
    status === 'open'
      ? 'No open findings in this view'
      : status === 'resolved'
        ? 'No resolved findings in this view'
        : status === 'dismissed'
          ? 'No dismissed findings in this view'
          : 'No findings match this view';

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Risk Intelligence"
        title="See risks while there is still time to act"
        description="Deterministic checks read your saved plans and surface financial, scheduling, guest, venue, and rescue-proposal risks. Every finding shows its evidence and a safe next step. Analysis never edits a record, and dismissal never resolves the underlying issue."
        actions={
          <>
            <Link to="/events" className="btn-secondary">
              My events
            </Link>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-busy={isRefreshing}
              className="btn-primary"
            >
              <RefreshCw
                className={`size-4 ${isRefreshing ? 'motion-safe:animate-spin' : ''}`}
                aria-hidden="true"
              />
              {isRefreshing ? 'Refreshing…' : 'Refresh analysis'}
            </button>
          </>
        }
      />

      <div className="sr-only" role="status" aria-live="polite">
        {notice}
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3.5 text-sm text-rust-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError('')}
            className="btn-ghost self-start text-rust-700 hover:bg-rust-100 hover:text-rust-700 sm:self-auto"
          >
            Dismiss message
          </button>
        </div>
      ) : null}

      {riskAnalysisErrors.length > 0 ? (
        <div
          role="alert"
          className="rounded-2xl border border-gold-200 bg-gold-50/75 px-4 py-3.5"
        >
          <p className="text-sm font-semibold text-ink">
            Some risk checks could not run
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-muted">
            {riskAnalysisErrors.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Findings from other checks are still shown. Your saved records were not
            changed.
          </p>
        </div>
      ) : null}

      {lastDismissed ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-surface px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-ink">
            <span className="font-semibold">“{lastDismissed.title}”</span> was dismissed,
            not resolved.
          </p>
          <button
            type="button"
            onClick={() => handleRestore(lastDismissed.id)}
            className="btn-secondary min-h-9 self-start px-3.5 py-1.5 text-xs sm:self-auto"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            Undo dismissal
          </button>
        </div>
      ) : null}

      {workspace.events.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="There are no events to assess yet"
          description="Create a celebration first. Risk Intelligence reads the saved event, budget, schedule, guests, and catering assumptions — it does not invent data."
          action={
            <Link to="/events" className="btn-primary">
              Create or open events
            </Link>
          }
        />
      ) : (
        <>
          <section aria-label="Risk summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <SummaryCard
              label="Open findings"
              value={String(counts.open)}
              detail={scopeDescription(counts, focusEvent?.name ?? null)}
              icon={ShieldAlert}
              accent="maroon"
            />
            <SummaryCard
              label="Critical open"
              value={String(counts.openBySeverity.critical)}
              detail={
                counts.openBySeverity.critical > 0
                  ? 'Needs attention before proceeding'
                  : 'No critical findings detected'
              }
              icon={OctagonAlert}
              accent={counts.openBySeverity.critical > 0 ? 'maroon' : 'sage'}
            />
            <SummaryCard
              label="High open"
              value={String(counts.openBySeverity.high)}
              detail={
                counts.openBySeverity.high > 0
                  ? 'Likely to affect the plan soon'
                  : 'No high-severity findings'
              }
              icon={TriangleAlert}
              accent={counts.openBySeverity.high > 0 ? 'gold' : 'sage'}
            />
            <SummaryCard
              label="Resolved"
              value={String(counts.resolved)}
              detail="Kept as history after the issue stopped being detected"
              icon={CircleCheck}
              accent="sage"
            />
          </section>

          <section
            className="surface-card p-5 sm:p-6"
            aria-labelledby="risk-breakdown-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Severity mix</p>
                <h2
                  id="risk-breakdown-heading"
                  className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
                >
                  Open findings by severity
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  {focusEvent
                    ? `Counts for ${focusEvent.name}.`
                    : 'Counts across every event with saved planning data.'}{' '}
                  {counts.dismissed} dismissed{' '}
                  {counts.dismissed === 1 ? 'finding is' : 'findings are'} retained as
                  history.
                </p>
              </div>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sage-100 bg-sage-50 text-sage-700">
                <ShieldCheck className="size-5" strokeWidth={1.7} aria-hidden="true" />
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {riskSeverityOrder.map((entry) => (
                <div
                  key={entry}
                  className="rounded-xl border border-line bg-surface-muted/55 px-3.5 py-3"
                >
                  <dt className="text-[0.6875rem] font-semibold text-ink-muted">
                    {riskSeverityMeta[entry].label}
                  </dt>
                  <dd className="mt-0.5 text-xl font-semibold text-ink tabular-nums">
                    {counts.openBySeverity[entry]}
                  </dd>
                  <dd className="mt-0.5 text-[0.625rem] leading-relaxed text-ink-soft">
                    {riskSeverityMeta[entry].summary}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-soft">
              Findings with missing information are labelled as gaps, not confirmed
              problems. A repeated analysis updates the same finding instead of creating
              duplicates. Dismissed findings reopen only when their detected evidence or
              severity changes.
            </p>
          </section>

          <section
            aria-labelledby="risk-filters-heading"
            className="surface-card p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="risk-filters-heading" className="text-sm font-semibold text-ink">
                Filter findings
              </h2>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="btn-ghost min-h-8 px-2.5 py-1 text-xs"
                >
                  <FilterX className="size-3.5" aria-hidden="true" />
                  Clear filters
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label htmlFor="risk-event-filter" className="field-label text-xs">
                  Event
                </label>
                <select
                  id="risk-event-filter"
                  value={activeEventId}
                  onChange={(event) => handleEventChange(event.target.value)}
                  className="field-control mt-1.5 py-2"
                >
                  <option value={ALL_RISK_EVENTS}>All events</option>
                  {workspace.events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="risk-category-filter" className="field-label text-xs">
                  Category
                </label>
                <select
                  id="risk-category-filter"
                  value={category}
                  onChange={(event) =>
                    setCategory(parseCategoryFilter(event.target.value))
                  }
                  className="field-control mt-1.5 py-2"
                >
                  <option value={ALL_RISK_CATEGORIES}>All categories</option>
                  {riskCategories.map((entry) => (
                    <option key={entry} value={entry}>
                      {riskCategoryMeta[entry].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="risk-severity-filter" className="field-label text-xs">
                  Severity
                </label>
                <select
                  id="risk-severity-filter"
                  value={severity}
                  onChange={(event) =>
                    setSeverity(parseSeverityFilter(event.target.value))
                  }
                  className="field-control mt-1.5 py-2"
                >
                  <option value={ALL_RISK_SEVERITIES}>All severities</option>
                  {riskSeverityOrder.map((entry) => (
                    <option key={entry} value={entry}>
                      {riskSeverityMeta[entry].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="risk-status-filter" className="field-label text-xs">
                  Status
                </label>
                <select
                  id="risk-status-filter"
                  value={status}
                  onChange={(event) => handleStatusFilter(event.target.value)}
                  className="field-control mt-1.5 py-2"
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="all">All statuses</option>
                </select>
              </div>
            </div>

            <p aria-live="polite" className="mt-3 text-xs text-ink-muted">
              Showing{' '}
              <span className="font-semibold text-ink">{visibleFindings.length}</span> of{' '}
              {scopedFindings.length} recorded{' '}
              {scopedFindings.length === 1 ? 'finding' : 'findings'} in this event scope.
            </p>
          </section>

          <section aria-labelledby="risk-results-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Findings</p>
                <h2
                  ref={resultsHeadingRef}
                  id="risk-results-heading"
                  tabIndex={-1}
                  className="mt-1 text-2xl font-semibold tracking-[-0.015em] text-ink"
                >
                  {riskStatusMeta[status === 'all' ? 'open' : status].label} risk review
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {filter.category === ALL_RISK_CATEGORIES
                    ? 'Every risk category'
                    : riskCategoryMeta[filter.category].label}
                  {' · '}
                  {filter.severity === ALL_RISK_SEVERITIES
                    ? 'all severities'
                    : `${riskSeverityMeta[filter.severity].label} severity`}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4" aria-busy={isRefreshing}>
              {visibleFindings.length > 0 ? (
                visibleFindings.map((finding) => (
                  <RiskFindingCard
                    key={finding.id}
                    finding={finding}
                    workspace={workspace}
                    confirming={confirmingId === finding.id}
                    onRequestDismiss={(findingId) => {
                      setConfirmingId(findingId);
                      setActionError('');
                    }}
                    onCancelDismiss={() => setConfirmingId(null)}
                    onConfirmDismiss={handleConfirmDismiss}
                    onRestore={handleRestore}
                  />
                ))
              ) : findings.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="No risks detected in the saved plan"
                  description="The deterministic checks did not find any open, resolved, or dismissed issues. Add real planning details and refresh after changing an event; this page never invents a risk to fill the space."
                  action={
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="btn-secondary"
                    >
                      <RefreshCw className="size-4" aria-hidden="true" />
                      Refresh analysis
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={FilterX}
                  title={emptyResultsTitle}
                  description="Your recorded findings are unchanged. Try a different status, severity, category, or event, or clear the filters to see everything."
                  action={
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="btn-secondary"
                    >
                      Clear filters
                    </button>
                  }
                />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
