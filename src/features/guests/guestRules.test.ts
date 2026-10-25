import { describe, expect, it } from 'vitest';
import { makeGuest } from '@/test/fixtures';
import {
  filterGuestsByRsvp,
  getGuestCounts,
  normalizeGuestDraft,
  searchGuests,
  selectEventGuests,
  selectVisibleGuests,
  sortGuestsByName,
  validateGuestDraft,
  type GuestDraft,
} from './guestRules';

function makeDraft(overrides: Partial<GuestDraft> = {}): GuestDraft {
  return {
    name: 'Ananya Rao',
    rsvp: 'pending',
    dietaryPreference: '',
    accessibilityRequest: '',
    notes: '',
    ...overrides,
  };
}

describe('validateGuestDraft', () => {
  it('accepts a draft with only a name', () => {
    expect(validateGuestDraft(makeDraft())).toEqual({});
  });

  it('requires a name and trims it', () => {
    expect(validateGuestDraft(makeDraft({ name: '   ' }))).toMatchObject({
      name: 'Enter the guest’s name.',
    });
    expect(normalizeGuestDraft(makeDraft({ name: '  Rohan  ' })).name).toBe('Rohan');
  });

  it('enforces length limits without requiring personal details', () => {
    const errors = validateGuestDraft(
      makeDraft({
        name: 'a'.repeat(121),
        dietaryPreference: 'a'.repeat(201),
        accessibilityRequest: 'a'.repeat(301),
        notes: 'a'.repeat(501),
      }),
    );

    expect(Object.keys(errors).sort()).toEqual([
      'accessibilityRequest',
      'dietaryPreference',
      'name',
      'notes',
    ]);
  });
});

describe('getGuestCounts', () => {
  it('keeps invited, confirmed, pending, and declined as separate counts', () => {
    const guests = [
      makeGuest({ id: 'one', rsvp: 'confirmed' }),
      makeGuest({ id: 'two', rsvp: 'confirmed' }),
      makeGuest({ id: 'three', rsvp: 'pending' }),
      makeGuest({ id: 'four', rsvp: 'declined' }),
    ];

    const counts = getGuestCounts(guests);

    expect(counts).toEqual({
      invited: 4,
      confirmed: 2,
      pending: 1,
      declined: 1,
    });
    expect(counts.invited).not.toBe(counts.confirmed);
  });

  it('reports zeros for an empty guest list', () => {
    expect(getGuestCounts([])).toEqual({
      invited: 0,
      confirmed: 0,
      pending: 0,
      declined: 0,
    });
  });
});

describe('guest selection helpers', () => {
  const ananya = makeGuest({
    id: 'guest-a',
    eventId: 'wedding',
    name: 'Ananya',
    rsvp: 'confirmed',
  });
  const bob = makeGuest({
    id: 'guest-b',
    eventId: 'wedding',
    name: 'Bob',
    rsvp: 'pending',
  });
  const cara = makeGuest({
    id: 'guest-c',
    eventId: 'wedding',
    name: 'Cara',
    rsvp: 'declined',
  });
  const otherEvent = makeGuest({
    id: 'guest-d',
    eventId: 'birthday',
    name: 'Ananya',
    rsvp: 'confirmed',
  });

  it('scopes records to one event', () => {
    expect(selectEventGuests([ananya, bob, cara, otherEvent], 'wedding')).toEqual([
      ananya,
      bob,
      cara,
    ]);
  });

  it('searches names case-insensitively and ignores surrounding spaces', () => {
    expect(searchGuests([ananya, bob, cara], '  aNAN  ')).toEqual([ananya]);
    expect(searchGuests([ananya, bob, cara], '')).toHaveLength(3);
  });

  it('filters by RSVP status', () => {
    expect(filterGuestsByRsvp([ananya, bob, cara], 'pending')).toEqual([bob]);
    expect(filterGuestsByRsvp([ananya, bob, cara], 'all')).toHaveLength(3);
  });

  it('sorts by name and applies filter and search together', () => {
    expect(sortGuestsByName([cara, ananya, bob]).map((guest) => guest.name)).toEqual([
      'Ananya',
      'Bob',
      'Cara',
    ]);
    expect(
      selectVisibleGuests([cara, ananya, bob], 'confirmed', 'anan'),
    ).toEqual([ananya]);
  });
});
