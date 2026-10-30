import { Clock3, ListTodo } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatTaskDate } from '@/lib/date';
import { formatActivityDateTime } from '@/lib/dateTime';
import type { AiPlan } from './contracts';
import { itemIsBlocked, type AiPlanSelection } from './aiPlanPresentation';
import type { AiPlanValidation } from './planValidation';
import { IssueList } from './AiPlanIssueList';

interface TimelineSuggestionsProps {
  readonly plan: AiPlan;
  readonly validation: AiPlanValidation;
  readonly selection: AiPlanSelection;
  readonly onToggleTimeline: (index: number) => void;
}

export function TimelineSuggestions({
  plan,
  validation,
  selection,
  onToggleTimeline,
}: TimelineSuggestionsProps) {
  return (
    <section
      aria-labelledby="ai-timeline-heading"
      className="surface-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Proposed schedule</p>
          <h2
            id="ai-timeline-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Timeline suggestions
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Selected activities are created only after approval. The app rechecks
            times, end-after-start, duplicates, and overlaps against the latest saved
            timeline. Overlaps are review prompts, never automatic changes.
          </p>
        </div>
        <Clock3 className="size-5 text-gold-700" aria-hidden="true" />
      </div>

      {plan.timeline.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-line bg-surface-muted/55 px-4 py-3 text-xs leading-relaxed text-ink-muted">
          This proposal contains no timeline suggestions.
        </p>
      ) : (
        <fieldset className="mt-4">
          <legend className="sr-only">Select timeline suggestions to add</legend>
          <ul className="space-y-2.5">
            {plan.timeline.map((activity, index) => {
              const issues = validation.timelineIssues[index] ?? [];
              const blocked = itemIsBlocked(issues);
              const checked = selection.timelineIndexes.includes(index);
              const descriptionId = `ai-timeline-issues-${index}`;

              return (
                <li
                  key={`${activity.title}-${index}`}
                  className={`rounded-2xl border px-3.5 py-3 ${
                    blocked
                      ? 'border-rust-100 bg-rust-50/35'
                      : 'border-line bg-surface-muted/40'
                  }`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked}
                      onChange={() => onToggleTimeline(index)}
                      aria-describedby={issues.length > 0 ? descriptionId : undefined}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-maroon-800)]"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-ink">
                          {activity.title}
                        </span>
                        <StatusBadge tone="neutral" showDot={false}>
                          {activity.priority} priority
                        </StatusBadge>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        <time dateTime={activity.startsAt}>
                          {formatActivityDateTime(activity.startsAt)}
                        </time>{' '}
                        –{' '}
                        <time dateTime={activity.endsAt}>
                          {formatActivityDateTime(activity.endsAt)}
                        </time>
                        {activity.location ? ` · ${activity.location}` : ''}
                      </span>
                      {activity.description ? (
                        <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                          {activity.description}
                        </span>
                      ) : null}
                      <span id={descriptionId}>
                        <IssueList issues={issues} />
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
    </section>
  );
}

interface TaskSuggestionsProps {
  readonly plan: AiPlan;
  readonly validation: AiPlanValidation;
  readonly selection: AiPlanSelection;
  readonly onToggleTask: (index: number) => void;
}

export function TaskSuggestions({
  plan,
  validation,
  selection,
  onToggleTask,
}: TaskSuggestionsProps) {
  return (
    <section aria-labelledby="ai-tasks-heading" className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Proposed action list</p>
          <h2
            id="ai-tasks-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Task suggestions
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Selected tasks are added as open tasks with the due dates shown. Duplicate
            titles and invalid dates are blocked by the app.
          </p>
        </div>
        <ListTodo className="size-5 text-gold-700" aria-hidden="true" />
      </div>

      {plan.tasks.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-line bg-surface-muted/55 px-4 py-3 text-xs leading-relaxed text-ink-muted">
          This proposal contains no task suggestions.
        </p>
      ) : (
        <fieldset className="mt-4">
          <legend className="sr-only">Select task suggestions to add</legend>
          <ul className="space-y-2.5">
            {plan.tasks.map((task, index) => {
              const issues = validation.taskIssues[index] ?? [];
              const blocked = itemIsBlocked(issues);
              const checked = selection.taskIndexes.includes(index);
              const descriptionId = `ai-task-issues-${index}`;

              return (
                <li
                  key={`${task.title}-${index}`}
                  className={`rounded-2xl border px-3.5 py-3 ${
                    blocked
                      ? 'border-rust-100 bg-rust-50/35'
                      : 'border-line bg-surface-muted/40'
                  }`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={blocked}
                      onChange={() => onToggleTask(index)}
                      aria-describedby={issues.length > 0 ? descriptionId : undefined}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-maroon-800)]"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-ink">
                          {task.title}
                        </span>
                        <StatusBadge tone="neutral" showDot={false}>
                          {task.priority} priority
                        </StatusBadge>
                        {task.milestone ? (
                          <StatusBadge tone="info" showDot={false}>
                            Milestone
                          </StatusBadge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        Due{' '}
                        <time dateTime={task.dueDate}>
                          {formatTaskDate(task.dueDate)}
                        </time>
                      </span>
                      {task.description ? (
                        <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                          {task.description}
                        </span>
                      ) : null}
                      <span id={descriptionId}>
                        <IssueList issues={issues} />
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
    </section>
  );
}
