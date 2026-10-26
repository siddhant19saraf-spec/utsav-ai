import {
  AlertTriangle,
  CalendarDays,
  CornerUpLeft,
  LifeBuoy,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatEventDate, toIsoDate } from '@/lib/date';
import { formatMoney } from '@/lib/money';
import type { CelebrationEvent } from '@/types/domain';
import { calculateBudgetTotals } from '@/features/budget/calculations';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import { analyzeEventRescue } from './rescueEngine';
import {
  createRescueRequestFromForm,
  getInitialRescueForm,
  type RescueFormErrors,
  type RescueFormValues,
  type RescueTriState,
} from './rescueForm';
import { RescueFindingsPanel } from './RescueFindingsPanel';
import { RescueProposalPanel } from './RescueProposalPanel';
import type { RescueResult } from './rescueTypes';

const fieldIds = {
  startsAt: 'rescue-date',
  expectedGuests: 'rescue-guests',
  totalBudget: 'rescue-total',
  setting: 'rescue-setting',
  theme: 'rescue-theme',
  protected: 'rescue-protected',
} as const;

const fieldOrder = [
  'startsAt',
  'expectedGuests',
  'totalBudget',
  'setting',
  'theme',
  'protected',
] as const;

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function firstInvalidFieldId(errors: RescueFormErrors): string | null {
  for (const field of fieldOrder) {
    if (errors[field]) {
      return fieldIds[field];
    }
  }

  const minimumKey = Object.keys(errors).find((key) =>
    key.startsWith('minimum:'),
  );

  return minimumKey
    ? `rescue-minimum-${minimumKey.slice('minimum:'.length)}`
    : null;
}

function toTriState(value: string): RescueTriState {
  return value === 'yes' || value === 'no' ? value : '';
}

function TriStateSelect({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: RescueTriState;
  readonly onChange: (value: RescueTriState) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(toTriState(event.target.value))}
        className="field-control mt-1.5"
      >
        <option value="">Not recorded</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <p className="field-hint mt-1.5">{hint}</p>
    </div>
  );
}

