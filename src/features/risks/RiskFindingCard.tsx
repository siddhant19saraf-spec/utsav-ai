import { ArrowUpRight, RotateCcw, ShieldOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/StatusBadge';
import type { CelebrationEvent, Workspace } from '@/types/domain';
import type { RiskEntityRef, RiskFinding } from '@/types/risk';
import {
  riskCategoryMeta,
  riskCertaintyLabels,
  riskSeverityMeta,
  riskStatusMeta,
} from './riskPresentation';

const timestampFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatRiskTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : timestampFormatter.format(date);
}

interface RelatedLink {
  readonly key: string;
  readonly href: string;
  readonly label: string;
}

function resolveRelatedLink(
  reference: RiskEntityRef,
  workspace: Workspace,
  event: CelebrationEvent | undefined,
  eventId: string,
): RelatedLink {
  const key = `${reference.type}:${reference.id}`;

  if (reference.type === 'event') {
    return {
      key,
      href: `/events#event-${reference.id}`,
      label: event?.name ?? 'Event record',
    };
  }

  if (reference.type === 'budget') {
    return {
      key,
      href: `/budget?event=${eventId}`,
      label: event?.budget.id === reference.id ? 'Event budget' : 'Budget record',
    };
  }

  if (reference.type === 'budget-category') {
    const category = event?.budget.categories.find(
      (entry) => entry.id === reference.id,
    );

    return {
      key,
      href: `/budget?event=${eventId}`,
      label: category ? `Budget · ${category.name}` : 'Budget category',
    };
  }

  if (reference.type === 'task') {
    const task = workspace.tasks.find((entry) => entry.id === reference.id);

    return {
      key,
      href: `/timeline?event=${eventId}`,
      label: task ? `Task · ${task.title}` : 'Task record',
    };
  }

  if (reference.type === 'activity') {
    const activity = workspace.activities.find(
      (entry) => entry.id === reference.id,
    );

    return {
      key,
      href: `/timeline?event=${eventId}`,
      label: activity ? `Activity · ${activity.title}` : 'Activity record',
    };
  }

  if (reference.type === 'guest') {
    const guest = workspace.guests.find((entry) => entry.id === reference.id);

    return {
      key,
      href: `/guests?event=${eventId}`,
      label: guest ? `Guest · ${guest.name}` : 'Guest record',
    };
  }

  if (reference.type === 'catering-estimate') {
    return {
      key,
      href: `/guests?event=${eventId}`,
      label: 'Catering estimate',
    };
  }

  return {
    key,
    href: `/rescue?event=${eventId}`,
    label: 'Event Rescue proposal',
  };
}

