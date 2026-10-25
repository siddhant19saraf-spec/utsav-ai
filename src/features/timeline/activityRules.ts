import { isValidLocalDateTime } from '@/lib/dateTime';
import type {
  ActivityPriority,
  ActivityStatus,
  TimelineActivity,
} from '@/types/domain';

export type ActivityStatusFilter = 'all' | ActivityStatus;

export interface ActivityDraft {
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly priority: ActivityPriority;
  readonly status: ActivityStatus;
  readonly location: string;
}

export type ActivityFormField =
  | 'title'
  | 'description'
  | 'startsAt'
  | 'endsAt'
  | 'location';

export type ActivityFormErrors = Partial<Record<ActivityFormField, string>>;

export interface ActivityOverlap {
  readonly firstId: string;
  readonly secondId: string;
  readonly firstTitle: string;
  readonly secondTitle: string;
  readonly firstStartsAt: string;
  readonly firstEndsAt: string;
  readonly secondStartsAt: string;
  readonly secondEndsAt: string;
}

const MAX_TITLE = 160;
const MAX_DESCRIPTION = 1_000;
const MAX_LOCATION = 160;

export function normalizeActivityDraft(draft: ActivityDraft): ActivityDraft {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    priority: draft.priority,
    status: draft.status,
    location: draft.location.trim(),
  };
}

export function validateActivityDraft(draft: ActivityDraft): ActivityFormErrors {
  const errors: ActivityFormErrors = {};
  const normalized = normalizeActivityDraft(draft);

  if (!normalized.title) {
    errors.title = 'Enter an activity title.';
  } else if (normalized.title.length > MAX_TITLE) {
    errors.title = `Keep the title to ${MAX_TITLE} characters or fewer.`;
  }

  if (normalized.description.length > MAX_DESCRIPTION) {
    errors.description = `Keep the description to ${MAX_DESCRIPTION} characters or fewer.`;
  }

  if (!normalized.startsAt) {
    errors.startsAt = 'Choose a start date and time.';
  } else if (!isValidLocalDateTime(normalized.startsAt)) {
    errors.startsAt = 'Enter a valid start date and time.';
  }

  if (!normalized.endsAt) {
    errors.endsAt = 'Choose an end date and time.';
  } else if (!isValidLocalDateTime(normalized.endsAt)) {
    errors.endsAt = 'Enter a valid end date and time.';
  }

  if (
    !errors.startsAt &&
    !errors.endsAt &&
    normalized.endsAt <= normalized.startsAt
  ) {
    errors.endsAt = 'The end time must be after the start time.';
  }

  if (normalized.location.length > MAX_LOCATION) {
    errors.location = `Keep the location to ${MAX_LOCATION} characters or fewer.`;
  }

  return errors;
}

export function sortActivitiesChronologically(
  activities: readonly TimelineActivity[],
): TimelineActivity[] {
  return [...activities].sort(
    (first, second) =>
      first.startsAt.localeCompare(second.startsAt) ||
      first.endsAt.localeCompare(second.endsAt) ||
      first.id.localeCompare(second.id),
  );
}

export function filterActivities(
  activities: readonly TimelineActivity[],
  filter: ActivityStatusFilter,
): TimelineActivity[] {
  if (filter === 'all') {
    return [...activities];
  }

  return activities.filter((activity) => activity.status === filter);
}

export function selectUpcomingActivities(
  activities: readonly TimelineActivity[],
  nowLocal: string,
  limit?: number,
): TimelineActivity[] {
  const upcoming = sortActivitiesChronologically(
    activities.filter(
      (activity) => activity.status === 'scheduled' && activity.startsAt >= nowLocal,
    ),
  );

  return typeof limit === 'number' ? upcoming.slice(0, limit) : upcoming;
}

/**
 * Reports every pair of activities for the same event whose time ranges
 * overlap. An overlap is a review prompt, not an automatic error.
 */
export function findActivityOverlaps(
  activities: readonly TimelineActivity[],
): ActivityOverlap[] {
  const overlaps: ActivityOverlap[] = [];
  const sorted = sortActivitiesChronologically(activities);

  for (let firstIndex = 0; firstIndex < sorted.length; firstIndex += 1) {
    const first = sorted[firstIndex];

    if (!first) {
      continue;
    }

    for (let secondIndex = firstIndex + 1; secondIndex < sorted.length; secondIndex += 1) {
      const second = sorted[secondIndex];

      if (!second || second.eventId !== first.eventId) {
        continue;
      }

      if (second.startsAt >= first.endsAt) {
        continue;
      }

      if (first.startsAt < second.endsAt && second.startsAt < first.endsAt) {
        overlaps.push({
          firstId: first.id,
          secondId: second.id,
          firstTitle: first.title,
          secondTitle: second.title,
          firstStartsAt: first.startsAt,
          firstEndsAt: first.endsAt,
          secondStartsAt: second.startsAt,
          secondEndsAt: second.endsAt,
        });
      }
    }
  }

  return overlaps;
}

export function activityIdsInOverlaps(
  overlaps: readonly ActivityOverlap[],
): ReadonlySet<string> {
  return new Set(overlaps.flatMap((overlap) => [overlap.firstId, overlap.secondId]));
}
