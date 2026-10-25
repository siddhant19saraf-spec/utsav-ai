import { createEventSnapshotSignature } from '@/lib/eventSnapshot';
import { stableHash } from '@/lib/stableHash';
import type {
  CateringEstimateConfig,
  CelebrationEvent,
  Guest,
  PlanningTask,
  TimelineActivity,
} from '@/types/domain';

/**
 * Captures every record Event Rescue reads while building a proposal. Sorting
 * by ID keeps the signature stable when arrays are reordered without changing
 * meaning. The event snapshot itself preserves the saved category order.
 */
export function createProposalDataSignature(
  event: CelebrationEvent,
  tasks: readonly PlanningTask[],
  guests: readonly Guest[],
  activities: readonly TimelineActivity[],
  estimate: CateringEstimateConfig | null,
): string {
  return stableHash(
    JSON.stringify({
      event: createEventSnapshotSignature(event),
      tasks: [...tasks]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map((task) => ({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority,
          status: task.status,
        })),
      guests: [...guests]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map((guest) => ({
          id: guest.id,
          rsvp: guest.rsvp,
        })),
      activities: [...activities]
        .sort((first, second) => first.id.localeCompare(second.id))
        .map((activity) => ({
          id: activity.id,
          title: activity.title,
          startsAt: activity.startsAt,
          endsAt: activity.endsAt,
          priority: activity.priority,
          status: activity.status,
        })),
      cateringEstimate: estimate
        ? {
            perPersonCost: { ...estimate.perPersonCost },
            bufferPercent: estimate.bufferPercent,
          }
        : null,
    }),
  );
}
