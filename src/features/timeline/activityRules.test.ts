import { describe, expect, it } from 'vitest';
import { makeActivity } from '@/test/fixtures';
import {
  activityIdsInOverlaps,
  filterActivities,
  findActivityOverlaps,
  selectUpcomingActivities,
  sortActivitiesChronologically,
  validateActivityDraft,
  type ActivityDraft,
} from './activityRules';

function makeDraft(overrides: Partial<ActivityDraft> = {}): ActivityDraft {
  return {
    title: 'Sangeet',
    description: '',
    startsAt: '2026-11-30T18:00',
    endsAt: '2026-11-30T21:00',
    priority: 'high',
    status: 'scheduled',
    location: '',
    ...overrides,
  };
}

describe('validateActivityDraft', () => {
  it('accepts a complete draft and normalizes surrounding whitespace', () => {
    expect(
      validateActivityDraft(
        makeDraft({ title: '  Sangeet  ', location: '  Courtyard  ' }),
      ),
    ).toEqual({});
  });

  it('requires a title and valid start and end times', () => {
    expect(validateActivityDraft(makeDraft({ title: '   ' }))).toMatchObject({
      title: 'Enter an activity title.',
    });

    expect(
      validateActivityDraft(makeDraft({ startsAt: '2026-11-30 18:00' })),
    ).toMatchObject({
      startsAt: 'Enter a valid start date and time.',
    });

    expect(
      validateActivityDraft(makeDraft({ endsAt: '2026-02-30T21:00' })),
    ).toMatchObject({
      endsAt: 'Enter a valid end date and time.',
    });
  });

  it('requires the end time to be strictly after the start time', () => {
    expect(
      validateActivityDraft(
        makeDraft({ startsAt: '2026-11-30T18:00', endsAt: '2026-11-30T18:00' }),
      ),
    ).toMatchObject({
      endsAt: 'The end time must be after the start time.',
    });

    expect(
      validateActivityDraft(
        makeDraft({ startsAt: '2026-11-30T18:00', endsAt: '2026-11-30T17:00' }),
      ),
    ).toMatchObject({
      endsAt: 'The end time must be after the start time.',
    });
  });

  it('rejects overlong free-text fields', () => {
    const errors = validateActivityDraft(
      makeDraft({
        title: 'a'.repeat(161),
        description: 'a'.repeat(1_001),
        location: 'a'.repeat(161),
      }),
    );

    expect(Object.keys(errors).sort()).toEqual([
      'description',
      'location',
      'title',
    ]);
  });
});

describe('sortActivitiesChronologically', () => {
  it('sorts by start time, then end time, then identifier without mutating input', () => {
    const late = makeActivity({
      id: 'late',
      title: 'Late',
      startsAt: '2026-11-30T20:00',
      endsAt: '2026-11-30T21:00',
    });
    const early = makeActivity({
      id: 'early',
      title: 'Early',
      startsAt: '2026-11-30T09:00',
      endsAt: '2026-11-30T10:00',
    });
    const second = makeActivity({
      id: 'second',
      title: 'Second',
      startsAt: '2026-11-30T09:00',
      endsAt: '2026-11-30T11:00',
    });
    const input = [late, early, second];

    expect(sortActivitiesChronologically(input).map((activity) => activity.id)).toEqual([
      'early',
      'second',
      'late',
    ]);
    expect(input.map((activity) => activity.id)).toEqual(['late', 'early', 'second']);
  });
});

describe('filterActivities', () => {
  const scheduled = makeActivity({ id: 'scheduled', status: 'scheduled' });
  const completed = makeActivity({ id: 'completed', status: 'completed' });

  it('returns every activity for the all filter', () => {
    expect(filterActivities([scheduled, completed], 'all')).toHaveLength(2);
  });

  it('returns only the requested status', () => {
    expect(filterActivities([scheduled, completed], 'completed')).toEqual([
      completed,
    ]);
  });
});

