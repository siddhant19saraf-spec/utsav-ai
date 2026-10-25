import { CalendarPlus, Save, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { CelebrationEvent } from '@/types/domain';
import { toIsoDate } from '@/lib/date';
import { eventCategories, eventCategoryLabels } from '@/lib/eventMeta';
import {
  getEventFormValues,
  getInitialEventForm,
  validateEventForm,
  type EventFormErrors,
  type EventFormValues,
} from './eventForm';
import type { EventDraft } from './eventMutations';

interface EventFormDialogProps {
  readonly open: boolean;
  readonly event?: CelebrationEvent;
  readonly onClose: () => void;
  readonly onSubmit: (draft: EventDraft) => void;
}

type EventFormDialogContentProps = Omit<EventFormDialogProps, 'open'>;

const FIELD_ORDER: readonly (keyof EventFormValues)[] = [
  'name',
  'category',
  'startsAt',
  'venue',
  'expectedGuests',
  'budget',
];

export function EventFormDialog({
  open,
  event,
  onClose,
  onSubmit,
}: EventFormDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <EventFormDialogContent
      {...(event ? { event } : {})}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function EventFormDialogContent({
  event,
  onClose,
  onSubmit,
}: EventFormDialogContentProps) {
  const isEditing = event !== undefined;
  const [todayIso] = useState(() => toIsoDate(new Date()));
  const [values, setValues] = useState<EventFormValues>(() =>
    event ? getEventFormValues(event) : getInitialEventForm(todayIso),
  );
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [errorSummary, setErrorSummary] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  const fieldIds: Record<keyof EventFormValues, string> = {
    name: `${baseId}-name`,
    category: `${baseId}-category`,
    startsAt: `${baseId}-date`,
    venue: `${baseId}-venue`,
    expectedGuests: `${baseId}-guests`,
    budget: `${baseId}-budget`,
  };
  const errorIds: Record<keyof EventFormValues, string> = {
    name: `${baseId}-name-error`,
    category: `${baseId}-category-error`,
    startsAt: `${baseId}-date-error`,
    venue: `${baseId}-venue-error`,
    expectedGuests: `${baseId}-guests-error`,
    budget: `${baseId}-budget-error`,
  };
  const headingId = `${baseId}-heading`;
  const descriptionId = `${baseId}-description`;
  const guestHintId = `${baseId}-guests-hint`;
  const budgetHintId = `${baseId}-budget-hint`;
  const errorSummaryId = `${baseId}-error-summary`;

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nameInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
        ) ?? [],
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  function updateField<K extends keyof EventFormValues>(
    field: K,
    value: EventFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
    setErrorSummary('');
  }

  function handleCategoryChange(value: string) {
    const nextCategory = eventCategories.find((category) => category === value);

    if (nextCategory) {
      updateField('category', nextCategory);
    }
  }

  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const result = validateEventForm(
      values,
      todayIso,
      event ? { originalStartsAt: event.startsAt } : {},
    );

    if (!result.ok) {
      setErrors(result.errors);
      setErrorSummary(
        `Please fix the highlighted fields before ${
          isEditing ? 'saving the event' : 'creating the event'
        }.`,
      );
      const firstInvalidField = FIELD_ORDER.find((field) => result.errors[field]);

      if (firstInvalidField) {
        document.getElementById(fieldIds[firstInvalidField])?.focus();
      }

      return;
    }

    setErrors({});
    setErrorSummary('');
    onSubmit(result.draft);
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-maroon-950/55 p-4 sm:p-6"
      onMouseDown={handleBackdropMouseDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        className="dialog-enter relative mx-auto my-4 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-surface shadow-lift sm:my-8"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7 sm:py-6">
          <div>
            <p className="eyebrow">{isEditing ? 'Event details' : 'New celebration'}</p>
            <h2
              id={headingId}
              className="mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.015em] text-ink"
            >
              {isEditing ? 'Edit event' : 'Create a new event'}
            </h2>
            <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {isEditing
                ? 'Update this event’s details. Its budget categories, tasks, guests, timeline, and risk history stay attached to this event.'
                : 'Add the essentials now. The event starts with an empty, isolated budget you can build in the Budget Planner.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event dialog"
            className="btn-icon"
          >
            <X className="size-4.5" aria-hidden="true" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="space-y-5 px-5 py-6 sm:px-7">
          {errorSummary ? (
            <div
              id={errorSummaryId}
              role="alert"
              className="rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-sm font-medium text-rust-700"
            >
              {errorSummary}
            </div>
          ) : null}

          <div>
            <label htmlFor={fieldIds.name} className="field-label">
              Event name
            </label>
            <input
              ref={nameInputRef}
              id={fieldIds.name}
              name="name"
              type="text"
              value={values.name}
              onChange={(event) => updateField('name', event.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? errorIds.name : undefined}
              autoComplete="off"
              placeholder="Ananya & Rohan’s Wedding"
              className={`field-control mt-1.5 ${errors.name ? 'border-rust-600' : ''}`}
            />
            {errors.name ? (
              <p id={errorIds.name} className="field-error mt-1.5">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldIds.category} className="field-label">
                Category
              </label>
              <select
                id={fieldIds.category}
                name="category"
                value={values.category}
                onChange={(event) => handleCategoryChange(event.target.value)}
                aria-invalid={errors.category ? true : undefined}
                aria-describedby={errors.category ? errorIds.category : undefined}
                className={`field-control mt-1.5 ${errors.category ? 'border-rust-600' : ''}`}
              >
                {eventCategories.map((category) => (
                  <option key={category} value={category}>
                    {eventCategoryLabels[category]}
                  </option>
                ))}
              </select>
              {errors.category ? (
                <p id={errorIds.category} className="field-error mt-1.5">
                  {errors.category}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={fieldIds.startsAt} className="field-label">
                Event date
              </label>
              <input
                id={fieldIds.startsAt}
                name="startsAt"
                type="date"
                min={
                  event && event.startsAt < todayIso ? event.startsAt : todayIso
                }
                value={values.startsAt}
                onChange={(event) => updateField('startsAt', event.target.value)}
                aria-invalid={errors.startsAt ? true : undefined}
                aria-describedby={errors.startsAt ? errorIds.startsAt : undefined}
                className={`field-control mt-1.5 ${errors.startsAt ? 'border-rust-600' : ''}`}
              />
              {errors.startsAt ? (
                <p id={errorIds.startsAt} className="field-error mt-1.5">
                  {errors.startsAt}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor={fieldIds.venue} className="field-label">
              Venue <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input
              id={fieldIds.venue}
              name="venue"
              type="text"
              value={values.venue}
              onChange={(event) => updateField('venue', event.target.value)}
              aria-invalid={errors.venue ? true : undefined}
              aria-describedby={errors.venue ? errorIds.venue : undefined}
              autoComplete="off"
              placeholder="The Leela Palace, Bengaluru"
              className={`field-control mt-1.5 ${errors.venue ? 'border-rust-600' : ''}`}
            />
            {errors.venue ? (
              <p id={errorIds.venue} className="field-error mt-1.5">
                {errors.venue}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldIds.expectedGuests} className="field-label">
                Expected guests
              </label>
              <input
                id={fieldIds.expectedGuests}
                name="expectedGuests"
                type="number"
                inputMode="numeric"
                min={1}
                max={100_000}
                step={1}
                value={values.expectedGuests}
                onChange={(event) => updateField('expectedGuests', event.target.value)}
                aria-invalid={errors.expectedGuests ? true : undefined}
                aria-describedby={
                  errors.expectedGuests
                    ? `${guestHintId} ${errorIds.expectedGuests}`
                    : guestHintId
                }
                placeholder="120"
                className={`field-control mt-1.5 ${errors.expectedGuests ? 'border-rust-600' : ''}`}
              />
              <p id={guestHintId} className="field-hint mt-1.5">
                A whole number between 1 and 1,00,000.
              </p>
              {errors.expectedGuests ? (
                <p id={errorIds.expectedGuests} className="field-error mt-1.5">
                  {errors.expectedGuests}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={fieldIds.budget} className="field-label">
                Budget (INR)
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
                  aria-hidden="true"
                >
                  ₹
                </span>
                <input
                  id={fieldIds.budget}
                  name="budget"
                  type="text"
                  inputMode="decimal"
                  value={values.budget}
                  onChange={(event) => updateField('budget', event.target.value)}
                  aria-invalid={errors.budget ? true : undefined}
                  aria-describedby={
                    errors.budget ? `${budgetHintId} ${errorIds.budget}` : budgetHintId
                  }
                  autoComplete="off"
                  placeholder="12,50,000"
                  className={`field-control mt-1.5 pl-8 ${errors.budget ? 'border-rust-600' : ''}`}
                />
              </div>
              <p id={budgetHintId} className="field-hint mt-1.5">
                Whole rupees with up to two decimal places accepted.
              </p>
              {errors.budget ? (
                <p id={errorIds.budget} className="field-error mt-1.5">
                  {errors.budget}
                </p>
              ) : null}
            </div>
          </div>

          <p className="rounded-2xl border border-line bg-surface-muted px-4 py-3 text-xs leading-relaxed text-ink-muted">
            {isEditing
              ? 'Changes are saved in this browser’s local storage. Other events are not affected.'
              : 'This event and its budget are saved in this browser’s local storage. No hosted data backend or account is connected.'}
          </p>

          <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {isEditing ? (
                <Save className="size-4" aria-hidden="true" />
              ) : (
                <CalendarPlus className="size-4" aria-hidden="true" />
              )}
              {isEditing ? 'Save changes' : 'Create event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
