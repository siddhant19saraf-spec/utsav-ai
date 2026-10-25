import { ArrowLeft, Check, Construction, Info, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import { StatusBadge } from './StatusBadge';

interface ModulePlaceholderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly plannedFeatures: readonly string[];
  readonly note: string;
}

export function ModulePlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon,
  plannedFeatures,
  note,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <Link to="/" className="btn-secondary">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to overview
          </Link>
        }
      />

      <section className="surface-card overflow-hidden" aria-labelledby="module-status-heading">
        <div className="border-b border-line bg-surface-muted/70 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-gold-200 bg-gold-50 text-gold-700"
                aria-hidden="true"
              >
                <Icon className="size-6" strokeWidth={1.7} />
              </span>
              <div>
                <StatusBadge tone="warning" showDot={false}>
                  <Construction className="size-3.5" aria-hidden="true" />
                  In development
                </StatusBadge>
                <h2
                  id="module-status-heading"
                  className="mt-2 text-2xl font-semibold tracking-[-0.015em] text-ink"
                >
                  This module is not available in this build
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
                  {note}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <h3 className="text-sm font-semibold tracking-[0.08em] text-ink-soft uppercase">
            Planned capabilities
          </h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {plannedFeatures.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-3 rounded-2xl border border-line bg-surface-muted/60 px-4 py-3.5 text-sm leading-relaxed text-ink-muted"
              >
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700"
                  aria-hidden="true"
                >
                  <Check className="size-3" strokeWidth={2.5} />
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex items-start gap-3 rounded-2xl border border-line bg-canvas/70 px-4 py-4">
            <Info className="mt-0.5 size-4 shrink-0 text-maroon-600" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-muted">
              This build is a frontend preview. No AI provider, database, authentication, or saved
              changes are connected. This page is an honest placeholder, not a working feature.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/" className="btn-primary">
              Open the working dashboard
            </Link>
            <Link to="/events" className="btn-secondary">
              View my events
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
