import type { ReactNode } from 'react';
import type { StatusTone } from '@/types/ui';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-line-strong bg-surface-muted text-ink-muted',
  info: 'border-slate-blue-100 bg-slate-blue-50 text-slate-blue-700',
  success: 'border-sage-100 bg-sage-50 text-sage-700',
  warning: 'border-gold-200 bg-gold-50 text-gold-700',
  danger: 'border-rust-100 bg-rust-50 text-rust-700',
};

interface StatusBadgeProps {
  readonly tone?: StatusTone;
  readonly children: ReactNode;
  readonly showDot?: boolean;
}

export function StatusBadge({ tone = 'neutral', children, showDot = true }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold tracking-[0.01em] whitespace-nowrap ${toneClasses[tone]}`}
    >
      {showDot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
