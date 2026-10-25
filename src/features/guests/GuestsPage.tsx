import {
  Accessibility,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  ListChecks,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { SummaryCard } from '@/components/SummaryCard';
import { formatEventDate } from '@/lib/date';
import type { CelebrationEvent, Guest, RsvpStatus } from '@/types/domain';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { CateringEstimatorPanel } from './CateringEstimatorPanel';
import { GuestDialog } from './GuestDialog';
import {
  getGuestCounts,
  rsvpStatusLabels,
  selectVisibleGuests,
  type RsvpFilter,
} from './guestRules';

const rsvpTones: Record<RsvpStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  confirmed: 'success',
  pending: 'warning',
  declined: 'neutral',
};

const filterLabels: Record<RsvpFilter, string> = {
  all: 'All',
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

export function GuestsPage() {
  const { workspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('event');
  const selectedEvent =
    workspace.events.find((event) => event.id === requestedEventId) ??
    workspace.events[0] ??
    null;

  function handleEventChange(eventId: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('event', eventId);
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Guests"
        title="Know who is coming, honestly"
        description="Track invitations, RSVP status, dietary preferences, and accessibility requests for one event at a time. Invited guests are never treated as confirmed attendees, and guest data stays in this browser."
        actions={
          selectedEvent ? (
            <>
              <Link to={`/timeline?event=${selectedEvent.id}`} className="btn-secondary">
                <ListChecks className="size-4" aria-hidden="true" />
                Timeline
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
          icon={Users}
          title="No guest list yet"
          description="Create a celebration first. Guest records always belong to a specific event, so counts are never mixed between celebrations."
          action={
            <Link to="/events" className="btn-primary">
              <UserPlus className="size-4" aria-hidden="true" />
              Create an event
            </Link>
          }
        />
      ) : (
        <>
          <EventGuestsContent
            key={selectedEvent.id}
            event={selectedEvent}
            events={workspace.events}
            onEventChange={handleEventChange}
          />
        </>
      )}
    </div>
  );
}

function EventGuestsContent({
  event,
  events,
  onEventChange,
}: {
  readonly event: CelebrationEvent;
  readonly events: readonly CelebrationEvent[];
  readonly onEventChange: (eventId: string) => void;
}) {
  const { workspace, createGuest, updateGuest, deleteGuest } = useWorkspace();
  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>('all');
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const eventGuests = workspace.guests.filter((guest) => guest.eventId === event.id);
  const counts = getGuestCounts(eventGuests);
  const visibleGuests = selectVisibleGuests(eventGuests, rsvpFilter, query);

  function openCreateDialog() {
    setEditingGuest(null);
    setDialogOpen(true);
  }

  function openEditDialog(guest: Guest) {
    setEditingGuest(guest);
    setDialogOpen(true);
    setPendingDeleteId(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingGuest(null);
  }

  function handleSave(draft: Parameters<typeof createGuest>[1]) {
    if (editingGuest) {
      updateGuest(editingGuest.id, draft);
      setAnnouncement(`Updated ${draft.name} (${rsvpStatusLabels[draft.rsvp]}).`);
    } else {
      createGuest(event.id, draft);
      setAnnouncement(
        `Added ${draft.name} to ${event.name} with ${rsvpStatusLabels[draft.rsvp]} RSVP status.`,
      );
    }

    closeDialog();
  }

  function handleDelete(guest: Guest) {
    deleteGuest(event.id, guest.id);
    setPendingDeleteId(null);
    setAnnouncement(
      `Deleted ${guest.name}. This change is saved in this browser and cannot be undone.`,
    );
  }

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <section
        aria-labelledby="guests-event-heading"
        className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"
      >
        <div className="min-w-0">
          <p className="eyebrow">Selected event</p>
          <h2
            id="guests-event-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            {event.name}
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 text-gold-600" aria-hidden="true" />
              <time dateTime={event.startsAt}>{formatEventDate(event.startsAt)}</time>
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5 text-gold-600" aria-hidden="true" />
              {event.expectedGuests} expected guests
            </span>
          </p>
        </div>

        <div className="w-full sm:w-72">
          <label htmlFor="guests-event" className="field-label">
            Event
          </label>
          <select
            id="guests-event"
            value={event.id}
            onChange={(changeEvent) => onEventChange(changeEvent.target.value)}
            className="field-control mt-1.5"
          >
            {events.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <p className="field-hint mt-1.5">
            Guest records and counts are isolated per event.
          </p>
        </div>
      </section>

      <section aria-label="RSVP summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <SummaryCard
          label="Invited"
          value={String(counts.invited)}
          detail="Guest records"
          icon={Users}
          accent="maroon"
        />
        <SummaryCard
          label="Confirmed"
          value={String(counts.confirmed)}
          detail="Positive RSVPs"
          icon={UserCheck}
          accent="sage"
        />
        <SummaryCard
          label="Pending"
          value={String(counts.pending)}
          detail="Awaiting an answer"
          icon={Clock3}
          accent="gold"
        />
        <SummaryCard
          label="Declined"
          value={String(counts.declined)}
          detail="Not attending"
          icon={UserX}
          accent="slate"
        />
      </section>

      <CateringEstimatorPanel event={event} />

      <section className="surface-card p-5 sm:p-6" aria-labelledby="guest-list-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Guest list</p>
            <h2
              id="guest-list-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
            >
              Invitations and responses
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-muted">
              {counts.invited === 0
                ? 'No guests are recorded for this event yet.'
                : `${counts.invited} invited · ${counts.confirmed} confirmed · ${counts.pending} pending · ${counts.declined} declined`}
            </p>
          </div>
          <button type="button" onClick={openCreateDialog} className="btn-primary shrink-0">
            <UserPlus className="size-4" aria-hidden="true" />
            Add guest
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface-muted/40 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-0 flex-1 sm:min-w-56">
              <label htmlFor="guest-search" className="sr-only">
                Search guests by name
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft"
                aria-hidden="true"
              />
              <input
                id="guest-search"
                type="search"
                value={query}
                onChange={(changeEvent) => setQuery(changeEvent.target.value)}
                placeholder="Search by guest name"
                autoComplete="off"
                className="field-control min-h-9 py-1.5 pl-9 text-sm"
              />
            </div>
          </div>

          <div
            role="group"
            aria-label="Filter guests by RSVP status"
            className="flex flex-wrap items-center gap-1.5"
          >
            {(['all', 'pending', 'confirmed', 'declined'] as const).map((filter) => {
              const count =
                filter === 'all' ? counts.invited : counts[filter];

              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setRsvpFilter(filter)}
                  aria-pressed={rsvpFilter === filter}
                  className={`min-h-8 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    rsvpFilter === filter
                      ? 'bg-maroon-800 text-white'
                      : 'border border-line-strong bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  {filterLabels[filter]} · {count}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          {visibleGuests.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              title={
                eventGuests.length === 0
                  ? 'No guests for this event yet'
                  : 'No guests match this view'
              }
              description={
                eventGuests.length === 0
                  ? 'Add the real guest list. Only include details you need, and mark RSVP status only when you actually know it.'
                  : query.trim()
                    ? 'No guest names match this search. Try a different name or clear the search.'
                    : 'No guests have this RSVP status. Choose another filter.'
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {visibleGuests.map((guest) => (
                <li key={guest.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink">{guest.name}</h3>
                        <StatusBadge tone={rsvpTones[guest.rsvp]}>
                          {rsvpStatusLabels[guest.rsvp]}
                        </StatusBadge>
                      </div>

                      {guest.dietaryPreference ||
                      guest.accessibilityRequest ||
                      guest.notes ? (
                        <dl className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-muted">
                          {guest.dietaryPreference ? (
                            <div className="flex items-start gap-1.5">
                              <dt className="flex shrink-0 items-center gap-1 font-medium text-ink-soft">
                                <UtensilsCrossed
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                Dietary:
                              </dt>
                              <dd>{guest.dietaryPreference}</dd>
                            </div>
                          ) : null}
                          {guest.accessibilityRequest ? (
                            <div className="flex items-start gap-1.5">
                              <dt className="flex shrink-0 items-center gap-1 font-medium text-ink-soft">
                                <Accessibility
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                Accessibility:
                              </dt>
                              <dd>{guest.accessibilityRequest}</dd>
                            </div>
                          ) : null}
                          {guest.notes ? (
                            <div className="flex items-start gap-1.5">
                              <dt className="shrink-0 font-medium text-ink-soft">Notes:</dt>
                              <dd>{guest.notes}</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : (
                        <p className="mt-1 text-xs text-ink-soft">
                          No dietary, accessibility, or note details recorded.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditDialog(guest)}
                        className="btn-ghost min-h-8 px-2.5 py-1 text-xs"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDeleteId(
                            pendingDeleteId === guest.id ? null : guest.id,
                          )
                        }
                        className="btn-ghost min-h-8 px-2.5 py-1 text-xs text-rust-700 hover:bg-rust-50"
                        aria-expanded={pendingDeleteId === guest.id}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {pendingDeleteId === guest.id ? (
                    <div
                      role="group"
                      aria-label={`Confirm deletion of ${guest.name}`}
                      className="mt-3 rounded-2xl border border-rust-100 bg-rust-50 px-3.5 py-3"
                    >
                      <p className="flex items-start gap-2 text-xs leading-relaxed text-rust-700">
                        <AlertTriangle
                          className="mt-0.5 size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        Delete {guest.name}? This removes their RSVP and guest details from
                        this browser and cannot be undone.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(guest)}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-rust-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rust-600"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="inline-flex min-h-8 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold text-ink"
                        >
                          Keep guest
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-5 flex items-start gap-2 rounded-2xl border border-line bg-surface-muted/50 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-sage-600"
            aria-hidden="true"
          />
          Invited, confirmed, pending, and declined are separate counts. Only confirmed
          RSVPs feed confirmed attendance in the catering estimate. No invitations are sent
          and no guest data leaves this browser.
        </p>
      </section>

      <GuestDialog
        open={dialogOpen}
        event={event}
        guest={editingGuest}
        onClose={closeDialog}
        onSave={handleSave}
      />
    </>
  );
}
