import { Sparkles, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly icon?: LucideIcon;
  readonly action?: ReactNode;
  readonly compact?: boolean;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Sparkles,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center px-2 py-7 text-center'
          : 'surface-card flex flex-col items-center px-6 py-12 text-center'
      }
    >
      <span
        className="flex size-12 items-center justify-center rounded-full border border-gold-200 bg-gold-50 text-gold-700"
        aria-hidden="true"
      >
        <Icon className="size-5" strokeWidth={1.7} />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-muted">{description}</p>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2.5">{action}</div> : null}
    </div>
  );
}