describe('selectUpcomingActivities', () => {
  it('keeps scheduled future activities, excludes completed and past ones, and respects the limit', () => {
    const past = makeActivity({
      id: 'past',
      startsAt: '2026-10-23T10:00',
      endsAt: '2026-10-23T11:00',
    });
    const completed = makeActivity({
      id: 'completed',
      status: 'completed',
      startsAt: '2026-10-25T10:00',
      endsAt: '2026-10-25T11:00',
    });
    const later = makeActivity({
      id: 'later',
      startsAt: '2026-10-26T10:00',
      endsAt: '2026-10-26T11:00',
    });
    const next = makeActivity({
      id: 'next',
      startsAt: '2026-10-25T09:00',
      endsAt: '2026-10-25T10:00',
    });

    expect(
      selectUpcomingActivities(
        [later, completed, past, next],
        '2026-10-24T12:00',
      ).map((activity) => activity.id),
    ).toEqual(['next', 'later']);

    expect(
      selectUpcomingActivities([later, next], '2026-10-24T12:00', 1).map(
        (activity) => activity.id,
      ),
    ).toEqual(['next']);
  });
});

describe('findActivityOverlaps', () => {
  it('reports overlapping pairs for the same event without changing them', () => {
    const ceremony = makeActivity({
      id: 'ceremony',
      title: 'Ceremony',
      startsAt: '2026-11-30T10:00',
      endsAt: '2026-11-30T12:00',
    });
    const photos = makeActivity({
      id: 'photos',
      title: 'Photos',
      startsAt: '2026-11-30T11:30',
      endsAt: '2026-11-30T13:00',
    });
    const dinner = makeActivity({
      id: 'dinner',
      title: 'Dinner',
      startsAt: '2026-11-30T12:30',
      endsAt: '2026-11-30T14:00',
    });
    const snapshot = JSON.parse(JSON.stringify([ceremony, photos, dinner]));

    const overlaps = findActivityOverlaps([ceremony, photos, dinner]);

    expect(overlaps).toHaveLength(2);
    expect(
      overlaps.map((overlap) => `${overlap.firstId}:${overlap.secondId}`),
    ).toEqual(['ceremony:photos', 'photos:dinner']);
    expect([ceremony, photos, dinner]).toEqual(snapshot);
    expect(activityIdsInOverlaps(overlaps)).toEqual(
      new Set(['ceremony', 'photos', 'dinner']),
    );
  });

  it('does not treat touching ranges or different events as overlaps', () => {
    const first = makeActivity({
      id: 'first',
      eventId: 'event-1',
      startsAt: '2026-11-30T10:00',
      endsAt: '2026-11-30T11:00',
    });
    const touching = makeActivity({
      id: 'touching',
      eventId: 'event-1',
      startsAt: '2026-11-30T11:00',
      endsAt: '2026-11-30T12:00',
    });
    const otherEvent = makeActivity({
      id: 'other-event',
      eventId: 'event-2',
      startsAt: '2026-11-30T10:30',
      endsAt: '2026-11-30T11:30',
    });

    expect(findActivityOverlaps([first, touching])).toEqual([]);
    expect(findActivityOverlaps([first, otherEvent])).toEqual([]);
  });

  it('treats a contained activity as an overlap rather than an automatic error', () => {
    const long = makeActivity({
      id: 'long',
      title: 'Reception',
      startsAt: '2026-11-30T18:00',
      endsAt: '2026-11-30T23:00',
    });
    const short = makeActivity({
      id: 'short',
      title: 'Toast',
      startsAt: '2026-11-30T20:00',
      endsAt: '2026-11-30T20:15',
    });

    const overlaps = findActivityOverlaps([long, short]);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({
      firstId: 'long',
      secondId: 'short',
      firstTitle: 'Reception',
      secondTitle: 'Toast',
    });
  });
});
