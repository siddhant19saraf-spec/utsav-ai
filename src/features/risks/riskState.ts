import type { RiskFinding } from '@/types/risk';
import type { Workspace } from '@/types/domain';
import { analyzeWorkspaceRisks } from './riskEngine';
import type { RiskAnalysisResult } from './riskTypes';
import { reconcileRiskFindings } from './riskReconciliation';
import type { RiskThresholds } from './riskConfig';
import type { RiskReconciliationResult } from './riskTypes';

export interface RiskStateOptions {
  readonly todayIso: string;
  readonly now: Date;
  readonly thresholds?: Partial<RiskThresholds>;
}

export interface RiskStateResult {
  readonly workspace: Workspace;
  readonly analysis: RiskAnalysisResult;
  readonly reconciliation: RiskReconciliationResult;
}

function pruneSnapshots(workspace: Workspace): Workspace {
  const eventIds = new Set(workspace.events.map((event) => event.id));

  return {
    ...workspace,
    rescueProposalSnapshots: (workspace.rescueProposalSnapshots ?? []).filter(
      (snapshot) => eventIds.has(snapshot.eventId),
    ),
  };
}

/**
 * Runs the pure engine and reconciliation pass, then returns a new workspace
 * with derived findings. The input workspace and all of its records are left
 * untouched.
 */
export function applyRiskAnalysis(
  workspace: Workspace,
  options: RiskStateOptions,
): RiskStateResult {
  const analysis = analyzeWorkspaceRisks({
    workspace,
    todayIso: options.todayIso,
    ...(options.thresholds ? { thresholds: options.thresholds } : {}),
  });
  const reconciliation = reconcileRiskFindings({
    workspace,
    detections: analysis.detections,
    now: options.now,
  });
  const nextWorkspace: Workspace = {
    ...pruneSnapshots(workspace),
    riskFindings: reconciliation.findings,
  };

  return { workspace: nextWorkspace, analysis, reconciliation };
}

export function replaceRiskFindings(
  workspace: Workspace,
  findings: readonly RiskFinding[],
): Workspace {
  return { ...workspace, riskFindings: findings };
}
