import type { RescueProposal } from './rescueTypes';

/**
 * A proposal can be offered for approval only when the analysis is feasible,
 * validation passed, and at least one change would be applied. The result
 * badge, announcement, and approval controls must all use this same rule.
 */
export function isApprovableProposal(
  proposal: RescueProposal | null,
  feasible: boolean,
): boolean {
  return (
    proposal !== null &&
    feasible &&
    proposal.validation.isValid &&
    proposal.changes.length > 0
  );
}
