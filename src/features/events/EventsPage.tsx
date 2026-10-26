import { AlertTriangle, CalendarDays, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { EventCard } from '@/components/EventCard';
import { ModalDialog } from '@/components/ModalDialog';
import { PageHeader } from '@/components/PageHeader';
import { toIsoDate } from '@/lib/date';
import { planningStatuses, planningStatusMap } from '@/lib/eventMeta';
import { EventFormDialog } from '@/features/events/EventFormDialog';
import type { EventDraft } from '@/features/events/eventMutations';
import { buildEventRiskSummaries } from '@/features/risks/riskSelectors';
import { SampleDataNotice } from '@/features/workspace/SampleDataNotice';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import {
  filterAndSortEvents,
  type EventStatusFilter,
} from './eventFilters';

type EventDialogState =
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly eventId: string };

export function EventsPage() {
  const {
    workspace,
    hasSampleData,
    createEvent,
    updateEvent,
    deleteEvent,
    loadDemoData,
    removeDemoData,
  } = useWorkspace();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EventStatusFilter>('all');
  const [dialog, setDialog] = useState<EventDialogState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const keepEventButtonRef = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const todayIso = toIsoDate(new Date());
  const filteredEvents = filterAndSortEvents(workspace.events, search, status, todayIso);
  const filtersActive = search.trim().length > 0 || status !== 'all';
  const riskSummaries = buildEventRiskSummaries(workspace.riskFindings ?? []);
  const editingEvent =
    dialog?.mode === 'edit'
      ? workspace.events.find((event) => event.id === dialog.eventId)
      : undefined;
  const dialogOpen =
    dialog !== null && (dialog.mode === 'create' || editingEvent !== undefined);
  const pendingDeleteEvent = pendingDeleteId
    ? workspace.events.find((event) => event.id === pendingDeleteId)
    : undefined;
  const pendingDeleteCounts = pendingDeleteEvent
    ? {
        tasks: workspace.tasks.filter(
          (task) => task.eventId === pendingDeleteEvent.id,
        ).length,
        guests: workspace.guests.filter(
          (guest) => guest.eventId === pendingDeleteEvent.id,
        ).length,
        activities: workspace.activities.filter(
          (activity) => activity.eventId === pendingDeleteEvent.id,
        ).length,
        catering: workspace.cateringEstimates.some(
          (estimate) => estimate.eventId === pendingDeleteEvent.id,
        )
          ? 'Saved'
          : 'None',
        risks: (workspace.riskFindings ?? []).filter(
          (finding) => finding.eventId === pendingDeleteEvent.id,
        ).length,
      }
    : null;

  const handleCloseDialog = useCallback(() => setDialog(null), []);

  const handleCreateEvent = useCallback(
    (draft: EventDraft) => {
      const event = createEvent(draft);
      setDialog(null);
      setSearch('');
      setStatus('all');
      setAnnouncement(`Created ${event.name}. It is saved in this browser.`);
    },
    [createEvent],
  );

  const handleUpdateEvent = useCallback(
    (draft: EventDraft) => {
      if (!editingEvent) {
        return;
      }

      updateEvent(editingEvent.id, draft);
      setDialog(null);
      setAnnouncement(`Updated ${draft.name}. Changes are saved in this browser.`);
    },
    [editingEvent, updateEvent],
  );

  const handleEditEvent = useCallback(
    (eventId: string) => setDialog({ mode: 'edit', eventId }),
    [],
  );

  const handleCloseDelete = useCallback(() => setPendingDeleteId(null), []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteEvent) {
      return;
    }

    deleteEvent(pendingDeleteEvent.id);
    setPendingDeleteId(null);
    setAnnouncement(
      `Deleted ${pendingDeleteEvent.name} and its related planning records. This cannot be undone.`,
    );
  }, [deleteEvent, pendingDeleteEvent]);

  function clearFilters() {
    setSearch('');
    setStatus('all');
  }

  function handleStatusChange(value: string) {
    if (value === 'all') {
      setStatus('all');
      return;
    }

    const nextStatus = planningStatuses.find((planningStatus) => planningStatus === value);

    if (nextStatus) {
      setStatus(nextStatus);
    }
  }

  function handleLoadSampleData() {
    loadDemoData();
    setAnnouncement('Sample celebrations added and saved in this browser.');
  }

  function handleRemoveSampleData() {
    removeDemoData();
    setAnnouncement('Sample celebrations removed. Events you created were kept.');
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="My events"
        title="Every celebration, in one place"
        description="Browse, search, filter, and update the celebrations in this workspace. Sample events are visibly labelled, and every change is saved in this browser."
        actions={
          <button
            type="button"
            onClick={() => setDialog({ mode: 'create' })}
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

      <section aria-label="Filter events" className="surface-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="event-search" className="field-label">
              Search events
            </label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-soft"
                aria-hidden="true"
              />
              <input
                id="event-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, venue, or category"
                className="field-control pl-10"
              />
            </div>
          </div>

          <div className="sm:w-60">
            <label htmlFor="event-status" className="field-label">
              Planning status
            </label>
            <select
              id="event-status"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value)}
              className="field-control mt-1.5"
            >
              <option value="all">All statuses</option>
              {planningStatuses.map((planningStatus) => (
                <option key={planningStatus} value={planningStatus}>
                  {planningStatusMap[planningStatus].label}
                </option>
              ))}
            </select>
          </div>

          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="btn-ghost shrink-0 self-start lg:self-end">
              Clear filters
            </button>
          ) : null}
        </div>

        <p aria-live="polite" className="mt-3 text-xs text-ink-muted">
          Showing <span className="font-semibold text-ink">{filteredEvents.length}</span> of{' '}
          {workspace.events.length} event{workspace.events.length === 1 ? '' : 's'}
          {hasSampleData ? ' · Sample events are marked' : ''}
        </p>
      </section>

      <h2 className="sr-only">Events</h2>

      {workspace.events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No events yet"
          description="Create your first celebration or bring in the labelled sample dataset to explore the workspace. Changes are saved in this browser, not on a server."
          action={
            <>
              <button
                type="button"
                onClick={() => setDialog({ mode: 'create' })}
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
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No events match your filters"
          description="Try a different search term or planning status. Your events have not been changed."
          action={
            <button type="button" onClick={clearFilters} className="btn-secondary">
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              riskSummary={riskSummaries.get(event.id)}
              onEdit={handleEditEvent}
              onDelete={setPendingDeleteId}
            />
          ))}
        </div>
      )}

      <EventFormDialog
        open={dialogOpen}
        {...(editingEvent ? { event: editingEvent } : {})}
        onClose={handleCloseDialog}
        onSubmit={dialog?.mode === 'edit' ? handleUpdateEvent : handleCreateEvent}
      />

      {pendingDeleteEvent && pendingDeleteCounts ? (
        <ModalDialog
          open
          eyebrow="Permanent action"
          title={`Delete “${pendingDeleteEvent.name}”?`}
          description="This permanently removes the event, its budget, and every planning record attached to it from this browser. It cannot be undone."
          onClose={handleCloseDelete}
          initialFocusRef={keepEventButtonRef}
        >
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface-muted/40 px-4 py-4 sm:grid-cols-5">
              <div>
                <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                  Tasks
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  {pendingDeleteCounts.tasks}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                  Guests
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  {pendingDeleteCounts.guests}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                  Activities
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  {pendingDeleteCounts.activities}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                  Catering
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink">
                  {pendingDeleteCounts.catering}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                  Risks
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  {pendingDeleteCounts.risks}
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-xs leading-relaxed text-rust-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                There is no undo. Export your workspace from Settings first if you
                might need this event later.
              </span>
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                ref={keepEventButtonRef}
                type="button"
                onClick={handleCloseDelete}
                className="btn-secondary"
              >
                Keep event
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-rust-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust-900"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete event permanently
              </button>
            </div>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  );
}
