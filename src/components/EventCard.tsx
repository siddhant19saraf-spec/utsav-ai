import {
  ArrowRight,
  Building2,
  CakeSlice,
  CalendarDays,
  Check,
  Gem,
  HeartHandshake,
  MapPin,
  PartyPopper,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatEventDate } from '@/lib/date';
import { eventCategoryLabels, planningStatusMap } from '@/lib/eventMeta';
import { formatCount } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { CelebrationEvent, EventCategory } from '@/types/domain';
import type { RiskSeverity } from '@/types/risk';
import { riskSeverityMeta } from '@/features/risks/riskPresentation';
import type { EventRiskSummary } from '@/features/risks/riskSelectors';
import { StatusBadge } from './StatusBadge';

const categoryIcons: Record<EventCategory, LucideIcon> = {
  wedding: HeartHandshake,
  birthday: CakeSlice,
  corporate: Building2,
  anniversary: Gem,
  festival: Sparkles,
  other: PartyPopper,
};

const riskBannerClasses: Record<RiskSeverity, string> = {
  critical: 'border-rust-100 bg-rust-50/70 text-rust-700 hover:bg-rust-50',
  high: 'border-rust-100 bg-rust-50/45 text-rust-700 hover:bg-rust-50',
  medium: 'border-gold-200 bg-gold-50/60 text-gold-700 hover:bg-gold-50',
  low: 'border-line bg-surface-muted/60 text-ink-muted hover:bg-surface-muted',
};

interface EventCardProps {
  readonly event: CelebrationEvent;
  readonly selected?: boolean;
  readonly onSelect?: (eventId: string) => void;
  readonly onEdit?: (eventId: string) => void;
  readonly onDelete?: (eventId: string) => void;
  readonly riskSummary?: EventRiskSummary | undefined;
}

export function EventCard({
  event,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
  riskSummary,
}: EventCardProps) {
  const CategoryIcon = categoryIcons[event.category];
  const status = planningStatusMap[event.status];
  const guestCount = formatCount(event.expectedGuests);
  const topRiskSeverity = riskSummary?.highestSeverity ?? null;

  return (
    <article
      id={`event-${event.id}`}
      className={`flex h-full scroll-mt-24 flex-col rounded-3xl border p-5 transition-[border-color,box-shadow,transform] duration-200 motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none ${
        selected
          ? 'border-maroon-600 bg-maroon-50/45 shadow-lift'
          : 'border-line bg-surface shadow-card hover:border-gold-300 hover:shadow-lift'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex size-10 items-center justify-center rounded-2xl border border-gold-200 bg-gold-50 text-gold-700"
          aria-hidden="true"
        >
          <CategoryIcon className="size-5" strokeWidth={1.7} />
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {event.origin === 'sample' ? (
            <span className="rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.1em] text-ink-muted uppercase">
              Sample
            </span>
          ) : null}
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </span>
      </div>

      <p className="mt-4 text-[0.6875rem] font-semibold tracking-[0.14em] text-maroon-600 uppercase">
        {eventCategoryLabels[event.category]}
      </p>
      <h3 className="mt-1.5 text-xl leading-snug font-semibold tracking-[-0.015em] text-ink">
        {event.name}
      </h3>

      <div className="mt-3 space-y-1.5 text-sm text-ink-muted">
        <p className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-gold-600" aria-hidden="true" />
          <time dateTime={event.startsAt}>{formatEventDate(event.startsAt)}</time>
        </p>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden="true" />
          <span>{event.venue ?? 'Venue to be confirmed'}</span>
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <div>
          <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
            Guests
          </dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Users className="size-3.5 text-ink-soft" aria-hidden="true" />
            <span className="tabular-nums">{guestCount}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
            Budget
          </dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Wallet className="size-3.5 text-ink-soft" aria-hidden="true" />
            <span className="tabular-nums">
              {event.budget.totalAvailable.amountMinor > 0
                ? formatMoney(event.budget.totalAvailable)
                : 'Not set'}
            </span>
          </dd>
        </div>
      </dl>

      {riskSummary && riskSummary.open > 0 ? (
        <Link
          to={`/risks?event=${event.id}`}
          aria-label={`${riskSummary.open} open risk ${
            riskSummary.open === 1 ? 'finding' : 'findings'
          } for ${event.name}. Review in Risk Intelligence.`}
          className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
            topRiskSeverity ? riskBannerClasses[topRiskSeverity] : riskBannerClasses.low
          }`}
        >
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {riskSummary.open} open risk{riskSummary.open === 1 ? '' : 's'}
          </span>
          {topRiskSeverity ? (
            <span className="truncate font-normal opacity-80">
              · highest {riskSeverityMeta[topRiskSeverity].label}
            </span>
          ) : null}
          <ArrowRight className="ml-auto size-3.5 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}

      {onSelect || onEdit || onDelete ? (
        <div className="mt-auto flex flex-col gap-2 pt-5">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(event.id)}
              aria-haspopup="dialog"
              aria-label={`Edit ${event.name}`}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-maroon-800 transition-colors duration-150 hover:border-maroon-600 hover:bg-maroon-50 dark:text-maroon-200"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit event
            </button>
          ) : null}

          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(event.id)}
              aria-haspopup="dialog"
              aria-label={`Delete ${event.name}`}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-rust-700 transition-colors duration-150 hover:bg-rust-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete event
            </button>
          ) : null}

          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(event.id)}
              aria-pressed={selected}
              aria-label={
                selected
                  ? `${event.name}: selected for budgets and tasks`
                  : `Focus budgets and tasks on ${event.name}`
              }
              className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
                selected
                  ? 'border-maroon-700 bg-maroon-800 text-white hover:bg-maroon-900'
                  : 'border-line-strong bg-surface text-maroon-800 hover:border-maroon-600 hover:bg-maroon-50 dark:text-maroon-200'
              }`}
            >
              {selected ? (
                <>
                  <Check className="size-4" aria-hidden="true" />
                  Selected
                </>
              ) : (
                <>
                  Focus tasks
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
