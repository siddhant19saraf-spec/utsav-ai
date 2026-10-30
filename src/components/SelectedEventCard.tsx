import { CalendarDays, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatEventDate } from '@/lib/date';
import { formatCount } from '@/lib/format';
import type { CelebrationEvent } from '@/types/domain';

interface SelectedEventCardProps {
  readonly headingId: string;
  readonly eyebrow: string;
  readonly event: CelebrationEvent;
  readonly events: readonly CelebrationEvent[];
  readonly selectId: string;
  readonly selectLabel: string;
  readonly selectHint: string;
  readonly onEventChange: (eventId: string) => void;
  readonly children?: ReactNode;
}

export function SelectedEventCard({
  headingId,
  eyebrow,
  event,
  events,
  selectId,
  selectLabel,
  selectHint,
  onEventChange,
  children,
}: SelectedEventCardProps) {
  return (
    <section
      aria-labelledby={headingId}
      className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"
    >
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
        >
          {event.name}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 text-gold-600" aria-hidden="true" />
            <time dateTime={event.startsAt}>{formatEventDate(event.startsAt)}</time>
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5 text-gold-600" aria-hidden="true" />
            {formatCount(event.expectedGuests)} expected guests
          </span>
          {children}
        </div>
      </div>

      <div className="w-full sm:w-72">
        <label htmlFor={selectId} className="field-label">
          {selectLabel}
        </label>
        <select
          id={selectId}
          value={event.id}
          onChange={(changeEvent) => onEventChange(changeEvent.target.value)}
          aria-describedby={`${selectId}-hint`}
          className="field-control mt-1.5"
        >
          {events.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <p id={`${selectId}-hint`} className="field-hint mt-1.5">
          {selectHint}
        </p>
      </div>
    </section>
  );
}
