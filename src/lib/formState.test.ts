import { describe, expect, it } from 'vitest';
import { clearFieldError, firstInvalidField } from './formState';

type Field = 'name' | 'date' | 'notes';

describe('clearFieldError', () => {
  it('removes only the requested field and preserves the rest', () => {
    const errors: Partial<Record<Field, string>> = {
      name: 'Enter a name.',
      date: 'Choose a valid date.',
    };

    expect(clearFieldError(errors, 'name')).toEqual({
      date: 'Choose a valid date.',
    });
  });

  it('returns the original object when the field has no error', () => {
    const errors: Partial<Record<Field, string>> = { name: 'Enter a name.' };

    expect(clearFieldError(errors, 'notes')).toBe(errors);
  });

  it('ignores fields that are not part of the error shape', () => {
    const errors: Partial<Record<Field, string>> = { name: 'Enter a name.' };

    expect(clearFieldError(errors, 'unrelated')).toBe(errors);
  });
});

describe('firstInvalidField', () => {
  const order: readonly Field[] = ['name', 'date', 'notes'];

  it('returns the first error in field order, not object order', () => {
    expect(
      firstInvalidField(order, { notes: 'Too long.', date: 'Invalid.' }),
    ).toBe('date');
  });

  it('returns undefined when every field is valid', () => {
    expect(firstInvalidField(order, {})).toBeUndefined();
  });

  it('skips empty messages', () => {
    expect(firstInvalidField(order, { name: '', notes: 'Too long.' })).toBe('notes');
  });
});
