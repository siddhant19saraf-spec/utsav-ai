import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  ListChecks,
  MapPin,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatEventDate, toIsoDate } from '@/lib/date';
import {
  formatActivityDateTime,
  formatActivityTime,
  localDateTimeDatePart,
  toLocalDateTime,
} from '@/lib/dateTime';
import type {
  ActivityPriority,
  CelebrationEvent,
  TimelineActivity,
} from '@/types/domain';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { TaskManager } from '@/features/tasks/TaskManager';
import { ActivityDialog } from './ActivityDialog';
import {
  activityIdsInOverlaps,
  filterActivities,
  findActivityOverlaps,
  sortActivitiesChronologically,
  type ActivityStatusFilter,
} from './activityRules';

const statusFilters: readonly { value: ActivityStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
];

const priorityLabels: Record<ActivityPriority, string> = {
  low: 'Low priority',
  medium: 'Medium priority',
  high: 'High priority',
};

function priorityTone(priority: ActivityPriority): 'neutral' | 'warning' | 'danger' {
  return priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'neutral';
}

export function TimelinePage() {
  const { workspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('event');
  const selectedEvent =
    workspace.events.find((event) => event.id === requestedEventId) ??
    workspace.events[0] ??
    null;
  const todayIso = toIsoDate(new Date());

  function handleEventChange(eventId: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('event', eventId);
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Timeline"
        title="Keep the schedule in view"
        description="Plan activities with real start and end times, spot overlapping slots for review, and manage preparation tasks with due dates and priorities. Each record belongs to one event and is saved in this browser."
        actions={
          selectedEvent ? (
            <>
              <Link to={`/guests?event=${selectedEvent.id}`} className="btn-secondary">
                <Users className="size-4" aria-hidden="true" />
                Guests
              </Link>
              <Link to={`/rescue?event=${selectedEvent.id}`} className="btn-secondary">
                <LifeBuoy className="size-4" aria-hidden="true" />
                Event Rescue
              </Link>
            </>
          ) : null
        }
      />

      {!selectedEvent ? (
        <EmptyState
          icon={CalendarDays}
          title="No event timeline yet"
          description="Create a celebration first. Activities and tasks are always linked to a specific event, so nothing is mixed between celebrations."
          action={
            <Link to="/events" className="btn-primary">
              <CalendarPlus className="size-4" aria-hidden="true" />
              Create an event
            </Link>
          }
        />
      ) : (
        <>
          <section
            aria-labelledby="timeline-event-heading"
            className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"
          >
            <div className="min-w-0">
              <p className="eyebrow">Selected event</p>
              <h2
                id="timeline-event-heading"
                className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
              >
                {selectedEvent.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 text-gold-600" aria-hidden="true" />
                  <time dateTime={selectedEvent.startsAt}>
                    {formatEventDate(selectedEvent.startsAt)}
                  </time>
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-gold-600" aria-hidden="true" />
                  {selectedEvent.expectedGuests} expected guests
                </span>
                <span className="flex items-center gap-1.5">
                  <ListChecks className="size-3.5 text-gold-600" aria-hidden="true" />
                  {
                    workspace.activities.filter(
                      (activity) => activity.eventId === selectedEvent.id,
                    ).length
                  }{' '}
                  activities
                </span>
              </div>
            </div>

            <div className="w-full sm:w-72">
              <label htmlFor="timeline-event" className="field-label">
                Event
              </label>
              <select
                id="timeline-event"
                value={selectedEvent.id}
                onChange={(changeEvent) => handleEventChange(changeEvent.target.value)}
                className="field-control mt-1.5"
              >
                {workspace.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
              <p className="field-hint mt-1.5">
                Switching events never mixes activities or tasks.
              </p>
            </div>
          </section>

          <ActivityManager
            key={selectedEvent.id}
            event={selectedEvent}
            nowLocal={toLocalDateTime(new Date())}
          />

          <TaskManager key={`tasks-${selectedEvent.id}`} event={selectedEvent} todayIso={todayIso} />
        </>
      )}
    </div>
  );
}

function ActivityManager({
  event,
  nowLocal,
}: {
  readonly event: CelebrationEvent;
  readonly nowLocal: string;
}) {
  const { workspace, createActivity, updateActivity, deleteActivity, toggleActivity } =
    useWorkspace();
  const [statusFilter, setStatusFilter] = useState<ActivityStatusFilter>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<TimelineActivity | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const eventActivities = sortActivitiesChronologically(
    workspace.activities.filter((activity) => activity.eventId === event.id),
  );
  const visibleActivities = filterActivities(eventActivities, statusFilter);
  const overlaps = findActivityOverlaps(eventActivities);
  const overlappingIds = activityIdsInOverlaps(overlaps);
  const upcomingCount = eventActivities.filter(
    (activity) => activity.status === 'scheduled' && activity.startsAt >= nowLocal,
  ).length;

  function openCreateDialog() {
    setEditingActivity(null);
    setDialogOpen(true);
  }

  function openEditDialog(activity: TimelineActivity) {
    setEditingActivity(activity);
    setDialogOpen(true);
    setPendingDeleteId(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingActivity(null);
  }

  function handleSave(draft: Parameters<typeof createActivity>[1]) {
    if (editingActivity) {
      updateActivity(editingActivity.id, draft);
      setAnnouncement(`Updated “${draft.title}”.`);
    } else {
      createActivity(event.id, draft);
      setAnnouncement(`Added “${draft.title}” to the ${event.name} timeline.`);
    }

    closeDialog();
  }

  function handleToggle(activity: TimelineActivity) {
    toggleActivity(activity.id);
    setAnnouncement(
      `${activity.status === 'scheduled' ? 'Completed' : 'Reopened'} “${activity.title}”.`,
    );
  }

  function handleDelete(activity: TimelineActivity) {
    deleteActivity(event.id, activity.id);
    setPendingDeleteId(null);
    setAnnouncement(
      `Deleted “${activity.title}”. This change is saved in this browser.`,
    );
  }

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="activity-heading">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">Event schedule</p>
          <h2
            id="activity-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Activities
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-muted">
            {eventActivities.length === 0
              ? 'No activities are recorded yet.'
              : `${eventActivities.length} ${
                  eventActivities.length === 1 ? 'activity' : 'activities'
                } · ${upcomingCount} upcoming · chronological order`}
          </p>
        </div>
        <button type="button" onClick={openCreateDialog} className="btn-primary shrink-0">
          <CalendarPlus className="size-4" aria-hidden="true" />
          Add activity
        </button>
      </div>

      {overlaps.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-gold-700"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-sm font-semibold text-ink">
                {overlaps.length} overlapping{' '}
                {overlaps.length === 1 ? 'activity needs' : 'activities need'} review
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Overlaps can be intentional, such as photos during dinner. Nothing is
                changed automatically. Review the marked activities and adjust times only
                if the overlap is a mistake.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Filter activities by status"
        className="mt-5 flex flex-wrap items-center gap-1.5"
      >
        <span className="mr-1 text-xs font-semibold text-ink-muted">Status</span>
        {statusFilters.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatusFilter(option.value)}
            aria-pressed={statusFilter === option.value}
            className={`min-h-8 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === option.value
                ? 'bg-maroon-800 text-white'
                : 'border border-line-strong bg-surface text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {visibleActivities.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarClock}
            title={
              eventActivities.length === 0
                ? 'No activities yet'
                : 'No activities match this filter'
            }
            description={
              eventActivities.length === 0
                ? 'Add the real programme — ceremony, meals, photos, performances — with local start and end times.'
                : 'Try another status filter. Completed activities remain available for review.'
            }
          />
        ) : (
          <ol className="space-y-3">
            {visibleActivities.map((activity) => {
              const overlapping = overlappingIds.has(activity.id);
              const sameDay =
                localDateTimeDatePart(activity.startsAt) ===
                localDateTimeDatePart(activity.endsAt);
              const endLabel = sameDay
                ? formatActivityTime(activity.endsAt)
                : formatActivityDateTime(activity.endsAt);

              return (
                <li
                  key={activity.id}
                  className={`rounded-2xl border px-4 py-4 ${
                    overlapping
                      ? 'border-gold-200 bg-gold-50/50'
                      : 'border-line bg-surface-muted/30'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`text-sm font-semibold ${
                            activity.status === 'completed'
                              ? 'text-ink-soft line-through'
                              : 'text-ink'
                          }`}
                        >
                          {activity.title}
                        </h3>
                        <StatusBadge tone={priorityTone(activity.priority)}>
                          {priorityLabels[activity.priority]}
                        </StatusBadge>
                        {activity.status === 'completed' ? (
                          <StatusBadge tone="success">Completed</StatusBadge>
                        ) : activity.startsAt >= nowLocal ? (
                          <StatusBadge tone="info">Upcoming</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">Past scheduled</StatusBadge>
                        )}
                        {overlapping ? (
                          <StatusBadge tone="warning">Overlap review</StatusBadge>
                        ) : null}
                      </div>

                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                          <time dateTime={activity.startsAt}>
                            {formatActivityDateTime(activity.startsAt)}
                          </time>{' '}
                          to <time dateTime={activity.endsAt}>{endLabel}</time>
                        </span>
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

                      {activity.description ? (
                        <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                          {activity.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggle(activity)}
                        className="btn-secondary min-h-8 px-3 py-1 text-xs"
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        {activity.status === 'scheduled' ? 'Mark complete' : 'Reopen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditDialog(activity)}
                        className="btn-ghost min-h-8 px-2.5 py-1 text-xs"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDeleteId(
                            pendingDeleteId === activity.id ? null : activity.id,
                          )
                        }
                        className="btn-ghost min-h-8 px-2.5 py-1 text-xs text-rust-700 hover:bg-rust-50"
                        aria-expanded={pendingDeleteId === activity.id}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {pendingDeleteId === activity.id ? (
                    <div
                      role="group"
                      aria-label={`Confirm deletion of ${activity.title}`}
                      className="mt-3 rounded-2xl border border-rust-100 bg-rust-50 px-3.5 py-3"
                    >
                      <p className="flex items-start gap-2 text-xs leading-relaxed text-rust-700">
                        <AlertTriangle
                          className="mt-0.5 size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        Delete “{activity.title}”? This removes the activity from this
                        browser and cannot be undone.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(activity)}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-rust-800 px-3 py-1 text-xs font-semibold text-white hover:bg-rust-900"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="inline-flex min-h-8 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold text-ink"
                        >
                          Keep activity
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="mt-5 flex items-start gap-2 rounded-2xl border border-line bg-surface-muted/50 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
        <ListChecks className="mt-0.5 size-4 shrink-0 text-maroon-700" aria-hidden="true" />
        Overlaps are detected for the selected event only. They are review prompts, not
        automatic errors, and no times are changed for you.
      </p>

      <ActivityDialog
        open={dialogOpen}
        event={event}
        activity={editingActivity}
        onClose={closeDialog}
        onSave={handleSave}
      />
    </section>
  );
}
