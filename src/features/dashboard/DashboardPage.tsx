import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Calculator,
  CheckCircle2,
  Clock3,
  ListTodo,
  MapPin,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { BudgetOverview } from '@/components/BudgetOverview';
import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { SummaryCard } from '@/components/SummaryCard';
import { TaskList, type TaskListItem } from '@/components/TaskList';
import { toIsoDate } from '@/lib/date';
import { formatActivityDateTime, toLocalDateTime } from '@/lib/dateTime';
import { formatMoneyCompact } from '@/lib/money';
import { EventFormDialog } from '@/features/events/EventFormDialog';
import type { EventDraft } from '@/features/events/eventMutations';
import {
  riskCategoryMeta,
  riskCertaintyLabels,
  riskSeverityMeta,
  riskSeverityOrder,
} from '@/features/risks/riskPresentation';
import {
  buildEventRiskSummaries,
  selectFindingsForEvent,
  selectRiskCounts,
  selectTopOpenFindings,
} from '@/features/risks/riskSelectors';
import { SampleDataNotice } from '@/features/workspace/SampleDataNotice';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { PlanningProgress } from './PlanningProgress';
import {
  ALL_EVENTS_SCOPE,
  filterTasks,
  selectBudgetSummary,
  selectCateringOverview,
  selectDashboardSummary,
  selectGuestSummary,
  selectScopedTasks,
  selectTaskProgress,
  selectUpcomingActivitiesForScope,
  selectUpcomingEvents,
  type TaskFilter,
} from './selectors';

const taskFilterOptions: readonly { value: TaskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Done' },
];

const numberFormatter = new Intl.NumberFormat('en-IN');

