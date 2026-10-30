import { Plus, Save, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { FieldError } from '@/components/FieldError';
import { FormErrorSummary } from '@/components/FormErrorSummary';
import { clearFieldError, firstInvalidField } from '@/lib/formState';
import type { BudgetCategory } from '@/types/budget';
import { BUDGET_CATEGORY_TEMPLATES } from './budgetConstants';
import {
  BUDGET_CATEGORY_FIELD_ORDER,
  getInitialCategoryForm,
  validateBudgetCategoryForm,
  type BudgetCategoryFormErrors,
  type BudgetCategoryFormField,
  type BudgetCategoryFormInput,
  type BudgetCategoryFormValues,
  type BudgetProtectionChoice,
} from './budgetForm';

interface BudgetCategoryFormProps {
  readonly category?: BudgetCategory;
  readonly onSubmit: (input: BudgetCategoryFormInput) => void;
  readonly onCancel: () => void;
}

export function BudgetCategoryForm({
  category,
  onSubmit,
  onCancel,
}: BudgetCategoryFormProps) {
  const [values, setValues] = useState<BudgetCategoryFormValues>(() =>
    getInitialCategoryForm(category),
  );
  const [errors, setErrors] = useState<BudgetCategoryFormErrors>({});
  const [errorSummary, setErrorSummary] = useState('');
  const baseId = useId();
  const templateListId = `${baseId}-templates`;
  const nameInputRef = useRef<HTMLInputElement>(null);

  const fieldIds: Record<BudgetCategoryFormField, string> = {
    name: `${baseId}-name`,
    planned: `${baseId}-planned`,
    actual: `${baseId}-actual`,
    protection: `${baseId}-protection`,
    minimum: `${baseId}-minimum`,
    notes: `${baseId}-notes`,
  };
  const errorIds: Record<BudgetCategoryFormField, string> = {
    name: `${baseId}-name-error`,
    planned: `${baseId}-planned-error`,
    actual: `${baseId}-actual-error`,
    protection: `${baseId}-protection-error`,
    minimum: `${baseId}-minimum-error`,
    notes: `${baseId}-notes-error`,
  };

  const isEditing = typeof category !== 'undefined';

  function updateField<K extends BudgetCategoryFormField>(
    field: K,
    value: BudgetCategoryFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearFieldError(current, field));
    setErrorSummary('');
  }

  function handleProtectionChange(value: string) {
    const protection: BudgetProtectionChoice = value === 'protected' ? 'protected' : 'flexible';
    updateField('protection', protection);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateBudgetCategoryForm(values);

    if (!result.ok) {
      setErrors(result.errors);
      setErrorSummary('Please fix the highlighted fields before saving this category.');
      const firstInvalid = firstInvalidField(BUDGET_CATEGORY_FIELD_ORDER, result.errors);

      if (firstInvalid) {
        document.getElementById(fieldIds[firstInvalid])?.focus();
      }

      return;
    }

    setErrors({});
    setErrorSummary('');
    onSubmit(result.input);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-label={isEditing ? `Edit ${category.name}` : 'Add a budget category'}
      className="rounded-2xl border border-maroon-100 bg-maroon-50/35 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{isEditing ? 'Edit category' : 'New category'}</p>
          <h3 className="mt-0.5 text-lg font-semibold text-ink">
            {isEditing ? category.name : 'Add an expense category'}
          </h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel category editing"
          className="btn-icon"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <FormErrorSummary message={errorSummary} className="mt-4" />

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor={fieldIds.name} className="field-label">
            Category name
          </label>
          <input
            ref={nameInputRef}
            id={fieldIds.name}
            name="categoryName"
            type="text"
            value={values.name}
            onChange={(event) => updateField('name', event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? errorIds.name : undefined}
            autoComplete="off"
            autoFocus
            list={templateListId}
            placeholder="Venue, catering, décor…"
            className={`field-control mt-1.5 ${errors.name ? 'border-rust-600' : ''}`}
          />
          <datalist id={templateListId}>
            {BUDGET_CATEGORY_TEMPLATES.map((template) => (
              <option key={template.name} value={template.name} />
            ))}
          </datalist>
          {errors.name ? (
            <FieldError id={errorIds.name}>{errors.name}</FieldError>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldIds.planned} className="field-label">
              Planned amount (INR)
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
                aria-hidden="true"
              >
                ₹
              </span>
              <input
                id={fieldIds.planned}
                name="planned"
                type="text"
                inputMode="decimal"
                value={values.planned}
                onChange={(event) => updateField('planned', event.target.value)}
                aria-invalid={errors.planned ? true : undefined}
                aria-describedby={errors.planned ? errorIds.planned : undefined}
                autoComplete="off"
                placeholder="1,20,000"
                className={`field-control mt-1.5 pl-8 ${errors.planned ? 'border-rust-600' : ''}`}
              />
            </div>
            {errors.planned ? (
              <FieldError id={errorIds.planned}>{errors.planned}</FieldError>
            ) : null}
          </div>

          <div>
            <label htmlFor={fieldIds.actual} className="field-label">
              Actual spend (INR)
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
                aria-hidden="true"
              >
                ₹
              </span>
              <input
                id={fieldIds.actual}
                name="actual"
                type="text"
                inputMode="decimal"
                value={values.actual}
                onChange={(event) => updateField('actual', event.target.value)}
                aria-invalid={errors.actual ? true : undefined}
                aria-describedby={errors.actual ? errorIds.actual : undefined}
                autoComplete="off"
                placeholder="0"
                className={`field-control mt-1.5 pl-8 ${errors.actual ? 'border-rust-600' : ''}`}
              />
            </div>
            {errors.actual ? (
              <FieldError id={errorIds.actual}>{errors.actual}</FieldError>
            ) : null}
          </div>
        </div>

        <p className="field-hint">
          Actual spend above the plan is allowed, but budget validation will flag it as a
          warning.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldIds.protection} className="field-label">
              Protection
            </label>
            <select
              id={fieldIds.protection}
              name="protection"
              value={values.protection}
              onChange={(event) => handleProtectionChange(event.target.value)}
              aria-invalid={errors.protection ? true : undefined}
              aria-describedby={errors.protection ? errorIds.protection : undefined}
              className={`field-control mt-1.5 ${errors.protection ? 'border-rust-600' : ''}`}
            >
              <option value="flexible">Flexible — reducible to a minimum</option>
              <option value="protected">Protected — never reduced by repair</option>
            </select>
            {errors.protection ? (
              <FieldError id={errorIds.protection}>{errors.protection}</FieldError>
            ) : null}
          </div>

          {values.protection === 'flexible' ? (
            <div>
              <label htmlFor={fieldIds.minimum} className="field-label">
                Minimum allocation (INR)
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted"
                  aria-hidden="true"
                >
                  ₹
                </span>
                <input
                  id={fieldIds.minimum}
                  name="minimum"
                  type="text"
                  inputMode="decimal"
                  value={values.minimum}
                  onChange={(event) => updateField('minimum', event.target.value)}
                  aria-invalid={errors.minimum ? true : undefined}
                  aria-describedby={errors.minimum ? errorIds.minimum : undefined}
                  autoComplete="off"
                  placeholder="0"
                  className={`field-control mt-1.5 pl-8 ${errors.minimum ? 'border-rust-600' : ''}`}
                />
              </div>
              {errors.minimum ? (
                <FieldError id={errorIds.minimum}>{errors.minimum}</FieldError>
              ) : null}
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-maroon-100 bg-surface px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-maroon-700"
                aria-hidden="true"
              />
              Repair proposals never reduce protected categories, whatever the overrun.
            </div>
          )}
        </div>

        {values.protection === 'flexible' ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
            <SlidersHorizontal
              className="mt-0.5 size-3.5 shrink-0 text-ink-soft"
              aria-hidden="true"
            />
            Repair can reduce this category only down to its minimum.
          </p>
        ) : null}

        <div>
          <label htmlFor={fieldIds.notes} className="field-label">
            Notes <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <textarea
            id={fieldIds.notes}
            name="notes"
            rows={3}
            value={values.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={errors.notes ? errorIds.notes : undefined}
            placeholder="What this category covers, or the vendor quote it is based on."
            className={`field-control mt-1.5 resize-y ${errors.notes ? 'border-rust-600' : ''}`}
          />
          {errors.notes ? (
            <FieldError id={errorIds.notes}>{errors.notes}</FieldError>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2.5 border-t border-maroon-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {isEditing ? (
            <>
              <Save className="size-4" aria-hidden="true" />
              Save changes
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden="true" />
              Add category
            </>
          )}
        </button>
      </div>
    </form>
  );
}
