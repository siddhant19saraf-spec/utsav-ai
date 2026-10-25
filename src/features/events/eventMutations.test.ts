import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import { makeBudget, makeCategory, makeEvent } from '@/test/fixtures';
import { createUserEvent, updateUserEvent, type EventDraft } from './eventMutations';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const UPDATED_AT = NOW.toISOString();

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    name: 'Diwali Housewarming',
    category: 'festival',
    startsAt: '2026-11-20',
    expectedGuests: 120,
    budget: rupees(1_250_000),
    ...overrides,
  };
}

describe('createUserEvent', () => {
  it('creates an isolated planning event with its own budget', () => {
    const event = createUserEvent(draft({ venue: 'Family courtyard' }), 'event-new', NOW);

    expect(event).toMatchObject({
      id: 'event-new',
      name: 'Diwali Housewarming',
      category: 'festival',
      startsAt: '2026-11-20',
      venue: 'Family courtyard',
      expectedGuests: 120,
      status: 'planning',
      origin: 'user',
    });
    expect(event.budget).toMatchObject({
      eventId: 'event-new',
      totalAvailable: rupees(1_250_000),
      categories: [],
      emergencyReserve: { enabled: false, target: rupees(0) },
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
    });
    expect(event.budget.id).not.toBe('event-new');
  });

  it('omits an absent optional venue', () => {
    expect(createUserEvent(draft(), 'event-new', NOW)).not.toHaveProperty('venue');
  });
});

describe('updateUserEvent', () => {
  function existingEvent() {
    return makeEvent({
      id: 'event-1',
      name: 'Old Celebration',
      category: 'wedding',
      startsAt: '2026-12-01',
      venue: 'Old Venue',
      expectedGuests: 100,
      status: 'on-track',
      origin: 'sample',
      setting: 'outdoor',
      theme: 'Garden romance',
      accessibilityRequired: true,
      accessibilityAddressed: false,
      contingencyPlanConfirmed: true,
      budget: makeBudget({
        id: 'budget-1',
        eventId: 'event-1',
        totalAvailable: rupees(1_000),
        categories: [makeCategory({ id: 'venue', planned: rupees(600) })],
        emergencyReserve: { enabled: true, target: rupees(100) },
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      }),
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
  }

  it('updates editable details while preserving planning fields and budget structure', () => {
    const existing = existingEvent();
    const next = updateUserEvent(
      existing,
      draft({
        name: 'New Celebration',
        category: 'birthday',
        startsAt: '2026-12-15',
        expectedGuests: 150,
        budget: rupees(2_000),
      }),
      NOW,
    );

    expect(next).toMatchObject({
      id: 'event-1',
      name: 'New Celebration',
      category: 'birthday',
      startsAt: '2026-12-15',
      expectedGuests: 150,
      status: 'on-track',
      origin: 'sample',
      setting: 'outdoor',
      theme: 'Garden romance',
      accessibilityRequired: true,
      accessibilityAddressed: false,
      contingencyPlanConfirmed: true,
      updatedAt: UPDATED_AT,
    });
    expect(next).not.toHaveProperty('venue');
    expect(next.budget).toEqual({
      ...existing.budget,
      totalAvailable: rupees(2_000),
      updatedAt: UPDATED_AT,
    });
    expect(next.budget.categories).toBe(existing.budget.categories);
    expect(next.budget.emergencyReserve).toBe(existing.budget.emergencyReserve);
    expect(next.budget.createdAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('keeps the saved budget object when the total is unchanged', () => {
    const existing = existingEvent();
    const next = updateUserEvent(
      existing,
      draft({ budget: existing.budget.totalAvailable }),
      NOW,
    );

    expect(next.budget).toBe(existing.budget);
    expect(next.updatedAt).toBe(UPDATED_AT);
  });

  it('does not mutate the saved event', () => {
    const existing = existingEvent();
    const originalBudget = existing.budget;

    updateUserEvent(existing, draft({ name: 'Changed', budget: rupees(9_000) }), NOW);

    expect(existing.name).toBe('Old Celebration');
    expect(existing.expectedGuests).toBe(100);
    expect(existing.budget).toBe(originalBudget);
    expect(existing.budget.totalAvailable).toEqual(rupees(1_000));
    expect(existing.updatedAt).toBe('2026-10-01T00:00:00.000Z');
  });
});
