import { calculateBudgetTotals } from '@/features/budget/calculations';
import {
  workspaceReducer,
  type WorkspaceAction,
} from '@/features/workspace/workspaceReducer';
import { cloneEvent } from '@/lib/eventSnapshot';
import { formatMoney } from '@/lib/money';
import type { CelebrationEvent, Workspace } from '@/types/domain';
import type { RescueApplyResult, RescueProposal } from './rescueTypes';
import { validateRescueProposal } from './rescueValidation';

export interface RescueApprovalDependencies {
  readonly persist: (
    workspace: Workspace,
  ) => { readonly ok: true } | { readonly ok: false; readonly message: string };
  readonly isDuplicate: (proposalId: string) => boolean;
  /**
   * Derives any additional workspace state (such as risk findings) after the
   * event change and before it is persisted. It must not modify the approved
   * event or make the save less atomic.
   */
  readonly prepare?: (workspace: Workspace) => Workspace;
}

export interface RescueApprovalOptions {
  readonly todayIso: string;
  readonly now?: Date;
}

export interface RescueApprovalOutcome {
  readonly result: RescueApplyResult;
  /** The prepared workspace to keep only when the result is successful. */
  readonly workspace: Workspace;
  /** The reducer action that applied the approved event. */
  readonly action: WorkspaceAction | null;
}

function failure(
  workspace: Workspace,
  code: 'stale' | 'duplicate' | 'invalid' | 'not-found' | 'persistence',
  message: string,
): RescueApprovalOutcome {
  return {
    result: { ok: false, code, message },
    workspace,
    action: null,
  };
}

function buildApprovedEvent(
  proposal: RescueProposal,
  timestamp: string,
): CelebrationEvent {
  const event = cloneEvent(proposal.proposedEvent);

  return {
    ...event,
    updatedAt: timestamp,
    budget: {
      ...event.budget,
      updatedAt: timestamp,
    },
  };
}

/**
 * Validates a rescue proposal against the current event and persists the
 * replacement atomically. Storage is written before the action is returned,
 * so a failed save leaves the caller's in-memory workspace untouched and the
 * same proposal can be retried safely.
 *
 * A proposal is rejected when the event changed after generation, when its
 * signature no longer matches, when it has no changes, or when it was already
 * applied.
 */
export function approveRescueProposal(
  workspace: Workspace,
  proposal: RescueProposal,
  dependencies: RescueApprovalDependencies,
  options: RescueApprovalOptions,
): RescueApprovalOutcome {
  if (dependencies.isDuplicate(proposal.id)) {
    return failure(
      workspace,
      'duplicate',
      'This proposal was already applied. Nothing was changed again.',
    );
  }

  const currentEvent = workspace.events.find(
    (event) => event.id === proposal.eventId,
  );

  if (!currentEvent) {
    return failure(
      workspace,
      'not-found',
      'The selected event no longer exists. Nothing was changed.',
    );
  }

  if (!proposal.validation.isValid) {
    return failure(
      workspace,
      'invalid',
      'This proposal did not pass its own validation and cannot be applied.',
    );
  }

  if (proposal.changes.length === 0) {
    return failure(
      workspace,
      'invalid',
      'This proposal contains no changes to apply.',
    );
  }

  const validation = validateRescueProposal(
    proposal,
    currentEvent,
    options.todayIso,
  );

  if (!validation.isValid) {
    const stale = validation.issues.some(
      (issue) =>
        issue.code === 'proposal-stale' ||
        issue.code === 'current-snapshot-stale',
    );
    const firstError = validation.issues.find(
      (issue) => issue.severity === 'error',
    );

    return failure(
      workspace,
      stale ? 'stale' : 'invalid',
      stale
        ? 'The event changed after this proposal was generated. Nothing was applied. Analyze the event again to create a fresh proposal.'
        : firstError?.message ??
            'The proposal is invalid against the current event. Nothing was applied.',
    );
  }

  const now = options.now ?? new Date();
  const approvedEvent = buildApprovedEvent(proposal, now.toISOString());
  let plannedMinor: number;

  try {
    plannedMinor = calculateBudgetTotals(approvedEvent.budget).planned.amountMinor;
  } catch {
    return failure(
      workspace,
      'invalid',
      'The approved plan could not be calculated safely. Nothing was applied.',
    );
  }

  const action: WorkspaceAction = {
    type: 'rescue/applied',
    eventId: approvedEvent.id,
    expectedSignature: proposal.originalEventSignature,
    event: approvedEvent,
  };
  const next = workspaceReducer(workspace, action);

  if (next === workspace) {
    return failure(
      workspace,
      'stale',
      'The event changed before the proposal could be applied. Nothing was changed. Analyze it again.',
    );
  }

  const prepared = dependencies.prepare ? dependencies.prepare(next) : next;
  const saved = dependencies.persist(prepared);

  if (!saved.ok) {
    return failure(workspace, 'persistence', saved.message);
  }

  const remainingRisks = proposal.unresolvedIssues.length;
  const message = `Changes were applied to “${approvedEvent.name}”. Planned expenditure is now ${formatMoney({
    amountMinor: plannedMinor,
    currency: 'INR',
  })}.${
    remainingRisks > 0
      ? ` ${remainingRisks} reported ${remainingRisks === 1 ? 'risk still needs' : 'risks still need'} attention; this proposal does not resolve them.`
      : ' The saved plan passed the required validation.'
  }`;

  return {
    result: {
      ok: true,
      event: approvedEvent,
      message,
    },
    workspace: prepared,
    action,
  };
}
