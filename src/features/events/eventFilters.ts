import { eventCategoryLabels } from '@/lib/eventMeta';
import type { CelebrationEvent, PlanningStatus } from '@/types/domain';

export type EventStatusFilter = 'all' | PlanningStatus;

export function filterAndSortEvents(
  events: readonly CelebrationEvent[],
  search: string,
  status: EventStatusFilter,
  todayIso: string,
): CelebrationEvent[] {
  const query = search.trim().toLocaleLowerCase('en-IN');

  return events
    .filter((event) => {
      if (status !== 'all' && event.status !== status) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        event.name,
        event.venue ?? '',
        eventCategoryLabels[event.category],
      ]
        .join(' ')
        .toLocaleLowerCase('en-IN');

      return searchableText.includes(query);
    })
    .sort((first, second) => {
      const firstUpcoming = first.status !== 'completed' && first.startsAt >= todayIso;
      const secondUpcoming = second.status !== 'completed' && second.startsAt >= todayIso;

      if (firstUpcoming !== secondUpcoming) {
        return firstUpcoming ? -1 : 1;
      }

      return firstUpcoming
        ? first.startsAt.localeCompare(second.startsAt)
        : second.startsAt.localeCompare(first.startsAt);
    });
}
