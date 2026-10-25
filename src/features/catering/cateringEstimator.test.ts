import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import {
  makeBudget,
  makeCategory,
  makeEvent,
  makeGuest,
} from '@/test/fixtures';
import { calculateCateringEstimate, MAX_BUFFER_PERCENT } from './cateringEstimator';

function cateringEvent(
  overrides: Parameters<typeof makeEvent>[0] = {},
) {
  return makeEvent({
    id: 'event-1',
    expectedGuests: 100,
    budget: makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(20_000),
      categories: [
        makeCategory({
          id: 'catering',
          name: 'Catering',
          planned: rupees(1_000),
        }),
      ],
    }),
    ...overrides,
  });
}

describe('calculateCateringEstimate', () => {
  it('uses the expected guest count and labels it when no guest records exist', () => {
    const estimate = calculateCateringEstimate(
      cateringEvent(),
      [],
      rupees(100),
      10,
    );

    expect(estimate).toMatchObject({
      attendeeSource: 'expected',
      guestRecords: 0,
      baseAttendees: 100,
      bufferPercent: 10,
      bufferAttendees: 10,
      estimatedAttendees: 110,
      perPersonCost: rupees(100),
      baseCost: rupees(10_000),
      bufferCost: rupees(1_000),
      estimatedCost: rupees(11_000),
      differenceFromPlanMinor: 1_000_000,
      percentOfTotalBudget: 55,
    });
    expect(estimate.cateringCategory).toEqual({
      id: 'catering',
      name: 'Catering',
      planned: rupees(1_000),
    });
    expect(estimate.dietaryPreferences).toEqual([]);
  });

  it('rounds the buffer headcount up instead of down', () => {
    const estimate = calculateCateringEstimate(
      cateringEvent({ expectedGuests: 3 }),
      [],
      rupees(100),
      50,
    );

    expect(estimate.baseAttendees).toBe(3);
    expect(estimate.bufferAttendees).toBe(2);
    expect(estimate.estimatedAttendees).toBe(5);
    expect(estimate.estimatedCost).toEqual(rupees(500));
  });

  it('uses only confirmed RSVPs once guest records exist', () => {
    const guests = [
      makeGuest({ id: 'confirmed-a', eventId: 'event-1', rsvp: 'confirmed', dietaryPreference: 'Vegetarian' }),
      makeGuest({ id: 'confirmed-b', eventId: 'event-1', rsvp: 'confirmed', dietaryPreference: ' vegetarian ' }),
      makeGuest({ id: 'pending', eventId: 'event-1', rsvp: 'pending', dietaryPreference: 'Jain' }),
      makeGuest({ id: 'declined', eventId: 'event-1', rsvp: 'declined', dietaryPreference: 'Vegan' }),
      makeGuest({ id: 'other-event', eventId: 'event-2', rsvp: 'confirmed', dietaryPreference: 'Vegetarian' }),
    ];

    const estimate = calculateCateringEstimate(
      cateringEvent(),
      guests,
      rupees(100),
      25,
    );

    expect(estimate.attendeeSource).toBe('confirmed');
    expect(estimate.guestRecords).toBe(4);
    expect(estimate.counts).toEqual({
      invited: 4,
      confirmed: 2,
      pending: 1,
      declined: 1,
    });
    expect(estimate.baseAttendees).toBe(2);
    expect(estimate.bufferAttendees).toBe(1);
    expect(estimate.estimatedAttendees).toBe(3);
    expect(estimate.baseCost).toEqual(rupees(200));
    expect(estimate.bufferCost).toEqual(rupees(100));
    expect(estimate.estimatedCost).toEqual(rupees(300));
    expect(estimate.dietaryPreferences).toEqual([
      { label: 'Vegetarian', count: 2 },
    ]);
  });

  it('does not treat invited or pending guests as confirmed attendance', () => {
    const estimate = calculateCateringEstimate(
      cateringEvent(),
      [
        makeGuest({ id: 'pending', eventId: 'event-1', rsvp: 'pending' }),
        makeGuest({ id: 'declined', eventId: 'event-1', rsvp: 'declined' }),
      ],
      rupees(100),
      0,
    );

    expect(estimate.attendeeSource).toBe('confirmed');
    expect(estimate.counts.invited).toBe(2);
    expect(estimate.baseAttendees).toBe(0);
    expect(estimate.estimatedAttendees).toBe(0);
    expect(estimate.estimatedCost).toEqual({ amountMinor: 0, currency: 'INR' });
  });

  it('reports budget impact without changing the budget', () => {
    const event = cateringEvent();
    const before = JSON.parse(JSON.stringify(event));
    const estimate = calculateCateringEstimate(event, [], rupees(100), 10);

    expect(estimate.differenceFromPlanMinor).toBe(1_000_000);
    expect(estimate.percentOfTotalBudget).toBe(55);
    expect(event).toEqual(before);
  });

  it('returns no plan comparison when the event has no catering category', () => {
    const event = cateringEvent({
      budget: makeBudget({
        eventId: 'event-1',
        totalAvailable: rupees(20_000),
        categories: [
          makeCategory({ id: 'venue', name: 'Venue', planned: rupees(5_000) }),
        ],
      }),
    });

    const estimate = calculateCateringEstimate(event, [], rupees(100), 0);

    expect(estimate.cateringCategory).toBeNull();
    expect(estimate.differenceFromPlanMinor).toBeNull();
  });

  it('rejects invalid buffers and per-person amounts', () => {
    const event = cateringEvent();

    expect(() => calculateCateringEstimate(event, [], rupees(100), -1)).toThrow(
      RangeError,
    );
    expect(() =>
      calculateCateringEstimate(event, [], rupees(100), MAX_BUFFER_PERCENT + 1),
    ).toThrow(RangeError);
    expect(() => calculateCateringEstimate(event, [], rupees(100), 1.5)).toThrow(
      RangeError,
    );
    expect(() =>
      calculateCateringEstimate(
        event,
        [],
        { amountMinor: -1, currency: 'INR' },
        0,
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateCateringEstimate(
        event,
        [],
        { amountMinor: 1.5, currency: 'INR' },
        0,
      ),
    ).toThrow(RangeError);
    expect(() =>
      calculateCateringEstimate(
        event,
        [],
        { amountMinor: 100, currency: 'USD' },
        0,
      ),
    ).toThrow(RangeError);
  });

  it('rejects estimates that exceed the safe integer range', () => {
    expect(() =>
      calculateCateringEstimate(
        cateringEvent({ expectedGuests: 2 }),
        [],
        { amountMinor: Number.MAX_SAFE_INTEGER, currency: 'INR' },
        0,
      ),
    ).toThrow(/supported amount range/i);
  });

  it('requires a usable expected guest count when no guest records exist', () => {
    expect(() =>
      calculateCateringEstimate(
        cateringEvent({ expectedGuests: 0 }),
        [],
        rupees(100),
        0,
      ),
    ).toThrow(/usable expected guest count/i);
  });
});
