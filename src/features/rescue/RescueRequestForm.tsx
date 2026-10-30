import { ShieldCheck } from 'lucide-react';
import type { FormEvent, RefObject } from 'react';
import { FieldError } from '@/components/FieldError';
import { formatMoney } from '@/lib/money';
import type { CelebrationEvent } from '@/types/domain';
import {
  rescueFieldIds,
  rescueMinimumFieldId,
  type RescueFormErrors,
  type RescueFormValues,
  type RescueTriState,
} from './rescueForm';

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

interface RescueRequestFormProps {
  readonly event: CelebrationEvent;
  readonly todayIso: string;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly values: RescueFormValues;
  readonly errors: RescueFormErrors;
  readonly errorSummary: string;
  readonly onFieldChange: <K extends keyof RescueFormValues>(
    field: K,
    value: RescueFormValues[K],
  ) => void;
  readonly onMinimumChange: (categoryId: string, value: string) => void;
  readonly onToggleProtected: (categoryId: string, isProtected: boolean) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onReset: () => void;
}

export function RescueRequestForm({
  event,
  todayIso,
  headingRef,
  values,
  errors,
  errorSummary,
  onFieldChange,
  onMinimumChange,
  onToggleProtected,
  onSubmit,
  onReset,
}: RescueRequestFormProps) {
  function renderMinimumInput(categoryId: string, categoryName: string) {
    const error = errors[`minimum:${categoryId}`];
    const inputId = rescueMinimumFieldId(categoryId);
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
            value={values.minimums[categoryId] ?? ''}
            onChange={(changeEvent) =>
              onMinimumChange(categoryId, changeEvent.target.value)
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            autoComplete="off"
            className={`field-control min-h-9 py-1.5 pl-7 text-sm ${error ? 'border-rust-600' : ''}`}
          />
        </div>
        {error ? (
          <FieldError id={errorId}>{error}</FieldError>
        ) : null}
      </div>
    );
  }

  return (
    <section className="surface-card p-5 sm:p-6" aria-labelledby="rescue-form-heading">
      <div>
        <p className="eyebrow">Rescue request</p>
        <h2
          ref={headingRef}
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

      <form noValidate onSubmit={onSubmit} className="mt-5 space-y-5">
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
              {Object.entries(errors).map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label htmlFor={rescueFieldIds.startsAt} className="field-label">
              Event date
            </label>
            <input
              id={rescueFieldIds.startsAt}
              name="startsAt"
              type="date"
              value={values.startsAt}
              min={todayIso}
              onChange={(changeEvent) =>
                onFieldChange('startsAt', changeEvent.target.value)
              }
              aria-invalid={errors.startsAt ? true : undefined}
              aria-describedby={
                errors.startsAt ? 'rescue-date-error' : undefined
              }
              className={`field-control mt-1.5 ${errors.startsAt ? 'border-rust-600' : ''}`}
            />
            {errors.startsAt ? (
              <FieldError id="rescue-date-error">{errors.startsAt}</FieldError>
            ) : null}
          </div>

          <div>
            <label htmlFor={rescueFieldIds.expectedGuests} className="field-label">
              Expected guests
            </label>
            <input
              id={rescueFieldIds.expectedGuests}
              name="expectedGuests"
              type="text"
              inputMode="numeric"
              value={values.expectedGuests}
              onChange={(changeEvent) =>
                onFieldChange('expectedGuests', changeEvent.target.value)
              }
              aria-invalid={errors.expectedGuests ? true : undefined}
              aria-describedby={
                errors.expectedGuests ? 'rescue-guests-error' : undefined
              }
              autoComplete="off"
              className={`field-control mt-1.5 ${errors.expectedGuests ? 'border-rust-600' : ''}`}
            />
            {errors.expectedGuests ? (
              <FieldError id="rescue-guests-error">{errors.expectedGuests}</FieldError>
            ) : null}
          </div>

          <div>
            <label htmlFor={rescueFieldIds.totalBudget} className="field-label">
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
                id={rescueFieldIds.totalBudget}
                name="totalBudget"
                type="text"
                inputMode="decimal"
                value={values.totalBudget}
                onChange={(changeEvent) =>
                  onFieldChange('totalBudget', changeEvent.target.value)
                }
                aria-invalid={errors.totalBudget ? true : undefined}
                aria-describedby={
                  errors.totalBudget ? 'rescue-total-error' : undefined
                }
                autoComplete="off"
                className={`field-control mt-1.5 pl-8 ${errors.totalBudget ? 'border-rust-600' : ''}`}
              />
            </div>
            {errors.totalBudget ? (
              <FieldError id="rescue-total-error">{errors.totalBudget}</FieldError>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={rescueFieldIds.setting} className="field-label">
              Indoor or outdoor setting
            </label>
            <select
              id={rescueFieldIds.setting}
              name="setting"
              value={values.setting}
              onChange={(changeEvent) =>
                onFieldChange(
                  'setting',
                  changeEvent.target.value === 'indoor' ||
                    changeEvent.target.value === 'outdoor' ||
                    changeEvent.target.value === 'mixed'
                    ? changeEvent.target.value
                    : '',
                )
              }
              aria-invalid={errors.setting ? true : undefined}
              aria-describedby={
                errors.setting ? 'rescue-setting-error' : undefined
              }
              className={`field-control mt-1.5 ${errors.setting ? 'border-rust-600' : ''}`}
            >
              <option value="">Not recorded</option>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
              <option value="mixed">Indoor and outdoor</option>
            </select>
            {errors.setting ? (
              <FieldError id="rescue-setting-error">{errors.setting}</FieldError>
            ) : null}
          </div>

          <div>
            <label htmlFor={rescueFieldIds.theme} className="field-label">
              Theme <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input
              id={rescueFieldIds.theme}
              name="theme"
              type="text"
              value={values.theme}
              maxLength={80}
              onChange={(changeEvent) =>
                onFieldChange('theme', changeEvent.target.value)
              }
              aria-invalid={errors.theme ? true : undefined}
              aria-describedby={
                errors.theme ? 'rescue-theme-error' : undefined
              }
              autoComplete="off"
              placeholder="Planning context only; no arithmetic depends on it"
              className={`field-control mt-1.5 ${errors.theme ? 'border-rust-600' : ''}`}
            />
            {errors.theme ? (
              <FieldError id="rescue-theme-error">{errors.theme}</FieldError>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TriStateSelect
            id="rescue-accessibility-required"
            label="Accessibility required"
            hint="Records your answer; Event Rescue cannot verify needs."
            value={values.accessibilityRequired}
            onChange={(value) =>
              onFieldChange('accessibilityRequired', value)
            }
          />
          <TriStateSelect
            id="rescue-accessibility-addressed"
            label="Accessibility addressed"
            hint="Only mark yes after the venue confirms the arrangements."
            value={values.accessibilityAddressed}
            onChange={(value) =>
              onFieldChange('accessibilityAddressed', value)
            }
          />
          <TriStateSelect
            id="rescue-contingency-confirmed"
            label="Outdoor contingency confirmed"
            hint="Confirmation records your plan; it does not verify a venue."
            value={values.contingencyPlanConfirmed}
            onChange={(value) =>
              onFieldChange('contingencyPlanConfirmed', value)
            }
          />
        </div>

        <fieldset
          id={rescueFieldIds.protected}
          tabIndex={-1}
          aria-describedby={
            errors.protected
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
              const selected = values.protectedCategoryIds.includes(
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
                            onToggleProtected(
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

          {errors.protected ? (
            <p id="rescue-protected-error" className="field-error mt-2">
              {errors.protected}
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onReset} className="btn-secondary">
            Reset to saved values
          </button>
          <button type="submit" className="btn-primary">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Analyze rescue options
          </button>
        </div>
      </form>
    </section>
  );
}
