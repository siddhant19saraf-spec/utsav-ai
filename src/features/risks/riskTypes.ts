import type { Workspace } from '@/types/domain';
import type {
  RiskCategory,
  RiskCertainty,
  RiskEntityRef,
  RiskEvidence,
  RiskFinding,
  RiskSeverity,
} from '@/types/risk';
import type { RiskThresholds } from './riskConfig';

/**
 * A finding produced by one deterministic rule pass, before lifecycle state is
 * attached. It carries no timestamp because analysis is a pure function of the
 * workspace and the date passed in.
 */
export interface RiskDetection {
  readonly id: string;
  readonly eventId: string;
  readonly category: RiskCategory;
  readonly severity: RiskSeverity;
  readonly certainty: RiskCertainty;
  readonly title: string;
  readonly explanation: string;
  readonly evidence: readonly RiskEvidence[];
  readonly recommendedAction: string;
  readonly relatedEntities: readonly RiskEntityRef[];
  readonly sourceModule: string;
  readonly ruleId: string;
}

export interface RiskAnalysisError {
  readonly eventId: string;
  readonly ruleId: string;
  /** Safe, generic explanation. Never includes record contents or personal data. */
  readonly message: string;
}

export interface RiskAnalysisInput {
  readonly workspace: Workspace;
  readonly todayIso: string;
  readonly thresholds?: Partial<RiskThresholds>;
}

export interface RiskAnalysisResult {
  readonly detections: readonly RiskDetection[];
  readonly errors: readonly RiskAnalysisError[];
  readonly analyzedEventIds: readonly string[];
  readonly thresholds: RiskThresholds;
}

export interface RiskReconciliationOptions {
  readonly workspace: Workspace;
  readonly detections: readonly RiskDetection[];
  readonly now: Date;
}

export interface RiskReconciliationResult {
  readonly findings: readonly RiskFinding[];
  /** True when at least one stored finding changed status during this pass. */
  readonly statusChanged: boolean;
}

export interface RiskActionResult {
  readonly ok: boolean;
  readonly message: string;
}