export function DashboardPage() {
  const {
    workspace,
    hasSampleData,
    riskAnalysisErrors,
    createEvent,
    toggleTask,
    loadDemoData,
    removeDemoData,
  } = useWorkspace();
  const [scope, setScope] = useState<string>(ALL_EVENTS_SCOPE);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const now = new Date();
  const todayIso = toIsoDate(now);
  const nowLocal = toLocalDateTime(now);

  const summary = selectDashboardSummary(workspace, todayIso);
  const upcomingEvents = selectUpcomingEvents(workspace, todayIso);
  const visibleUpcomingEvents = upcomingEvents.slice(0, 3);
  const activeScope =
    scope !== ALL_EVENTS_SCOPE && !workspace.events.some((event) => event.id === scope)
      ? ALL_EVENTS_SCOPE
      : scope;
  const focusEvent = workspace.events.find((event) => event.id === activeScope);
  const scopeLabel = focusEvent?.name ?? 'All events';
  const scopedTasks = selectScopedTasks(workspace, activeScope);
  const visibleTasks = filterTasks(scopedTasks, taskFilter);
  const progress = selectTaskProgress(scopedTasks);
  const budget = selectBudgetSummary(workspace, activeScope);
  const budgetHref = focusEvent ? `/budget?event=${focusEvent.id}` : '/budget';
  const timelineHref = focusEvent ? `/timeline?event=${focusEvent.id}` : '/timeline';
  const guestsHref = focusEvent ? `/guests?event=${focusEvent.id}` : '/guests';
  const upcomingActivities = selectUpcomingActivitiesForScope(
    workspace,
    activeScope,
    nowLocal,
    3,
  );
  const guestSummary = selectGuestSummary(workspace, activeScope);
  const catering = selectCateringOverview(workspace, activeScope);
  const riskFindings = workspace.riskFindings ?? [];
  const scopedRiskFindings = selectFindingsForEvent(riskFindings, activeScope);
  const riskCounts = selectRiskCounts(scopedRiskFindings);
  const topRiskFindings = selectTopOpenFindings(scopedRiskFindings, 3);
  const eventRiskSummaries = buildEventRiskSummaries(riskFindings);
  const risksHref = focusEvent ? `/risks?event=${focusEvent.id}` : '/risks';

  const taskItems: TaskListItem[] = visibleTasks.map((task) => {
    const event = workspace.events.find((workspaceEvent) => workspaceEvent.id === task.eventId);

    return {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
      completed: task.status === 'completed',
      ...(event ? { eventName: event.name } : {}),
    };
  });

  const handleCloseDialog = useCallback(() => setDialogOpen(false), []);

  const handleCreateEvent = useCallback(
    (draft: EventDraft) => {
      const event = createEvent(draft);
      setDialogOpen(false);
      setTaskFilter('all');
      setScope(event.id);
      setAnnouncement(`Created ${event.name}. It is saved in this browser.`);
    },
    [createEvent],
  );

  function handleScopeChange(value: string) {
    setScope(value);
    const event = workspace.events.find((workspaceEvent) => workspaceEvent.id === value);
    setAnnouncement(
      event
        ? `Budgets, tasks, activities, and guests now focus on ${event.name}.`
        : 'Showing all events.',
    );
  }

  function handleToggleTask(taskId: string) {
    const task = workspace.tasks.find((workspaceTask) => workspaceTask.id === taskId);
    toggleTask(taskId);

    if (task) {
      setAnnouncement(
        `${task.status === 'open' ? 'Completed' : 'Reopened'} “${task.title}”.`,
      );
    }
  }

  function handleLoadSampleData() {
    loadDemoData();
    setAnnouncement('Sample celebrations added and saved in this browser.');
  }

  function handleRemoveSampleData() {
    removeDemoData();
    setScope(ALL_EVENTS_SCOPE);
    setTaskFilter('all');
    setAnnouncement('Sample celebrations removed. Events you created were kept.');
  }

  const taskEmptyCopy =
    scopedTasks.length === 0
      ? {
          title: 'No tasks in this focus',
          description: hasSampleData
            ? 'Choose All events or another focus, or add a real task from the Timeline.'
            : 'New events start without tasks. Add preparation work in the Timeline — due dates and priorities are saved in this browser.',
        }
      : {
          title: 'No tasks match this filter',
          description: `There are no ${
            taskFilter === 'completed' ? 'completed' : 'open'
          } tasks in ${scopeLabel}. Try a different filter.`,
        };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Overview"
        title="Welcome to UTSAV AI"
        description="Plan smarter. Celebrate better. Keep events, budgets, schedules, guests, and the next useful action together in one calm workspace. Your changes are saved in this browser, and sample data is always labelled."
        actions={
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            aria-haspopup="dialog"
            className="btn-primary"
          >
            <Plus className="size-4" aria-hidden="true" />
            Create event
          </button>
        }
      />

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <SampleDataNotice
        hasSampleData={hasSampleData}
        onLoadSampleData={handleLoadSampleData}
        onRemoveSampleData={handleRemoveSampleData}
      />

      <section aria-label="Workspace summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <SummaryCard
          label="Total events"
          value={String(summary.totalEvents)}
          detail={hasSampleData ? 'Sample and saved events' : 'Saved in this browser'}
          icon={CalendarDays}
          accent="maroon"
        />
        <SummaryCard
          label="Upcoming events"
          value={String(summary.upcomingEvents)}
          detail="Dated today or later"
          icon={CalendarClock}
          accent="gold"
        />
        <SummaryCard
          label="Planned budget"
          value={formatMoneyCompact(summary.plannedBudget)}
          detail={
            summary.totalEvents > 0 ? `Across ${summary.totalEvents} events` : 'No events yet'
          }
          icon={Wallet}
          accent="sage"
        />
        <SummaryCard
          label="Pending tasks"
          value={String(summary.pendingTasks)}
          detail={
            summary.pendingTasks === 0 ? 'Everything is up to date' : 'Still open across events'
          }
          icon={ListTodo}
          accent="slate"
        />
      </section>

      <section aria-label="Planning health" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <SummaryCard
          label="Overdue tasks"
          value={String(summary.overdueTasks)}
          detail={
            summary.overdueTasks === 0
              ? 'No open task is past due'
              : 'Open tasks past their due date'
          }
          icon={AlertTriangle}
          accent={summary.overdueTasks > 0 ? 'maroon' : 'sage'}
        />
        <SummaryCard
          label="Task completion"
          value={`${progress.percentage}%`}
          detail={`${progress.completed} of ${progress.total} tasks in ${scopeLabel}`}
          icon={CheckCircle2}
          accent="sage"
        />
        <SummaryCard
          label="Confirmed RSVPs"
          value={String(guestSummary.confirmed)}
          detail={`${guestSummary.pending} pending · ${guestSummary.invited} invited`}
          icon={UserCheck}
          accent="gold"
        />
        <SummaryCard
          label="Catering estimate"
          value={
            catering.estimatedCost
              ? formatMoneyCompact(catering.estimatedCost)
              : 'Not set'
          }
          detail={
            catering.configuredEvents === 0
              ? 'Add a per-person assumption in Guests'
              : `${catering.configuredEvents} ${
                  catering.configuredEvents === 1 ? 'event' : 'events'
                } configured · planning only`
          }
          icon={Calculator}
          accent="slate"
        />
      </section>

      {workspace.events.length > 0 ? (
        <section
          aria-labelledby="dashboard-risks-heading"
          className="surface-card p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-rust-100 bg-rust-50 text-rust-700"
                aria-hidden="true"
              >
                <ShieldAlert className="size-5" strokeWidth={1.7} />
              </span>
              <div>
                <p className="eyebrow">Risk intelligence</p>
                <h2
                  id="dashboard-risks-heading"
                  className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
                >
                  Early warnings
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  {riskCounts.open === 0
                    ? `No open deterministic findings for ${scopeLabel}. Checks run again after every saved change.`
                    : `${riskCounts.open} open ${
                        riskCounts.open === 1 ? 'finding' : 'findings'
                      } for ${scopeLabel} · ${riskCounts.openBySeverity.critical} critical · ${
                        riskCounts.openBySeverity.high
                      } high`}
                </p>
              </div>
            </div>
            <Link to={risksHref} className="btn-ghost">
              Review risk findings
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {riskAnalysisErrors.length > 0 ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-gold-200 bg-gold-50/70 px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted"
            >
              Some risk checks could not run, so findings may be incomplete. Your saved
              records were not changed.{' '}
              <Link to={risksHref} className="font-semibold text-maroon-700 hover:text-maroon-900 dark:hover:text-maroon-100">
                See details in Risk Intelligence
              </Link>
              .
            </p>
          ) : null}

          {topRiskFindings.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
              <dl className="grid grid-cols-2 gap-2">
                {riskSeverityOrder.map((entry) => (
                  <div
                    key={entry}
                    className="rounded-xl border border-line bg-surface-muted/55 px-3 py-2.5"
                  >
                    <dt className="text-[0.6875rem] font-semibold text-ink-muted">
                      {riskSeverityMeta[entry].label} open
                    </dt>
                    <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                      {riskCounts.openBySeverity[entry]}
                    </dd>
                  </div>
                ))}
              </dl>

              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-muted/35 px-3.5">
                {topRiskFindings.map((finding) => {
                  const event = workspace.events.find(
                    (workspaceEvent) => workspaceEvent.id === finding.eventId,
                  );

                  return (
                    <li key={finding.id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/risks?event=${finding.eventId}`}
                          className="text-sm font-semibold text-ink hover:text-maroon-700"
                        >
                          {finding.title}
                        </Link>
                        <StatusBadge
                          tone={riskSeverityMeta[finding.severity].tone}
                          showDot={false}
                        >
                          {riskSeverityMeta[finding.severity].label}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {riskCategoryMeta[finding.category].label}
                        {event ? ` · ${event.name}` : ''} ·{' '}
                        {riskCertaintyLabels[finding.certainty]}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-sage-100 bg-sage-50/60 px-3.5 py-3">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-sage-700"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-ink-muted">
                No open findings are recorded for this focus. Missing information is
                labelled as a gap, and a dismissed finding stays in history rather than
                being treated as resolved.
              </p>
            </div>
          )}
        </section>
      ) : null}

      <section aria-labelledby="dashboard-ai-heading" className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-maroon-100 bg-maroon-50 text-maroon-700"
              aria-hidden="true"
            >
              <Sparkles className="size-5" strokeWidth={1.7} />
            </span>
            <div>
              <p className="eyebrow">Secure AI planning</p>
              <h2
                id="dashboard-ai-heading"
                className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                An assistant that proposes, never decides
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
                Ask for an outline for {scopeLabel}, review assumptions, gaps, and
                trade-offs, then choose exactly which suggested tasks and activities to
                add. Budgets, guests, catering, risk severity, and feasibility stay
                deterministic, and nothing changes without explicit approval.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <Link
              to={focusEvent ? `/assistant?event=${focusEvent.id}` : '/assistant'}
              className="btn-primary"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Open AI Planner
            </Link>
            <p className="text-[0.6875rem] leading-relaxed text-ink-soft">
              Provider optional · A deterministic outline works without credentials
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="upcoming-events-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Next on the calendar</p>
            <h2
              id="upcoming-events-heading"
              className="mt-1 text-2xl font-semibold tracking-[-0.015em] text-ink"
            >
              Upcoming celebrations
            </h2>
            {upcomingEvents.length > 0 ? (
              <p className="mt-1 text-sm text-ink-muted">
                {upcomingEvents.length} celebration{upcomingEvents.length === 1 ? '' : 's'} ahead
              </p>
            ) : null}
          </div>
          {workspace.events.length > 0 ? (
            <Link to="/events" className="btn-ghost">
              View all events
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {visibleUpcomingEvents.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleUpcomingEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                selected={activeScope === event.id}
                onSelect={handleScopeChange}
                riskSummary={eventRiskSummaries.get(event.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            {workspace.events.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Your first celebration starts here"
                description="Create an event or explore the labelled sample celebrations. Changes are saved in this browser, and you can remove the samples at any time."
                action={
                  <>
                    <button
                      type="button"
                      onClick={() => setDialogOpen(true)}
                      aria-haspopup="dialog"
                      className="btn-primary"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Create event
                    </button>
                    {!hasSampleData ? (
                      <button type="button" onClick={handleLoadSampleData} className="btn-secondary">
                        Add sample data
                      </button>
                    ) : null}
                  </>
                }
              />
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="No upcoming celebrations"
                description="Past and completed events remain available in My Events. Create a new event whenever you are ready."
                action={
                  <>
                    <button
                      type="button"
                      onClick={() => setDialogOpen(true)}
                      aria-haspopup="dialog"
                      className="btn-primary"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Create event
                    </button>
                    <Link to="/events" className="btn-secondary">
                      View all events
                    </Link>
                  </>
                }
              />
            )}
          </div>
        )}
      </section>

      <section
        aria-label="Planning focus"
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-maroon-100 bg-maroon-50 text-maroon-700"
            aria-hidden="true"
          >
            <Target className="size-4" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Planning focus</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Budget, tasks, activities, guest counts, and progress below follow{' '}
              <span className="font-medium text-ink">{scopeLabel}</span>.
            </p>
          </div>
        </div>
        {workspace.events.length > 0 ? (
          <div className="flex items-center gap-2.5">
            <label
              htmlFor="dashboard-scope"
              className="text-xs font-semibold whitespace-nowrap text-ink-muted"
            >
              Focus event
            </label>
            <select
              id="dashboard-scope"
              value={activeScope}
              onChange={(event) => handleScopeChange(event.target.value)}
              className="field-control w-full py-2 sm:w-64"
            >
              <option value={ALL_EVENTS_SCOPE}>All events</option>
              {workspace.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="dashboard-activities-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Schedule</p>
              <h2
                id="dashboard-activities-heading"
                className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                Upcoming activities
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Next scheduled items for {scopeLabel}.
              </p>
            </div>
            <Link to={timelineHref} className="btn-ghost">
              Manage timeline
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-4">
            {upcomingActivities.length === 0 ? (
              <EmptyState
                compact
                icon={Clock3}
                title="No upcoming activities"
                description="Add the real programme with start and end times in the Timeline. Overlaps are flagged for review, never changed automatically."
                action={
                  <Link to={timelineHref} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
                    Add an activity
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {upcomingActivities.map((activity) => {
                  const event = workspace.events.find(
                    (workspaceEvent) => workspaceEvent.id === activity.eventId,
                  );

                  return (
                    <li key={activity.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-gold-200 bg-gold-50 text-gold-700"
                          aria-hidden="true"
                        >
                          <Clock3 className="size-4" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">{activity.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                            <time dateTime={activity.startsAt}>
                              {formatActivityDateTime(activity.startsAt)}
                            </time>
                            {activity.location ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                                  {activity.location}
                                </span>
                              </>
                            ) : null}
                          </p>
                          {event ? (
                            <Link
                              to={`/timeline?event=${event.id}`}
                              className="mt-1 inline-flex text-xs font-semibold text-maroon-700 hover:text-maroon-900 dark:hover:text-maroon-100"
                            >
                              {event.name}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="dashboard-guests-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Attendance</p>
              <h2
                id="dashboard-guests-heading"
                className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                Guests and catering
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                RSVP counts for {scopeLabel}, kept separate from the estimate.
              </p>
            </div>
            <Link to={guestsHref} className="btn-ghost">
              Manage guests
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface-muted/55 px-3 py-2.5">
              <dt className="text-[0.6875rem] font-semibold text-ink-muted">Invited</dt>
              <dd className="mt-0.5 text-lg font-semibold text-ink tabular-nums">
                {numberFormatter.format(guestSummary.invited)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted/55 px-3 py-2.5">
              <dt className="text-[0.6875rem] font-semibold text-ink-muted">Confirmed</dt>
              <dd className="mt-0.5 text-lg font-semibold text-sage-700 tabular-nums">
                {numberFormatter.format(guestSummary.confirmed)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted/55 px-3 py-2.5">
              <dt className="text-[0.6875rem] font-semibold text-ink-muted">Pending</dt>
              <dd className="mt-0.5 text-lg font-semibold text-gold-700 tabular-nums">
                {numberFormatter.format(guestSummary.pending)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted/55 px-3 py-2.5">
              <dt className="text-[0.6875rem] font-semibold text-ink-muted">Declined</dt>
              <dd className="mt-0.5 text-lg font-semibold text-ink-muted tabular-nums">
                {numberFormatter.format(guestSummary.declined)}
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-2xl border border-gold-200 bg-gold-50/60 px-4 py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gold-700">
                  <Calculator className="size-3.5" aria-hidden="true" />
                  Estimated catering cost
                </p>
                <p className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink tabular-nums">
                  {catering.estimatedCost
                    ? formatMoneyCompact(catering.estimatedCost)
                    : 'Not configured'}
                </p>
              </div>
              {catering.differenceMinor !== null ? (
                <StatusBadge
                  tone={catering.differenceMinor > 0 ? 'danger' : 'success'}
                  showDot={false}
                >
                  {catering.differenceMinor === 0
                    ? 'Matches planned catering'
                    : `${catering.differenceMinor > 0 ? 'Above' : 'Below'} planned catering by ${formatMoneyCompact(
                        {
                          amountMinor: Math.abs(catering.differenceMinor),
                          currency: 'INR',
                        },
                      )}`}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              {catering.configuredEvents === 0
                ? 'No per-person catering assumption is saved. Set one in Guests; no price is invented for you.'
                : `${catering.configuredEvents} ${
                    catering.configuredEvents === 1 ? 'event' : 'events'
                  } configured${
                    catering.usesExpectedGuestCount
                      ? ' · at least one estimate uses the expected guest count because no guest records exist'
                      : ' · uses confirmed RSVPs where guest records exist'
                  }.`}
            </p>
            {catering.eventsWithoutCateringPlan > 0 ? (
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                {catering.eventsWithoutCateringPlan}{' '}
                {catering.eventsWithoutCateringPlan === 1 ? 'estimate has' : 'estimates have'}{' '}
                no catering category to compare with the budget.
              </p>
            ) : null}
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-soft">
              Planning estimate only — not a vendor quotation or current market rate.
            </p>
          </div>

          {guestSummary.invited > 0 && guestSummary.confirmed === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              No RSVPs are confirmed yet. Invited guests are not counted as attendees.
            </p>
          ) : null}
        </section>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="tasks-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Action list</p>
              <h2
                id="tasks-heading"
                className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                Upcoming tasks
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {scopedTasks.length === 0
                  ? 'No tasks are linked to this focus yet.'
                  : `Showing ${visibleTasks.length} of ${scopedTasks.length} tasks · ${scopeLabel} · ${summary.overdueTasks} overdue across the workspace`}
              </p>
              <Link
                to={timelineHref}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-maroon-700 hover:text-maroon-900 dark:hover:text-maroon-100"
              >
                <ListTodo className="size-3.5" aria-hidden="true" />
                Manage tasks and schedule
              </Link>
            </div>
            <div
              role="group"
              aria-label="Filter tasks"
              className="inline-flex shrink-0 self-start rounded-full border border-line bg-surface-muted p-1"
            >
              {taskFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTaskFilter(option.value)}
                  aria-pressed={taskFilter === option.value}
                  className={`min-h-8 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    taskFilter === option.value
                      ? 'bg-maroon-800 text-white'
                      : 'text-ink-muted hover:bg-surface hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <TaskList
              items={taskItems}
              todayIso={todayIso}
              onToggle={handleToggleTask}
              emptyTitle={taskEmptyCopy.title}
              emptyDescription={taskEmptyCopy.description}
            />
          </div>
        </section>

        <div className="space-y-5">
          <BudgetOverview
            scopeLabel={scopeLabel}
            budgetHref={budgetHref}
            totalBudget={budget.totalBudget}
            plannedExpenses={budget.plannedExpenses}
            actualExpenses={budget.actualExpenses}
            remaining={budget.remaining}
            overrun={budget.overrun}
            usagePercent={budget.usagePercent}
            isOverBudget={budget.isOverBudget}
            allocations={budget.allocations}
            protectedPlanned={budget.protectedPlanned}
            flexiblePlanned={budget.flexiblePlanned}
            reservePlanned={budget.reservePlanned}
            reserveTarget={budget.reserveTarget}
            reserveConfigured={budget.reserveConfigured}
          />
          <PlanningProgress
            scopeLabel={scopeLabel}
            total={progress.total}
            completed={progress.completed}
            remaining={progress.remaining}
            percentage={progress.percentage}
          />
        </div>
      </div>

      <EventFormDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSubmit={handleCreateEvent}
      />
    </div>
  );
}
