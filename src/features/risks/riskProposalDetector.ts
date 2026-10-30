import { createEventSnapshotSignature } from '@/lib/eventSnapshot';
import { formatCount } from '@/lib/format';
import type {
  CateringEstimateConfig,
  CelebrationEvent,
  Guest,
  PlanningTask,
  TimelineActivity,
} from '@/types/domain';
import type { RiskProposalSnapshot, RiskSeverity } from '@/types/risk';
import { createProposalDataSignature } from './riskSignatures';
import type { RiskDetection } from './riskTypes';
import { detection, entity, evidence, formatLocalDateTime } from './riskDetectorSupport';

interface ProposalContext {
  readonly event: CelebrationEvent;
  readonly tasks: readonly PlanningTask[];
  readonly guests: readonly Guest[];
  readonly activities: readonly TimelineActivity[];
  readonly estimate: CateringEstimateConfig | null;
  readonly withinCriticalWindow: boolean;
  readonly snapshots: readonly RiskProposalSnapshot[];
}

export function analyzeProposals(context: ProposalContext): RiskDetection[] {
  const { event, snapshots, withinCriticalWindow } = context;
  const detections: RiskDetection[] = [];
  const currentEventSignature = createEventSnapshotSignature(event);
  const currentDataSignature = createProposalDataSignature(
    event,
    context.tasks,
    context.guests,
    context.activities,
    context.estimate,
  );
  const protectedIds = new Set(
    event.budget.categories
      .filter((category) => category.flexibility.mode === 'protected')
      .map((category) => category.id),
  );

  for (const snapshot of snapshots) {
    if (snapshot.eventId !== event.id) {
      continue;
    }

    const dataChanged =
      snapshot.originalEventSignature !== currentEventSignature ||
      snapshot.relatedDataSignature !== currentDataSignature;

    if (!dataChanged) {
      continue;
    }

    const protectedConflict = snapshot.affectedCategoryIds.some(
      (categoryId) =>
        protectedIds.has(categoryId) &&
        !snapshot.protectedCategoryIds.includes(categoryId),
    );
    const ruleId = protectedConflict
      ? 'proposal-consistency.protected-conflict'
      : 'proposal-consistency.stale';
    const severity: RiskSeverity = withinCriticalWindow ? 'critical' : 'high';

    detections.push(
      detection(event, ruleId, {
        category: 'proposal-consistency',
        severity,
        certainty: 'confirmed',
        title: protectedConflict
          ? 'Event Rescue proposal conflicts with current protections'
          : 'Event Rescue proposal is based on outdated data',
        explanation: protectedConflict
          ? 'The event or its related records changed after this proposal was generated, and it now affects a category that is protected. The proposal cannot be approved safely.'
          : 'The event, budget, tasks, guests, or activities changed after this proposal was generated. Its recommended changes were evaluated against older data.',
        evidence: [
          evidence('Proposal generated', formatLocalDateTime(snapshot.createdAt.slice(0, 16))),
          evidence('Proposed changes', formatCount(snapshot.changeCount)),
          evidence(
            'Validation when generated',
            snapshot.isValid ? 'Passed' : 'Did not pass',
          ),
          evidence('Unresolved issues reported', formatCount(snapshot.unresolvedIssueCount)),
          evidence(
            'Data changed since analysis',
            snapshot.originalEventSignature !== currentEventSignature
              ? 'Event or budget'
              : 'Tasks, guests, or activities',
          ),
        ],
        recommendedAction:
          'Open Event Rescue for this event and analyze again to create a fresh proposal against the latest data. Nothing from the outdated proposal has been applied.',
        relatedEntities: [
          entity('event', event.id),
          entity('rescue-proposal', snapshot.proposalId),
          ...snapshot.affectedCategoryIds
            .slice(0, 4)
            .map((categoryId) => entity('budget-category', categoryId)),
        ],
        sourceModule: 'event-rescue',
        entityKey: snapshot.proposalId,
      }),
    );
  }

  return detections;
}
