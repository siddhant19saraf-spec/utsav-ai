/**
 * Shared helpers for controlled form error state. They are deliberately
 * dependency-free so every form dialog applies the same clearing and
 * focus-order rules instead of re-implementing them.
 */

/**
 * Returns the same object when the field has no error so React can skip the
 * re-render; otherwise returns a shallow copy with only that error removed.
 */
export function clearFieldError<Errors extends Record<string, string | undefined>>(
  errors: Errors,
  field: string,
): Errors {
  if (!(field in errors)) {
    return errors;
  }

  const next: Errors = { ...errors };
  delete next[field];
  return next;
}

/** Returns the first field in `order` with a non-empty error message. */
export function firstInvalidField<Field extends string>(
  order: readonly Field[],
  errors: Partial<Record<Field, string>>,
): Field | undefined {
  return order.find((field) => Boolean(errors[field]));
}
