import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import { makeBudget, makeCategory, makeEvent } from '@/test/fixtures';
import {
  createRescueRequestFromForm,
  getInitialRescueForm,
} from './rescueForm';

const TODAY = '2026-10-24';

function savedEvent() {
  return makeEvent({
    id: 'event-1',
    startsAt: '2026-12-01',
    expectedGuests: 100,
    setting: 'outdoor',
    theme: 'Garden',
    accessibilityRequired: true,
    accessibilityAddressed: false,
    contingencyPlanConfirmed: false,
    budget: makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(10_000),
      categories: [
        makeCategory({
          id: 'venue',
          name: 'Venue',
          planned: rupees(6_000),
          flexibility: { mode: 'protected' },
        }),
        makeCategory({
          id: 'catering',
          name: 'Catering',
          planned: rupees(2_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(1_500) },
        }),
        makeCategory({
          id: 'decor',
          name: 'Décor',
          planned: rupees(3_000),
          flexibility: { mode: 'flexible', minimumPlanned: rupees(2_000) },
        }),
      ],
    }),
  });
}

describe('getInitialRescueForm', () => {
  it('prefills the saved requirements, protections, and flexible minimums', () => {
    const values = getInitialRescueForm(savedEvent());

    expect(values).toMatchObject({
      startsAt: '2026-12-01',
      expectedGuests: '100',
      totalBudget: '10000',
      setting: 'outdoor',
      theme: 'Garden',
      accessibilityRequired: 'yes',
      accessibilityAddressed: 'no',
      contingencyPlanConfirmed: 'no',
      protectedCategoryIds: [],
    });
    expect(values.minimums).toEqual({
      catering: '1500',
      decor: '2000',
    });
  });

  it('uses blank tri-state values when readiness data is not recorded', () => {
    const values = getInitialRescueForm(
      makeEvent({
        id: 'event-2',
        startsAt: '2026-12-01',
        budget: makeBudget({ eventId: 'event-2', categories: [] }),
      }),
    );

    expect(values.setting).toBe('');
    expect(values.theme).toBe('');
    expect(values.accessibilityRequired).toBe('');
    expect(values.accessibilityAddressed).toBe('');
    expect(values.contingencyPlanConfirmed).toBe('');
    expect(values.minimums).toEqual({});
  });
});

describe('createRescueRequestFromForm', () => {
  it('builds a typed request and removes protected categories from flexible eligibility', () => {
    const event = savedEvent();
    const values = {
      ...getInitialRescueForm(event),
      startsAt: '2026-12-05',
      expectedGuests: '150',
      totalBudget: '11,500',
      theme: '  Pastel garden  ',
      protectedCategoryIds: ['decor'],
      minimums: {
        catering: '1600',
        decor: '2000',
      },
    };
    const result = createRescueRequestFromForm(event, values, TODAY);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.request).toMatchObject({
      eventId: 'event-1',
      changes: {
        startsAt: '2026-12-05',
        expectedGuests: 150,
        totalAvailable: rupees(11_500),
        setting: 'outdoor',
        theme: 'Pastel garden',
        accessibilityRequired: true,
        accessibilityAddressed: false,
        contingencyPlanConfirmed: false,
      },
      protectedCategoryIds: ['decor'],
    });
    expect(result.request.flexibleCategories).toEqual([
      { categoryId: 'catering', minimumPlanned: rupees(1_600) },
    ]);
  });

  it('reports field-level errors for invalid boundaries', () => {
    const event = savedEvent();
    const values = {
      ...getInitialRescueForm(event),
      startsAt: '2026-10-01',
      expectedGuests: '0',
      totalBudget: 'not-money',
      theme: 'x'.repeat(81),
      protectedCategoryIds: ['missing-category'],
      minimums: {
        catering: '5000',
        decor: '2000',
      },
    };
    const result = createRescueRequestFromForm(event, values, TODAY);

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.errors.startsAt).toMatch(/today or a future/i);
    expect(result.errors.expectedGuests).toMatch(/between 1 and/i);
    expect(result.errors.totalBudget).toMatch(/up to two decimal places/i);
    expect(result.errors.theme).toMatch(/80 characters or fewer/i);
    expect(result.errors.protected).toMatch(/categories from this event/i);
    expect(result.errors['minimum:catering']).toMatch(
      /cannot exceed the current plan of ₹2,000/i,
    );
  });

  it('clears optional fields and accepts a blank theme', () => {
    const event = savedEvent();
    const result = createRescueRequestFromForm(
      event,
      {
        ...getInitialRescueForm(event),
        setting: '',
        theme: '',
        accessibilityRequired: '',
        accessibilityAddressed: '',
        contingencyPlanConfirmed: '',
      },
      TODAY,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.request.changes).toMatchObject({
      setting: null,
      theme: null,
      accessibilityRequired: null,
      accessibilityAddressed: null,
      contingencyPlanConfirmed: null,
    });
    expect(result.request.flexibleCategories).toEqual([
      { categoryId: 'catering', minimumPlanned: rupees(1_500) },
      { categoryId: 'decor', minimumPlanned: rupees(2_000) },
    ]);
  });

  it('rejects an empty minimum and a minimum above the current plan', () => {
    const event = savedEvent();
    const result = createRescueRequestFromForm(
      event,
      {
        ...getInitialRescueForm(event),
        minimums: {
          catering: '',
          decor: '3500',
        },
      },
      TODAY,
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors['minimum:catering']).toMatch(/valid minimum/i);
      expect(result.errors['minimum:decor']).toMatch(/cannot exceed/i);
    }
  });
});