export function EventRescuePage() {
  const { workspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('event');
  const selectedEvent =
    workspace.events.find((event) => event.id === requestedEventId) ??
    workspace.events[0] ??
    null;

  function handleEventChange(eventId: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('event', eventId);
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Event Rescue"
        title="Repair the plan, keep the truth visible"
        description="Compare the saved event with a temporary alternative, inspect every finding, and approve a fully validated plan only when you choose to. Budget arithmetic is deterministic integer paise — never AI — and nothing changes until you accept a proposal. Schedule overlaps and RSVP changes are surfaced for review, never applied automatically."
        actions={
          <Link to="/events" className="btn-secondary">
            <CalendarDays className="size-4" aria-hidden="true" />
            My events
          </Link>
        }
      />

      {!selectedEvent ? (
        <EmptyState
          icon={LifeBuoy}
          title="No event to rescue yet"
          description="Event Rescue compares a saved event with a proposed alternative. Create a celebration first, then add budget allocations and tasks so there is something concrete to evaluate."
          action={
            <Link to="/events" className="btn-primary">
              <Plus className="size-4" aria-hidden="true" />
              Create an event
            </Link>
          }
        />
      ) : (
        <>
          <SavedEventCard
            event={selectedEvent}
            events={workspace.events}
            onEventChange={handleEventChange}
          />
          <EventRescueContent key={selectedEvent.id} event={selectedEvent} />
        </>
      )}
    </div>
  );
}

function SavedEventCard({
  event,
  events,
  onEventChange,
}: {
  readonly event: CelebrationEvent;
  readonly events: readonly CelebrationEvent[];
  readonly onEventChange: (eventId: string) => void;
}) {
  const totals = calculateBudgetTotals(event.budget);

  return (
    <section
      aria-labelledby="rescue-event-heading"
      className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"
    >
      <div className="min-w-0">
        <p className="eyebrow">Saved event · original plan</p>
        <h2
          id="rescue-event-heading"
          className="mt-1 text-xl font-semibold tracking-[-0.01em] text-ink"
        >
          {event.name}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 text-gold-600" aria-hidden="true" />
            <time dateTime={event.startsAt}>{formatEventDate(event.startsAt)}</time>
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5 text-gold-600" aria-hidden="true" />
            {formatCount(event.expectedGuests)} expected guests
          </span>
          <span className="flex items-center gap-1.5">
            <Wallet className="size-3.5 text-gold-600" aria-hidden="true" />
            {formatMoney(event.budget.totalAvailable)} total
          </span>
          <StatusBadge tone={totals.isOverBudget ? 'danger' : 'success'} showDot={false}>
            {totals.isOverBudget
              ? `Over budget by ${formatMoney(totals.overrun)}`
              : 'Within budget'}
          </StatusBadge>
        </div>
      </div>

      <div className="w-full sm:w-72">
        <label htmlFor="rescue-event" className="field-label">
          Event to analyze
        </label>
        <select
          id="rescue-event"
          value={event.id}
          onChange={(changeEvent) => onEventChange(changeEvent.target.value)}
          className="field-control mt-1.5"
        >
          {events.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
        <p className="field-hint mt-1.5">
          Switching events never mixes data between celebrations.
        </p>
      </div>
    </section>
  );
}

function EventRescueContent({ event }: { readonly event: CelebrationEvent }) {
  const {
    workspace,
    applyRescueProposal,
    recordRescueProposal,
    clearRescueProposal,
  } = useWorkspace();
  const todayIso = toIsoDate(new Date());
  const [formValues, setFormValues] = useState<RescueFormValues>(() =>
    getInitialRescueForm(event),
  );
  const [formErrors, setFormErrors] = useState<RescueFormErrors>({});
  const [errorSummary, setErrorSummary] = useState('');
  const [result, setResult] = useState<RescueResult | null>(null);
  const [applyError, setApplyError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusRequestRef = useRef<'form' | 'result' | null>(null);

  useEffect(() => {
    const target = focusRequestRef.current;

    if (!target) {
      return;
    }

    focusRequestRef.current = null;

    if (target === 'form') {
      formHeadingRef.current?.focus();
    } else {
      resultHeadingRef.current?.focus();
    }
  });

  const acceptableProposal =
    result?.proposal &&
    result.feasible &&
    result.proposal.validation.isValid &&
    result.proposal.changes.length > 0
      ? result.proposal
      : null;

  function clearFieldError(field: string) {
    setFormErrors((current) => {
      if (!(field in current)) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function discardProposal() {
    if (result) {
      clearRescueProposal(event.id);
      setAnnouncement(
        'The previous proposal was discarded because the rescue requirements changed. Nothing was saved.',
      );
    }

    setResult(null);
    setApplyError('');
  }

  function updateField<K extends keyof RescueFormValues>(
    field: K,
    value: RescueFormValues[K],
  ) {
    setFormValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
    setErrorSummary('');
    discardProposal();
  }

  function updateMinimum(categoryId: string, value: string) {
    setFormValues((current) => ({
      ...current,
      minimums: { ...current.minimums, [categoryId]: value },
    }));
    clearFieldError(`minimum:${categoryId}`);
    setErrorSummary('');
    discardProposal();
  }

  function toggleProtected(categoryId: string, isProtected: boolean) {
    setFormValues((current) => ({
      ...current,
      protectedCategoryIds: isProtected
        ? current.protectedCategoryIds.includes(categoryId)
          ? current.protectedCategoryIds
          : [...current.protectedCategoryIds, categoryId]
        : current.protectedCategoryIds.filter((id) => id !== categoryId),
    }));
    clearFieldError('protected');
    setErrorSummary('');
    discardProposal();
  }

  function resetForm(message: string) {
    clearRescueProposal(event.id);
    setFormValues(getInitialRescueForm(event));
    setFormErrors({});
    setErrorSummary('');
    setResult(null);
    setApplyError('');
    setAnnouncement(message);
    focusRequestRef.current = 'form';
  }

  function handleAnalyze(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const built = createRescueRequestFromForm(event, formValues, todayIso);

    if (!built.ok) {
      setFormErrors(built.errors);
      setErrorSummary(
        'Some requirements need attention before a rescue analysis can run.',
      );
      setResult(null);
      setApplyError('');
      setAnnouncement(
        'The rescue request has validation errors. Nothing was analyzed or changed.',
      );
      const invalidFieldId = firstInvalidFieldId(built.errors);

      if (invalidFieldId) {
        document.getElementById(invalidFieldId)?.focus();
      }

      return;
    }

    setFormErrors({});
    setErrorSummary('');
    const analysis = analyzeEventRescue({
      event,
      tasks: workspace.tasks,
      activities: workspace.activities,
      guests: workspace.guests,
      cateringEstimate:
        workspace.cateringEstimates.find(
          (estimate) => estimate.eventId === event.id,
        ) ?? null,
      request: built.request,
      todayIso,
    });
    if (analysis.proposal) {
      recordRescueProposal(analysis.proposal);
    } else {
      clearRescueProposal(event.id);
    }

    setResult(analysis);
    setApplyError('');
    focusRequestRef.current = 'result';

    const ready =
      analysis.feasible &&
      analysis.proposal !== null &&
      analysis.proposal.validation.isValid &&
      analysis.proposal.changes.length > 0;
    setAnnouncement(
      ready
        ? `Analysis complete for ${event.name}. A rescue proposal is ready for review. Nothing has been applied.`
        : `Analysis complete for ${event.name}. No approvable proposal was generated. Nothing was applied.`,
    );
  }

  function handleAccept() {
    if (!result?.proposal) {
      return;
    }

    const applied = applyRescueProposal(result.proposal);

    if (applied.ok) {
      setFormValues(getInitialRescueForm(applied.event));
      setFormErrors({});
      setErrorSummary('');
      setResult(null);
      setApplyError('');
      setAnnouncement(applied.message);
      focusRequestRef.current = 'form';
      return;
    }

    setApplyError(applied.message);
    setAnnouncement('');

    if (applied.code === 'persistence') {
      return;
    }

    clearRescueProposal(event.id);
    setResult(null);
    focusRequestRef.current = 'form';
  }

  function handleReject() {
    resetForm(
      'Proposal rejected. The saved event is unchanged and your rescue requirements were reset to the saved values.',
    );
  }

  function handleReturn() {
    clearRescueProposal(event.id);
    setResult(null);
    setApplyError('');
    setAnnouncement('Returned to editing. No changes were applied.');
    focusRequestRef.current = 'form';
  }

  function renderMinimumInput(categoryId: string, categoryName: string) {
    const error = formErrors[`minimum:${categoryId}`];
    const inputId = `rescue-minimum-${categoryId}`;
    const errorId = `${inputId}-error`;

    return (
      <div className="mt-2.5">
        <label htmlFor={inputId} className="text-xs font-semibold text-ink-muted">
          Minimum repair floor for {categoryName}
        </label>
        <div className="relative mt-1">
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-ink-muted"
            aria-hidden="true"
          >
            ₹
          </span>
          <input
            id={inputId}
            name={`minimum-${categoryId}`}
            type="text"
            inputMode="decimal"
            value={formValues.minimums[categoryId] ?? ''}
            onChange={(changeEvent) =>
              updateMinimum(categoryId, changeEvent.target.value)
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoComplete="off"
            className={`field-control min-h-9 py-1.5 pl-7 text-sm ${error ? 'border-rust-600' : ''}`}
          />
        </div>
        {error ? (
          <p id={errorId} className="field-error mt-1.5">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <section className="surface-card p-5 sm:p-6" aria-labelledby="rescue-form-heading">
        <div>
          <p className="eyebrow">Rescue request</p>
          <h2
            ref={formHeadingRef}
            id="rescue-form-heading"
            tabIndex={-1}
            className="mt-1 text-xl font-semibold text-ink"
          >
            Describe the change to evaluate
          </h2>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-ink-muted">
            Values start from the saved event. Changing them describes a request; it does
            not save anything. Event Rescue evaluates the request with deterministic code
            and reports what it can and cannot repair.
          </p>
        </div>

        <form noValidate onSubmit={handleAnalyze} className="mt-5 space-y-5">
          <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface-muted/60 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-maroon-700"
              aria-hidden="true"
            />
            The analysis uses saved event, budget, task, activity, guest, and catering
            assumption data only. It does not change guest RSVPs or schedules, does not
            contact vendors, check live weather, use AI arithmetic, or verify physical
            accessibility.
          </p>

          {errorSummary ? (
            <div
              role="alert"
              className="rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3.5 text-sm text-rust-700"
            >
              <p className="font-semibold">{errorSummary}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                {Object.entries(formErrors).map(([key, message]) => (
                  <li key={key}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <label htmlFor={fieldIds.startsAt} className="field-label">
                Event date
              </label>
              <input
                id={fieldIds.startsAt}
                name="startsAt"
                type="date"
                value={formValues.startsAt}
                min={todayIso}
                onChange={(changeEvent) =>
                  updateField('startsAt', changeEvent.target.value)
                }
                aria-invalid={formErrors.startsAt ? true : undefined}
                aria-describedby={
                  formErrors.startsAt ? 'rescue-date-error' : undefined
                }
                className={`field-control mt-1.5 ${formErrors.startsAt ? 'border-rust-600' : ''}`}
              />
              {formErrors.startsAt ? (
                <p id="rescue-date-error" className="field-error mt-1.5">
                  {formErrors.startsAt}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={fieldIds.expectedGuests} className="field-label">
                Expected guests
              </label>
              <input
                id={fieldIds.expectedGuests}
                name="expectedGuests"
                type="text"
                inputMode="numeric"
                value={formValues.expectedGuests}
                onChange={(changeEvent) =>
                  updateField('expectedGuests', changeEvent.target.value)
                }
                aria-invalid={formErrors.expectedGuests ? true : undefined}
                aria-describedby={
                  formErrors.expectedGuests ? 'rescue-guests-error' : undefined
                }
                autoComplete="off"
                className={`field-control mt-1.5 ${formErrors.expectedGuests ? 'border-rust-600' : ''}`}
              />
              {formErrors.expectedGuests ? (
                <p id="rescue-guests-error" className="field-error mt-1.5">
                  {formErrors.expectedGuests}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={fieldIds.totalBudget} className="field-label">
                Total budget (INR)
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
                  aria-hidden="true"
                >
                  ₹
                </span>
                <input
                  id={fieldIds.totalBudget}
                  name="totalBudget"
                  type="text"
                  inputMode="decimal"
                  value={formValues.totalBudget}
                  onChange={(changeEvent) =>
                    updateField('totalBudget', changeEvent.target.value)
                  }
                  aria-invalid={formErrors.totalBudget ? true : undefined}
                  aria-describedby={
                    formErrors.totalBudget ? 'rescue-total-error' : undefined
                  }
                  autoComplete="off"
                  className={`field-control mt-1.5 pl-8 ${formErrors.totalBudget ? 'border-rust-600' : ''}`}
                />
              </div>
              {formErrors.totalBudget ? (
                <p id="rescue-total-error" className="field-error mt-1.5">
                  {formErrors.totalBudget}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldIds.setting} className="field-label">
                Indoor or outdoor setting
              </label>
              <select
                id={fieldIds.setting}
                name="setting"
                value={formValues.setting}
                onChange={(changeEvent) =>
                  updateField(
                    'setting',
                    changeEvent.target.value === 'indoor' ||
                      changeEvent.target.value === 'outdoor' ||
                      changeEvent.target.value === 'mixed'
                      ? changeEvent.target.value
                      : '',
                  )
                }
                aria-invalid={formErrors.setting ? true : undefined}
                aria-describedby={
                  formErrors.setting ? 'rescue-setting-error' : undefined
                }
                className={`field-control mt-1.5 ${formErrors.setting ? 'border-rust-600' : ''}`}
              >
                <option value="">Not recorded</option>
                <option value="indoor">Indoor</option>
                <option value="outdoor">Outdoor</option>
                <option value="mixed">Indoor and outdoor</option>
              </select>
              {formErrors.setting ? (
                <p id="rescue-setting-error" className="field-error mt-1.5">
                  {formErrors.setting}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={fieldIds.theme} className="field-label">
                Theme <span className="font-normal text-ink-soft">(optional)</span>
              </label>
              <input
                id={fieldIds.theme}
                name="theme"
                type="text"
                value={formValues.theme}
                maxLength={80}
                onChange={(changeEvent) =>
                  updateField('theme', changeEvent.target.value)
                }
                aria-invalid={formErrors.theme ? true : undefined}
                aria-describedby={
                  formErrors.theme ? 'rescue-theme-error' : undefined
                }
                autoComplete="off"
                placeholder="Planning context only; no arithmetic depends on it"
                className={`field-control mt-1.5 ${formErrors.theme ? 'border-rust-600' : ''}`}
              />
              {formErrors.theme ? (
                <p id="rescue-theme-error" className="field-error mt-1.5">
                  {formErrors.theme}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TriStateSelect
              id="rescue-accessibility-required"
              label="Accessibility required"
              hint="Records your answer; Event Rescue cannot verify needs."
              value={formValues.accessibilityRequired}
              onChange={(value) =>
                updateField('accessibilityRequired', value)
              }
            />
            <TriStateSelect
              id="rescue-accessibility-addressed"
              label="Accessibility addressed"
              hint="Only mark yes after the venue confirms the arrangements."
              value={formValues.accessibilityAddressed}
              onChange={(value) =>
                updateField('accessibilityAddressed', value)
              }
            />
            <TriStateSelect
              id="rescue-contingency-confirmed"
              label="Outdoor contingency confirmed"
              hint="Confirmation records your plan; it does not verify a venue."
              value={formValues.contingencyPlanConfirmed}
              onChange={(value) =>
                updateField('contingencyPlanConfirmed', value)
              }
            />
          </div>

          <fieldset
            id={fieldIds.protected}
            tabIndex={-1}
            aria-describedby={
              formErrors.protected
                ? 'rescue-protected-hint rescue-protected-error'
                : 'rescue-protected-hint'
            }
            className="rounded-2xl border border-line bg-surface-muted/40 p-4"
          >
            <legend className="px-1 text-sm font-semibold text-ink">
              Protected priorities and repair floors
            </legend>
            <p id="rescue-protected-hint" className="mt-1 text-xs leading-relaxed text-ink-muted">
              Protect any category to exclude it from reductions in this analysis. Saved
              protections cannot be removed here — change the base protection in the
              Budget Planner. Minimums apply only to categories eligible for reduction.
            </p>

            <ul className="mt-3 grid gap-2.5 lg:grid-cols-2">
              {event.budget.categories.map((category) => {
                const savedProtected = category.flexibility.mode === 'protected';
                const selected = formValues.protectedCategoryIds.includes(
                  category.id,
                );
                const protectedForAnalysis = savedProtected || selected;
                const checkboxId = `rescue-protect-${category.id}`;

                return (
                  <li
                    key={category.id}
                    className="rounded-xl border border-line bg-surface px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {savedProtected ? (
                        <span className="flex items-center gap-2 text-sm font-medium text-ink">
                          <ShieldCheck
                            className="size-4 text-maroon-700"
                            aria-hidden="true"
                          />
                          {category.name}
                        </span>
                      ) : (
                        <label
                          htmlFor={checkboxId}
                          className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink"
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            checked={selected}
                            onChange={(changeEvent) =>
                              toggleProtected(
                                category.id,
                                changeEvent.target.checked,
                              )
                            }
                            className="size-4 accent-maroon-700"
                          />
                          {category.name}
                        </label>
                      )}
                      <span className="text-xs text-ink-muted tabular-nums">
                        {formatMoney(category.planned)} planned
                      </span>
                    </div>

                    {savedProtected ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                        Protected in the saved budget. This analysis will never reduce
                        it.
                      </p>
                    ) : protectedForAnalysis ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                        Protected for this analysis only. Its minimum is not used.
                      </p>
                    ) : (
                      renderMinimumInput(category.id, category.name)
                    )}
                  </li>
                );
              })}
            </ul>

            {formErrors.protected ? (
              <p id="rescue-protected-error" className="field-error mt-2">
                {formErrors.protected}
              </p>
            ) : null}
          </fieldset>

          <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() =>
                resetForm(
                  'Rescue requirements reset to the saved event. Nothing was changed.',
                )
              }
              className="btn-secondary"
            >
              Reset to saved values
            </button>
            <button type="submit" className="btn-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Analyze rescue options
            </button>
          </div>
        </form>
      </section>

      {applyError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3.5 text-sm leading-relaxed text-rust-700"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{applyError}</p>
            <p className="mt-1 text-xs">
              The saved event was not partially updated.{' '}
              {result
                ? 'The proposal is still shown so you can retry acceptance or reject it.'
                : 'Adjust the requirements and analyze again.'}
            </p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-5">
          <section
            className="surface-card p-5 sm:p-6"
            aria-labelledby="rescue-results-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Analysis result</p>
                <h2
                  ref={resultHeadingRef}
                  id="rescue-results-heading"
                  tabIndex={-1}
                  className="mt-1 text-xl font-semibold text-ink"
                >
                  Rescue analysis for {event.name}
                </h2>
              </div>
              <StatusBadge
                tone={
                  acceptableProposal
                    ? 'success'
                    : result.feasible
                      ? 'warning'
                      : 'danger'
                }
                showDot={false}
              >
                {acceptableProposal
                  ? 'Proposal ready for review'
                  : result.feasible
                    ? 'No approvable changes'
                    : 'No approvable plan'}
              </StatusBadge>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
              {result.explanation}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Nothing has been applied to the saved event. Review the findings and every
              proposed action before deciding.
            </p>
          </section>

          <RescueFindingsPanel
            findings={result.findings}
            categories={event.budget.categories}
          />

          {result.proposal ? (
            <RescueProposalPanel
              proposal={result.proposal}
              approvable={acceptableProposal !== null}
              onAccept={handleAccept}
              onReject={handleReject}
              onReturn={handleReturn}
            />
          ) : (
            <section
              className="surface-card p-5 sm:p-6"
              aria-labelledby="rescue-no-proposal-heading"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-rust-100 bg-rust-50 text-rust-700"
                  aria-hidden="true"
                >
                  <AlertTriangle className="size-5" strokeWidth={1.8} />
                </span>
                <div>
                  <h2
                    id="rescue-no-proposal-heading"
                    className="text-lg font-semibold text-ink"
                  >
                    No proposal was generated
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    {result.explanation}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                    No saved data was modified. Correct the highlighted requirements or
                    review the constraints above, then analyze again.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReturn}
                className="btn-secondary mt-4"
              >
                <CornerUpLeft className="size-4" aria-hidden="true" />
                Return to editing
              </button>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
