import type { Guest, RsvpStatus } from '@/types/domain';

export type RsvpFilter = 'all' | RsvpStatus;

export interface GuestDraft {
  readonly name: string;
  readonly rsvp: RsvpStatus;
  readonly dietaryPreference: string;
  readonly accessibilityRequest: string;
  readonly notes: string;
}

export type GuestFormField =
  | 'name'
  | 'dietaryPreference'
  | 'accessibilityRequest'
  | 'notes';

export type GuestFormErrors = Partial<Record<GuestFormField, string>>;

export interface GuestCounts {
  readonly invited: number;
  readonly confirmed: number;
  readonly pending: number;
  readonly declined: number;
}

const MAX_NAME = 120;
const MAX_DIETARY = 200;
const MAX_ACCESSIBILITY = 300;
const MAX_NOTES = 500;

export const rsvpStatusLabels: Record<RsvpStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

export function normalizeGuestDraft(draft: GuestDraft): GuestDraft {
  return {
    name: draft.name.trim(),
    rsvp: draft.rsvp,
    dietaryPreference: draft.dietaryPreference.trim(),
    accessibilityRequest: draft.accessibilityRequest.trim(),
    notes: draft.notes.trim(),
  };
}

export function validateGuestDraft(draft: GuestDraft): GuestFormErrors {
  const errors: GuestFormErrors = {};
  const normalized = normalizeGuestDraft(draft);

  if (!normalized.name) {
    errors.name = 'Enter the guest’s name.';
  } else if (normalized.name.length > MAX_NAME) {
    errors.name = `Keep the name to ${MAX_NAME} characters or fewer.`;
  }

  if (normalized.dietaryPreference.length > MAX_DIETARY) {
    errors.dietaryPreference = `Keep dietary information to ${MAX_DIETARY} characters or fewer.`;
  }

  if (normalized.accessibilityRequest.length > MAX_ACCESSIBILITY) {
    errors.accessibilityRequest = `Keep accessibility information to ${MAX_ACCESSIBILITY} characters or fewer.`;
  }

  if (normalized.notes.length > MAX_NOTES) {
    errors.notes = `Keep notes to ${MAX_NOTES} characters or fewer.`;
  }

  return errors;
}

export function selectEventGuests(
  guests: readonly Guest[],
  eventId: string,
): Guest[] {
  return guests.filter((guest) => guest.eventId === eventId);
}

export function getGuestCounts(guests: readonly Guest[]): GuestCounts {
  let confirmed = 0;
  let pending = 0;
  let declined = 0;

  for (const guest of guests) {
    if (guest.rsvp === 'confirmed') {
      confirmed += 1;
    } else if (guest.rsvp === 'declined') {
      declined += 1;
    } else {
      pending += 1;
    }
  }

  return {
    invited: guests.length,
    confirmed,
    pending,
    declined,
  };
}

export function searchGuests(guests: readonly Guest[], query: string): Guest[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return [...guests];
  }

  return guests.filter((guest) => guest.name.toLowerCase().includes(needle));
}

export function filterGuestsByRsvp(
  guests: readonly Guest[],
  filter: RsvpFilter,
): Guest[] {
  if (filter === 'all') {
    return [...guests];
  }

  return guests.filter((guest) => guest.rsvp === filter);
}

export function sortGuestsByName(guests: readonly Guest[]): Guest[] {
  return [...guests].sort(
    (first, second) =>
      first.name.localeCompare(second.name) || first.id.localeCompare(second.id),
  );
}

export function selectVisibleGuests(
  guests: readonly Guest[],
  filter: RsvpFilter,
  query: string,
): Guest[] {
  return sortGuestsByName(searchGuests(filterGuestsByRsvp(guests, filter), query));
}
