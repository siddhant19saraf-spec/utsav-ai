import type { RescueChange, RescueProposal } from '@/features/rescue/rescueTypes';
import type { Workspace } from '@/types/domain';
import type {
  RiskProposalChangeSnapshot,
  RiskProposalSnapshot,
} from '@/types/risk';
import { createProposalDataSignature } from './riskSignatures';

const categoryChangePrefixes = [
  { prefix: 'change-planned-', kind: 'planned' },
  { prefix: 'change-protection-', kind: 'protection' },
  { prefix: 'change-minimum-', kind: 'minimum' },
] as const;

function categoryIdForChange(change: RescueChange): string | undefined {
  for (const entry of categoryChangePrefixes) {
    if (change.id.startsWith(entry.prefix)) {
      return change.id.slice(entry.prefix.length);
    }
  }

  return undefined;
}

function snapshotChange(change: RescueChange): RiskProposalChangeSnapshot {
  const categoryId = categoryIdForChange(change);

  return {
    label: change.label,
    before: change.before,
    after: change.after,
    impact: change.impact,
    ...(categoryId ? { categoryId } : {}),
  };
}

/**
 * Summarises a rescue proposal for later consistency checks. It stores labels
 * and signatures, not a second copy of the event, so it cannot be approved.
 */
export function buildRescueProposalSnapshot(
  workspace: Workspace,
  proposal: RescueProposal,
): RiskProposalSnapshot {
  const eventId = proposal.eventId;
  const tasks = workspace.tasks.filter((task) => task.eventId === eventId);
  const guests = workspace.guests.filter((guest) => guest.eventId === eventId);
  const activities = workspace.activities.filter(
    (activity) => activity.eventId === eventId,
  );
  const estimates = workspace.cateringEstimates.filter(
    (estimate) => estimate.eventId === eventId,
  );
  const estimate = estimates[0] ?? null;
  const changes = proposal.changes.map(snapshotChange);
  const affectedCategoryIds = [
    ...new Set(
      changes
        .map((change) => change.categoryId)
        .filter((categoryId): categoryId is string => Boolean(categoryId)),
    ),
  ];

  return {
    proposalId: proposal.id,
    eventId,
    createdAt: proposal.createdAt,
    originalEventSignature: proposal.originalEventSignature,
    relatedDataSignature: createProposalDataSignature(
      proposal.originalEvent,
      tasks,
      guests,
      activities,
      estimate,
    ),
    protectedCategoryIds: [...proposal.protectedCategoryIds],
    affectedCategoryIds,
    changeCount: proposal.changes.length,
    changes,
    isValid: proposal.validation.isValid,
    unresolvedIssueCount: proposal.unresolvedIssues.length,
  };
}

/**
 * Keeps only the most recent rescue proposal per event. Older proposals are
 * superseded by a fresh analysis, so flagging them as stale adds noise without
 * a corresponding action.
 */
export function withRecordedProposalSnapshot(
  workspace: Workspace,
  proposal: RescueProposal,
): Workspace {
  const snapshot = buildRescueProposalSnapshot(workspace, proposal);
  const snapshots = (workspace.rescueProposalSnapshots ?? []).filter(
    (entry) => entry.eventId !== proposal.eventId,
  );

  return {
    ...workspace,
    rescueProposalSnapshots: [...snapshots, snapshot],
  };
}

export function withoutProposalSnapshot(
  workspace: Workspace,
  eventId: string,
): Workspace {
  return {
    ...workspace,
    rescueProposalSnapshots: (workspace.rescueProposalSnapshots ?? []).filter(
      (entry) => entry.eventId !== eventId,
    ),
  };
}
