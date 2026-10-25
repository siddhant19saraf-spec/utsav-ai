import { CircleCheckBig } from 'lucide-react';
import { useId } from 'react';

interface PlanningProgressProps {
  readonly scopeLabel: string;
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  readonly percentage: number;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PlanningProgress({
  scopeLabel,
  total,
  completed,
  remaining,
  percentage,
}: PlanningProgressProps) {
  const headingId = useId();
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  const dashOffset = CIRCUMFERENCE * (1 - clampedPercentage / 100);

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Task momentum</p>
          <h2 id={headingId} className="mt-1 text-xl font-semibold text-ink">
            Planning progress
          </h2>
          <p className="mt-1 text-xs text-ink-muted">{scopeLabel}</p>
        </div>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sage-100 bg-sage-50 text-sage-700"
          aria-hidden="true"
        >
          <CircleCheckBig className="size-5" strokeWidth={1.7} />
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-4">
        <div
          className="relative size-[7.25rem] shrink-0"
          role="progressbar"
          aria-label="Planning task completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clampedPercentage}
          aria-valuetext={`${completed} of ${total} tasks complete`}
        >
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-canvas-deep"
            />
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="text-gold-500 transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display text-3xl leading-none font-semibold text-ink tabular-nums">
              {clampedPercentage}%
            </span>
            <span className="mt-1 text-[0.625rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">
              complete
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-surface-muted px-3 py-2.5">
              <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                Completed
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{completed}</dd>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted px-3 py-2.5">
              <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                Remaining
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">{remaining}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {total > 0
              ? `${completed} of ${total} tasks complete`
              : 'No tasks are linked to this focus yet.'}
          </p>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        {total > 0
          ? 'Progress updates immediately when you mark a task complete on this dashboard.'
          : 'Task planning will expand with the Timeline module. Sample events include a few tasks to preview this view.'}
      </p>
    </section>
  );
}
