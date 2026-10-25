export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export type RiskCategory =
  | 'financial'
  | 'scheduling'
  | 'guest-catering'
  | 'venue-contingency'
  | 'proposal-consistency';

export type RiskFindingStatus = 'open' | 'resolved' | 'dismissed';

/**
 * How firmly the stored data supports a finding. `missing-data` findings are
 * information gaps, not claims that a problem definitely exists.
 */
export type RiskCertainty = 'confirmed' | 'potential' | 'missing-data' | 'assumption';

export type RiskReopenReason =
  | 'reappeared'
  | 'detection-changed'
  | 'dismissal-undone';

export type RiskEntityType =
  | 'event'
  | 'budget'
  | 'budget-category'
  | 'task'
  | 'activity'
  | 'guest'
  | 'catering-estimate'
  | 'rescue-proposal';

export interface RiskEntityRef {
  readonly type: RiskEntityType;
  readonly id: string;
}

export interface RiskEvidence {
  readonly label: string;
  readonly value: string;
}

export interface RiskFinding {
  /** Deterministic identifier derived from the event, rule, and entity scope. */
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
  /** First time this finding was detected. Preserved across updates. */
  readonly detectedAt: string;
  /** Most recent analysis that still detected the issue. */
  readonly lastDetectedAt: string;
  readonly status: RiskFindingStatus;
  readonly sourceModule: string;
  readonly ruleId: string;
  /** Hash of the finding content used to detect evidence or severity changes. */
  readonly fingerprint: string;
  readonly statusChangedAt: string;
  readonly resolvedAt?: string;
  readonly dismissedAt?: string;
  readonly reopenedAt?: string;
  readonly reopenReason?: RiskReopenReason;
}

export interface RiskProposalChangeSnapshot {
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly impact: string;
  readonly categoryId?: string;
}

/**
 * Compact record of a rescue proposal that is awaiting a decision. It is not a
 * proposal and cannot be approved; Event Rescue revalidates against the current
 * event before anything is applied.
 */
export interface RiskProposalSnapshot {
  readonly proposalId: string;
  readonly eventId: string;
  readonly createdAt: string;
  readonly originalEventSignature: string;
  /** Signature of the event plus the tasks, activities and guests used by rescue analysis. */
  readonly relatedDataSignature: string;
  readonly protectedCategoryIds: readonly string[];
  readonly affectedCategoryIds: readonly string[];
  readonly changeCount: number;
  readonly changes: readonly RiskProposalChangeSnapshot[];
  readonly isValid: boolean;
  readonly unresolvedIssueCount: number;
}
