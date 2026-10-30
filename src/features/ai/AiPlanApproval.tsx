import { CheckCircle2, Eye } from 'lucide-react';
import { formatTaskDate } from '@/lib/date';
import { formatActivityDateTime } from '@/lib/dateTime';
import type { AiPlan } from './contracts';
import type { AiPlanSelection } from './aiPlanPresentation';
import {
  selectionHasBlockingIssues,
  type AiPlanValidation,
} from './planValidation';

interface AiPlanApprovalProps {
  readonly plan: AiPlan;
  readonly validation: AiPlanValidation;
  readonly selection: AiPlanSelection;
  readonly previewOpen: boolean;
  readonly onPreview: () => void;
  readonly onCancelPreview: () => void;
  readonly onApply: () => void;
  readonly applyPending: boolean;
  readonly applyError: string;
  readonly appliedMessage: string;
  readonly stale: boolean;
  readonly eventId: string | null;
  readonly eventName: string | null;
}

export function AiPlanApproval({
  plan,
  validation,
  selection,
  previewOpen,
  onPreview,
  onCancelPreview,
  onApply,
  applyPending,
  applyError,
  appliedMessage,
  stale,
  eventId,
  eventName,
}: AiPlanApprovalProps) {
  const blockingSelection = selectionHasBlockingIssues(
    validation,
    selection.timelineIndexes,
    selection.taskIndexes,
  );
  const selectedCount =
    selection.timelineIndexes.length + selection.taskIndexes.length;
  const canPreview =
    eventId !== null &&
    selectedCount > 0 &&
    !blockingSelection &&
    !stale &&
    !appliedMessage;

  return (
    <section
      aria-labelledby="ai-apply-heading"
      className="surface-card border-maroon-100 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Approval</p>
          <h2
            id="ai-apply-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
          >
            Preview and add selected items
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Nothing is applied automatically. On approval, the app revalidates this
            plan against the latest saved event and adds only the selected tasks and
            activities. Budgets, guests, protected priorities, and the event itself are
            never changed.
          </p>
        </div>
        <span className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold text-ink-muted tabular-nums">
          {selectedCount} selected
        </span>
      </div>

      {appliedMessage ? (
        <div
          role="status"
          className="mt-4 rounded-2xl border border-sage-100 bg-sage-50/70 px-4 py-3"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-sage-700">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Additions approved
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {appliedMessage}
          </p>
        </div>
      ) : eventId === null ? (
        <p className="mt-4 rounded-2xl border border-gold-200 bg-gold-50/60 px-4 py-3 text-xs leading-relaxed text-ink-muted">
          This is an advisory plan because no saved event is selected. Create or select
          an event to apply task and timeline additions. Budget suggestions remain
          advisory in every case.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            {eventName
              ? `Additions would be attached to “${eventName}”.`
              : 'Additions would be attached to the selected event.'}
          </p>

          {stale ? (
            <p
              role="alert"
              className="mt-3 rounded-2xl border border-gold-200 bg-gold-50/70 px-4 py-3 text-xs leading-relaxed text-ink-muted"
            >
              The event, budget, guests, tasks, activities, or open risks changed after
              this plan was generated. Applying is disabled. Generate a fresh plan to
              review the latest state.
            </p>
          ) : null}

          {blockingSelection ? (
            <p
              role="alert"
              className="mt-3 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-xs leading-relaxed text-rust-700"
            >
              At least one selected item has a blocker or duplicate. Deselect it before
              previewing the additions.
            </p>
          ) : null}

          {applyError ? (
            <p
              role="alert"
              className="mt-3 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-xs leading-relaxed text-rust-700"
            >
              {applyError}
            </p>
          ) : null}

          {previewOpen ? (
            <div
              role="region"
              aria-labelledby="ai-preview-heading"
              className="mt-4 rounded-2xl border border-line-strong bg-surface-muted/55 px-4 py-4"
            >
              <h3
                id="ai-preview-heading"
                className="text-sm font-semibold text-ink"
              >
                Exact changes to add
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                    Tasks to create ({selection.taskIndexes.length})
                  </p>
                  {selection.taskIndexes.length === 0 ? (
                    <p className="mt-1 text-xs text-ink-muted">None selected.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
                      {selection.taskIndexes.map((index) => {
                        const task = plan.tasks[index];

                        return task ? (
                          <li
                            key={`preview-task-${index}`}
                            className="text-xs leading-relaxed text-ink-muted"
                          >
                            · {task.title} · due {formatTaskDate(task.dueDate)}
                          </li>
                        ) : null;
                      })}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                    Activities to create ({selection.timelineIndexes.length})
                  </p>
                  {selection.timelineIndexes.length === 0 ? (
                    <p className="mt-1 text-xs text-ink-muted">None selected.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1">
                      {selection.timelineIndexes.map((index) => {
                        const activity = plan.timeline[index];

                        return activity ? (
                          <li
                            key={`preview-activity-${index}`}
                            className="text-xs leading-relaxed text-ink-muted"
                          >
                            · {activity.title} ·{' '}
                            {formatActivityDateTime(activity.startsAt)}
                          </li>
                        ) : null;
                      })}
                    </ul>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-soft">
                The app will create new open tasks and scheduled activities. It will
                not delete, move, or edit anything that already exists.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onApply}
                  disabled={applyPending || !canPreview}
                  className="btn-primary min-h-10 px-4 py-2 text-xs"
                >
                  {applyPending ? 'Adding…' : 'Approve and add to event'}
                </button>
                <button
                  type="button"
                  onClick={onCancelPreview}
                  disabled={applyPending}
                  className="btn-secondary min-h-10 px-4 py-2 text-xs"
                >
                  Back to selection
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onPreview}
                disabled={!canPreview}
                className="btn-primary min-h-10 px-4 py-2 text-xs"
              >
                <Eye className="size-4" aria-hidden="true" />
                Preview selected changes
              </button>
              <span className="text-xs leading-relaxed text-ink-muted">
                {selectedCount === 0
                  ? 'Select at least one task or activity.'
                  : stale
                    ? 'Generate a fresh plan before applying.'
                    : blockingSelection
                      ? 'Deselect blocked items to continue.'
                      : 'A second confirmation is required before anything is saved.'}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