function relatedLinks(finding: RiskFinding, workspace: Workspace): RelatedLink[] {
  const event = workspace.events.find((entry) => entry.id === finding.eventId);
  const seen = new Set<string>();
  const links: RelatedLink[] = [];

  for (const reference of finding.relatedEntities) {
    const key = `${reference.type}:${reference.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push(resolveRelatedLink(reference, workspace, event, finding.eventId));
  }

  return links;
}

function reopenDescription(finding: RiskFinding): string | null {
  if (finding.status !== 'open' || !finding.reopenedAt) {
    return null;
  }

  if (finding.reopenReason === 'reappeared') {
    return `Reopened after the issue was detected again on ${formatRiskTimestamp(finding.reopenedAt)}.`;
  }

  if (finding.reopenReason === 'detection-changed') {
    return `Reopened on ${formatRiskTimestamp(finding.reopenedAt)} because its evidence or severity changed.`;
  }

  if (finding.reopenReason === 'dismissal-undone') {
    return `Restored from dismissed on ${formatRiskTimestamp(finding.reopenedAt)}.`;
  }

  return `Reopened on ${formatRiskTimestamp(finding.reopenedAt)}.`;
}

interface RiskFindingCardProps {
  readonly finding: RiskFinding;
  readonly workspace: Workspace;
  readonly confirming: boolean;
  readonly onRequestDismiss: (findingId: string) => void;
  readonly onCancelDismiss: () => void;
  readonly onConfirmDismiss: (findingId: string) => void;
  readonly onRestore: (findingId: string) => void;
}

export function RiskFindingCard({
  finding,
  workspace,
  confirming,
  onRequestDismiss,
  onCancelDismiss,
  onConfirmDismiss,
  onRestore,
}: RiskFindingCardProps) {
  const event = workspace.events.find((entry) => entry.id === finding.eventId);
  const category = riskCategoryMeta[finding.category];
  const severity = riskSeverityMeta[finding.severity];
  const status = riskStatusMeta[finding.status];
  const CategoryIcon = category.icon;
  const links = relatedLinks(finding, workspace);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  const wasConfirmingRef = useRef(false);

  useEffect(() => {
    if (confirming) {
      wasConfirmingRef.current = true;
      confirmButtonRef.current?.focus();
      return;
    }

    if (wasConfirmingRef.current) {
      wasConfirmingRef.current = false;
      dismissButtonRef.current?.focus();
    }
  }, [confirming]);

  function cancelDismiss() {
    onCancelDismiss();
  }

  return (
    <article
      className={`surface-card overflow-hidden border-l-4 ${severity.borderClass}`}
      aria-labelledby={`risk-finding-${finding.id}`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={severity.tone}>{severity.label}</StatusBadge>
              <StatusBadge tone={status.tone} showDot={finding.status === 'open'}>
                {status.label}
              </StatusBadge>
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2.5 py-1 text-[0.6875rem] font-semibold text-ink-muted">
                <CategoryIcon className="size-3" aria-hidden="true" />
                {category.label}
              </span>
            </div>
            <h3
              id={`risk-finding-${finding.id}`}
              className="mt-3 text-lg leading-snug font-semibold tracking-[-0.01em] text-ink"
            >
              {finding.title}
            </h3>
            {event ? (
              <p className="mt-1 text-xs text-ink-muted">
                {event.name}
                {event.origin === 'sample' ? ' · Sample event' : ''}
              </p>
            ) : null}
          </div>
          <p className="shrink-0 rounded-full border border-line bg-canvas/70 px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.04em] text-ink-soft uppercase">
            {riskCertaintyLabels[finding.certainty]}
          </p>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink-muted">{finding.explanation}</p>

        {finding.evidence.length > 0 ? (
          <div className="mt-4">
            <h4 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
              Evidence
            </h4>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {finding.evidence.map((evidence, index) => (
                <div
                  key={`${evidence.label}-${index}`}
                  className="rounded-xl border border-line bg-surface-muted/55 px-3.5 py-2.5"
                >
                  <dt className="text-[0.6875rem] font-semibold text-ink-soft">
                    {evidence.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium break-words text-ink tabular-nums">
                    {evidence.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-maroon-100 bg-maroon-50/45 px-4 py-3.5">
          <h4 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-maroon-700 uppercase">
            Recommended action
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-ink">{finding.recommendedAction}</p>
        </div>

        {links.length > 0 ? (
          <div className="mt-4">
            <h4 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-ink-soft uppercase">
              Related records
            </h4>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {links.map((link) => (
                <li key={link.key}>
                  <Link
                    to={link.href}
                    className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-maroon-800 hover:border-maroon-600 hover:bg-maroon-50 dark:text-maroon-200"
                  >
                    <span className="truncate">{link.label}</span>
                    <ArrowUpRight className="size-3 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[0.6875rem] leading-relaxed text-ink-soft">
            Detected {formatRiskTimestamp(finding.detectedAt)} · Last checked{' '}
            {formatRiskTimestamp(finding.lastDetectedAt)}
            {finding.resolvedAt
              ? ` · Resolved ${formatRiskTimestamp(finding.resolvedAt)}`
              : ''}
            {finding.dismissedAt
              ? ` · Dismissed ${formatRiskTimestamp(finding.dismissedAt)}`
              : ''}
          </p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-soft">
            Rule {finding.ruleId} · Source {finding.sourceModule}
          </p>
          {reopenDescription(finding) ? (
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-gold-700">
              {reopenDescription(finding)}
            </p>
          ) : null}
        </div>

        {confirming ? (
          <div
            role="group"
            aria-label={`Confirm dismissing ${finding.title}`}
            className="mt-4 rounded-2xl border border-gold-200 bg-gold-50/70 px-4 py-3.5"
          >
            <p className="text-sm font-semibold text-ink">Dismiss this finding?</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              It moves to Dismissed history and does not change any saved plan. It is not
              marked resolved. You can restore it while this workspace is open.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => onConfirmDismiss(finding.id)}
                className="btn-primary min-h-9 px-3.5 py-1.5 text-xs"
              >
                Yes, dismiss
              </button>
              <button
                type="button"
                onClick={cancelDismiss}
                className="btn-secondary min-h-9 px-3.5 py-1.5 text-xs"
              >
                Keep it open
              </button>
            </div>
          </div>
        ) : finding.status === 'open' ? (
          <div className="mt-4">
            <button
              ref={dismissButtonRef}
              type="button"
              onClick={() => onRequestDismiss(finding.id)}
              className="btn-ghost min-h-9 px-3 py-1.5 text-xs"
            >
              <ShieldOff className="size-3.5" aria-hidden="true" />
              Dismiss finding
            </button>
          </div>
        ) : finding.status === 'dismissed' ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => onRestore(finding.id)}
              className="btn-secondary min-h-9 px-3.5 py-1.5 text-xs"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Restore finding
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
