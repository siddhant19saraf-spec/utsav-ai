import { CalendarPlus, Save } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { ModalDialog } from '@/components/ModalDialog';
import { formatEventDate } from '@/lib/date';
import type {
  ActivityPriority,
  CelebrationEvent,
  TimelineActivity,
} from '@/types/domain';
import {
  normalizeActivityDraft,
  validateActivityDraft,
  type ActivityDraft,
  type ActivityFormErrors,
  type ActivityFormField,
} from './activityRules';

interface ActivityDialogProps {
  readonly open: boolean;
  readonly event: CelebrationEvent;
  readonly activity: TimelineActivity | null;
  readonly onClose: () => void;
  readonly onSave: (draft: ActivityDraft) => void;
}

const fieldOrder: readonly ActivityFormField[] = [
  'title',
  'startsAt',
  'endsAt',
  'description',
  'location',
];

const priorityOptions: readonly { value: ActivityPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function initialDraft(
  event: CelebrationEvent,
  activity: TimelineActivity | null,
): ActivityDraft {
  if (activity) {
    return {
      title: activity.title,
      description: activity.description ?? '',
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
      priority: activity.priority,
      status: activity.status,
      location: activity.location ?? '',
    };
  }

  return {
    title: '',
    description: '',
    startsAt: `${event.startsAt}T10:00`,
    endsAt: `${event.startsAt}T11:00`,
    priority: 'medium',
    status: 'scheduled',
    location: '',
  };
}

export function ActivityDialog({
  open,
  event,
  activity,
  onClose,
  onSave,
}: ActivityDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <ActivityDialogContent
      key={activity?.id ?? 'new'}
      event={event}
      activity={activity}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function ActivityDialogContent({
  event,
  activity,
  onClose,
  onSave,
}: Omit<ActivityDialogProps, 'open'>) {
  const [values, setValues] = useState<ActivityDraft>(() =>
    initialDraft(event, activity),
  );
  const [errors, setErrors] = useState<ActivityFormErrors>({});
  const [errorSummary, setErrorSummary] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  const fieldIds: Record<ActivityFormField, string> = {
    title: 'activity-title',
    startsAt: 'activity-starts-at',
    endsAt: 'activity-ends-at',
    description: 'activity-description',
    location: 'activity-location',
  };

  function updateField<K extends keyof ActivityDraft>(
    field: K,
    value: ActivityDraft[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) {
        return current;
      }

      const next = { ...current };
      delete next[field as ActivityFormField];
      return next;
    });
    setErrorSummary('');
  }

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    if (submittedRef.current) {
      return;
    }

    const draft = normalizeActivityDraft(values);
    const nextErrors = validateActivityDraft(draft);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setErrorSummary('Please fix the highlighted fields before saving the activity.');
      const firstInvalid = fieldOrder.find((field) => nextErrors[field]);

      if (firstInvalid) {
        document.getElementById(fieldIds[firstInvalid])?.focus();
      }

      return;
    }

    submittedRef.current = true;
    setErrors({});
    setErrorSummary('');
    onSave(draft);
  }

  return (
    <ModalDialog
      open
      eyebrow={activity ? 'Edit activity' : 'New activity'}
      title={activity ? 'Update this activity' : 'Add an activity to the timeline'}
      description={`${event.name} · ${formatEventDate(event.startsAt)}. Times are local to this device and stored without a timezone offset.`}
      onClose={onClose}
      initialFocusRef={titleRef}
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5 px-5 py-6 sm:px-7">
        {errorSummary ? (
          <div
            role="alert"
            className="rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-sm font-medium text-rust-700"
          >
            {errorSummary}
          </div>
        ) : null}

        <div>
          <label htmlFor={fieldIds.title} className="field-label">
            Activity title
          </label>
          <input
            ref={titleRef}
            id={fieldIds.title}
            name="title"
            type="text"
            value={values.title}
            maxLength={160}
            onChange={(changeEvent) => updateField('title', changeEvent.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? 'activity-title-error' : undefined}
            autoComplete="off"
            placeholder="Welcome dinner"
            className={`field-control mt-1.5 ${errors.title ? 'border-rust-600' : ''}`}
          />
          {errors.title ? (
            <p id="activity-title-error" className="field-error mt-1.5">
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldIds.startsAt} className="field-label">
              Starts
            </label>
            <input
              id={fieldIds.startsAt}
              name="startsAt"
              type="datetime-local"
              value={values.startsAt}
              onChange={(changeEvent) => updateField('startsAt', changeEvent.target.value)}
              aria-invalid={errors.startsAt ? true : undefined}
              aria-describedby={errors.startsAt ? 'activity-starts-error' : undefined}
              className={`field-control mt-1.5 ${errors.startsAt ? 'border-rust-600' : ''}`}
            />
            {errors.startsAt ? (
              <p id="activity-starts-error" className="field-error mt-1.5">
                {errors.startsAt}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={fieldIds.endsAt} className="field-label">
              Ends
            </label>
            <input
              id={fieldIds.endsAt}
              name="endsAt"
              type="datetime-local"
              value={values.endsAt}
              onChange={(changeEvent) => updateField('endsAt', changeEvent.target.value)}
              aria-invalid={errors.endsAt ? true : undefined}
              aria-describedby={
                errors.endsAt ? 'activity-ends-hint activity-ends-error' : 'activity-ends-hint'
              }
              className={`field-control mt-1.5 ${errors.endsAt ? 'border-rust-600' : ''}`}
            />
            <p id="activity-ends-hint" className="field-hint mt-1.5">
              The end must be later than the start.
            </p>
            {errors.endsAt ? (
              <p id="activity-ends-error" className="field-error mt-1.5">
                {errors.endsAt}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="activity-priority" className="field-label">
              Priority
            </label>
            <select
              id="activity-priority"
              name="priority"
              value={values.priority}
              onChange={(changeEvent) =>
                updateField(
                  'priority',
                  changeEvent.target.value === 'low' ||
                    changeEvent.target.value === 'high'
                    ? changeEvent.target.value
                    : 'medium',
                )
              }
              className="field-control mt-1.5"
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={fieldIds.location} className="field-label">
              Location <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input
              id={fieldIds.location}
              name="location"
              type="text"
              value={values.location}
              maxLength={160}
              onChange={(changeEvent) => updateField('location', changeEvent.target.value)}
              aria-invalid={errors.location ? true : undefined}
              aria-describedby={errors.location ? 'activity-location-error' : undefined}
              autoComplete="off"
              placeholder="Garden lawn"
              className={`field-control mt-1.5 ${errors.location ? 'border-rust-600' : ''}`}
            />
            {errors.location ? (
              <p id="activity-location-error" className="field-error mt-1.5">
                {errors.location}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor={fieldIds.description} className="field-label">
            Description <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <textarea
            id={fieldIds.description}
            name="description"
            rows={3}
            value={values.description}
            maxLength={1_000}
            onChange={(changeEvent) => updateField('description', changeEvent.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'activity-description-error' : undefined}
            className={`field-control mt-1.5 resize-y ${errors.description ? 'border-rust-600' : ''}`}
          />
          {errors.description ? (
            <p id="activity-description-error" className="field-error mt-1.5">
              {errors.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {activity ? (
              <Save className="size-4" aria-hidden="true" />
            ) : (
              <CalendarPlus className="size-4" aria-hidden="true" />
            )}
            {activity ? 'Save changes' : 'Add activity'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
