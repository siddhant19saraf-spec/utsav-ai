import type { LucideIcon } from 'lucide-react';

type SummaryAccent = 'maroon' | 'gold' | 'sage' | 'slate';

const accentClasses: Record<SummaryAccent, string> = {
  maroon: 'border-maroon-100 bg-maroon-50 text-maroon-700',
  gold: 'border-gold-200 bg-gold-50 text-gold-700',
  sage: 'border-sage-100 bg-sage-50 text-sage-700',
  slate: 'border-slate-blue-100 bg-slate-blue-50 text-slate-blue-700',
};

interface SummaryCardProps {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly accent?: SummaryAccent;
}

export function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = 'maroon',
}: SummaryCardProps) {
  return (
    <div className="surface-card relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">
          {label}
        </p>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-2xl border ${accentClasses[accent]}`}
          aria-hidden="true"
        >
          <Icon className="size-[1.15rem]" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 font-display text-[2rem] leading-none font-semibold tracking-tight text-ink tabular-nums">
        {value}
      </p>
      <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">{detail}</p>
    </div>
  );
}
