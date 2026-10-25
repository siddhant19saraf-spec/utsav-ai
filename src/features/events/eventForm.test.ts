import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/date';
import { rupees } from '@/lib/money';
import { makeBudget, makeEvent } from '@/test/fixtures';
import {
  getEventFormValues,
  getInitialEventForm,
  MAX_EVENT_BUDGET_MINOR,
  validateEventForm,
  type EventFormValidationOptions,
  type EventFormValues,
} from './eventForm';
import { createUserEvent } from './eventMutations';

const TODAY = '2026-10-24';

function validValues(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    name: 'Diwali Housewarming',
    category: 'festival',
    startsAt: '2026-11-20',
    venue: 'Taj Coromandel, Chennai',
    expectedGuests: '120',
    budget: '12,50,000',
    ...overrides,
  };
}

function errorsFor(
  values: EventFormValues,
  options: EventFormValidationOptions = {},
) {
  const result = validateEventForm(values, TODAY, options);

  if (result.ok) {
    throw new Error('Expected the form to fail validation.');
  }

  return result.errors;
}

describe('getInitialEventForm', () => {
  it('starts with a valid future date and empty required fields', () => {
    expect(getInitialEventForm(TODAY)).toEqual({
      name: '',
      category: 'wedding',
      startsAt: addDays(TODAY, 60),
      venue: '',
      expectedGuests: '',
      budget: '',
    });
  });
});

describe('getEventFormValues', () => {
  it('maps saved event details into editable form values', () => {
    const event = makeEvent({
      name: 'Meera’s Birthday',
      category: 'birthday',
      startsAt: '2026-12-10',
      venue: 'Garden terrace',
      expectedGuests: 80,
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: { amountMinor: 65_050, currency: 'INR' },
      }),
    });

    expect(getEventFormValues(event)).toEqual({
      name: 'Meera’s Birthday',
      category: 'birthday',
      startsAt: '2026-12-10',
      venue: 'Garden terrace',
      expectedGuests: '80',
      budget: '650.5',
    });
  });

  it('uses an empty venue when none is saved', () => {
    const event = createUserEvent(
      {
        name: 'No Venue Yet',
        category: 'other',
        startsAt: '2026-12-10',
        expectedGuests: 20,
        budget: rupees(500),
      },
      'event-1',
    );

    expect(getEventFormValues(event).venue).toBe('');
  });
});

describe('validateEventForm', () => {
  it('returns a typed draft with trimmed text and integer minor units', () => {
    const result = validateEventForm(
      validValues({ name: '  Diwali Housewarming  ', venue: '  Family courtyard  ' }),
      TODAY,
    );

    expect(result).toEqual({
      ok: true,
      draft: {
        name: 'Diwali Housewarming',
        category: 'festival',
        startsAt: '2026-11-20',
        venue: 'Family courtyard',
        expectedGuests: 120,
        budget: rupees(1_250_000),
      },
    });
  });

  it('omits an empty optional venue', () => {
    const result = validateEventForm(validValues({ venue: '   ' }), TODAY);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected a valid draft.');
    }

    expect(result.draft).not.toHaveProperty('venue');
  });

  it('accepts today as the event date', () => {
    expect(validateEventForm(validValues({ startsAt: TODAY }), TODAY).ok).toBe(true);
  });

  it('allows an unchanged saved past date but rejects choosing a different past date', () => {
    const savedPastDate = '2026-09-01';

    expect(
      validateEventForm(validValues({ startsAt: savedPastDate }), TODAY, {
        originalStartsAt: savedPastDate,
      }).ok,
    ).toBe(true);
    expect(
      errorsFor(validValues({ startsAt: '2026-09-02' }), {
        originalStartsAt: savedPastDate,
      }),
    ).toEqual({ startsAt: 'Choose today or a future date.' });
    expect(errorsFor(validValues({ startsAt: savedPastDate }))).toEqual({
      startsAt: 'Choose today or a future date.',
    });
  });

  it('reports every missing or invalid required field at once', () => {
    const result = validateEventForm(
      validValues({ name: 'A', startsAt: '2026-01-01', expectedGuests: '0', budget: 'abc' }),
      TODAY,
    );

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected validation errors.');
    }

    expect(result.errors).toEqual({
      name: 'Use at least two characters for the event name.',
      startsAt: 'Choose today or a future date.',
      expectedGuests: 'Enter a whole number between 1 and 1,00,000.',
      budget: 'Enter a positive amount in rupees, with up to two decimal places.',
    });
  });

  it('rejects an empty name, an impossible date, and an invalid category', () => {
    const errors = errorsFor(
      validValues({
        name: '   ',
        startsAt: '2026-02-30',
        category: 'conference' as unknown as EventFormValues['category'],
      }),
    );

    expect(errors).toMatchObject({
      name: 'Enter an event name.',
      startsAt: 'Choose a valid event date.',
      category: 'Choose an event category.',
    });
  });

  it('enforces name and venue length limits', () => {
    const errors = errorsFor(validValues({ name: 'x'.repeat(81), venue: 'v'.repeat(121) }));

    expect(errors).toEqual({
      name: 'Keep the event name to 80 characters or fewer.',
      venue: 'Keep the venue to 120 characters or fewer.',
    });
  });

  it('enforces the guest count boundaries', () => {
    expect(validateEventForm(validValues({ expectedGuests: '1' }), TODAY).ok).toBe(true);
    expect(validateEventForm(validValues({ expectedGuests: '100000' }), TODAY).ok).toBe(true);
    expect(errorsFor(validValues({ expectedGuests: '100001' }))).toHaveProperty('expectedGuests');
    expect(errorsFor(validValues({ expectedGuests: '12.5' }))).toHaveProperty('expectedGuests');
    expect(errorsFor(validValues({ expectedGuests: '' }))).toHaveProperty('expectedGuests');
  });

  it('accepts up to two decimal places and rejects over-precision', () => {
    const twoDecimals = validateEventForm(validValues({ budget: '1250.05' }), TODAY);

    expect(twoDecimals).toEqual({
      ok: true,
      draft: expect.objectContaining({ budget: { amountMinor: 125_005, currency: 'INR' } }),
    });
    expect(errorsFor(validValues({ budget: '1250.005' }))).toHaveProperty('budget');
  });

  it('rejects zero or negative budgets', () => {
    expect(errorsFor(validValues({ budget: '0' }))).toHaveProperty('budget');
    expect(errorsFor(validValues({ budget: '-500' }))).toHaveProperty('budget');
    expect(errorsFor(validValues({ budget: '' }))).toHaveProperty('budget');
  });

  it('accepts the maximum budget and rejects anything above it', () => {
    expect(validateEventForm(validValues({ budget: '1000000000' }), TODAY).ok).toBe(true);
    expect(errorsFor(validValues({ budget: '1000000000.01' }))).toEqual({
      budget: 'Keep the budget at ₹100 crore or below.',
    });
    expect(MAX_EVENT_BUDGET_MINOR).toBe(100_000_000_000);
  });
});
