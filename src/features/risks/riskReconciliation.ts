import { stableHash } from '@/lib/stableHash';
import type {
  RiskFinding,
  RiskFindingStatus,
  RiskReopenReason,
  RiskSeverity,
} from '@/types/risk';
import type {
  RiskActionResult,
  RiskDetection,
  RiskReconciliationOptions,
  RiskReconciliationResult,
} from './riskTypes';

type FindingContent = Pick<
  RiskFinding,
  | 'category'
  | 'severity'
  | 'certainty'
  | 'title'
  | 'explanation'
  | 'evidence'
  | 'recommendedAction'
  | 'relatedEntities'
  | 'sourceModule'
  | 'ruleId'
  | 'fingerprint'
>;

const severityRank: Record<RiskSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const statusRank: Record<RiskFindingStatus, number> = {
  open: 0,
  dismissed: 1,
  resolved: 2,
};

function requireValidDate(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError('Risk reconciliation needs a valid Date.');
  }

  return now.toISOString();
}

/**
 * Fingerprint of everything the user sees about a detection except lifecycle
 * dates. A dismissed finding is only reopened automatically when this content
 * actually changes.
 */
export function createDetectionFingerprint(detection: RiskDetection): string {
  return stableHash(
    JSON.stringify({
      eventId: detection.eventId,
      category: detection.category,
      severity: detection.severity,
      certainty: detection.certainty,
      title: detection.title,
      explanation: detection.explanation,
      evidence: detection.evidence.map((entry) => [entry.label, entry.value]),
      recommendedAction: detection.recommendedAction,
      relatedEntities: detection.relatedEntities.map((entry) => [
        entry.type,
        entry.id,
      ]),
      sourceModule: detection.sourceModule,
      ruleId: detection.ruleId,
    }),
  );
}

function detectionContent(detection: RiskDetection): FindingContent {
  return {
    category: detection.category,
    severity: detection.severity,
    certainty: detection.certainty,
    title: detection.title,
    explanation: detection.explanation,
    evidence: detection.evidence.map((entry) => ({ ...entry })),
    recommendedAction: detection.recommendedAction,
    relatedEntities: detection.relatedEntities.map((entry) => ({ ...entry })),
    sourceModule: detection.sourceModule,
    ruleId: detection.ruleId,
    fingerprint: createDetectionFingerprint(detection),
  };
}

function existingContent(finding: RiskFinding): FindingContent {
  return {
    category: finding.category,
    severity: finding.severity,
    certainty: finding.certainty,
    title: finding.title,
    explanation: finding.explanation,
    evidence: finding.evidence.map((entry) => ({ ...entry })),
    recommendedAction: finding.recommendedAction,
    relatedEntities: finding.relatedEntities.map((entry) => ({ ...entry })),
    sourceModule: finding.sourceModule,
    ruleId: finding.ruleId,
    fingerprint: finding.fingerprint,
  };
}

function createFinding(detection: RiskDetection, nowIso: string): RiskFinding {
  return {
    id: detection.id,
    eventId: detection.eventId,
    ...detectionContent(detection),
    detectedAt: nowIso,
    lastDetectedAt: nowIso,
    status: 'open',
    statusChangedAt: nowIso,
  };
}

function updateOpenFinding(
  finding: RiskFinding,
  content: FindingContent,
  nowIso: string,
): RiskFinding {
  return {
    id: finding.id,
    eventId: finding.eventId,
    ...content,
    detectedAt: finding.detectedAt,
    lastDetectedAt: nowIso,
    status: 'open',
    statusChangedAt: finding.statusChangedAt,
    ...(finding.reopenedAt ? { reopenedAt: finding.reopenedAt } : {}),
    ...(finding.reopenReason ? { reopenReason: finding.reopenReason } : {}),
  };
}

function reopenFinding(
  finding: RiskFinding,
  content: FindingContent,
  nowIso: string,
  reason: RiskReopenReason,
): RiskFinding {
  return {
    id: finding.id,
    eventId: finding.eventId,
    ...content,
    detectedAt: finding.detectedAt,
    lastDetectedAt: nowIso,
    status: 'open',
    statusChangedAt: nowIso,
    reopenedAt: nowIso,
    reopenReason: reason,
  };
}

function resolveFinding(finding: RiskFinding, nowIso: string): RiskFinding {
  return {
    id: finding.id,
    eventId: finding.eventId,
    ...existingContent(finding),
    detectedAt: finding.detectedAt,
    lastDetectedAt: finding.lastDetectedAt,
    status: 'resolved',
    statusChangedAt: nowIso,
    resolvedAt: nowIso,
    ...(finding.reopenedAt ? { reopenedAt: finding.reopenedAt } : {}),
    ...(finding.reopenReason ? { reopenReason: finding.reopenReason } : {}),
  };
}

function compareFindings(first: RiskFinding, second: RiskFinding): number {
  return (
    statusRank[first.status] - statusRank[second.status] ||
    first.eventId.localeCompare(second.eventId) ||
    severityRank[first.severity] - severityRank[second.severity] ||
    second.lastDetectedAt.localeCompare(first.lastDetectedAt) ||
    first.id.localeCompare(second.id)
  );
}

/**
 * Applies deterministic detections to stored findings.
 *
 * - An open issue is updated in place and keeps its first detection time.
 * - A resolved issue that reappears is reopened.
 * - A dismissed issue stays dismissed while its fingerprint is unchanged and
 *   reopens only when the detection content changes.
 * - An open issue that is no longer detected becomes resolved; dismissed and
 *   resolved findings are retained as history.
 * - Findings and snapshots for removed events are omitted.
 */
export function reconcileRiskFindings(
  options: RiskReconciliationOptions,
): RiskReconciliationResult {
  const nowIso = requireValidDate(options.now);
  const eventIds = new Set(options.workspace.events.map((event) => event.id));
  const existingById = new Map<string, RiskFinding>();

  for (const finding of options.workspace.riskFindings ?? []) {
    if (eventIds.has(finding.eventId) && !existingById.has(finding.id)) {
      existingById.set(finding.id, finding);
    }
  }

  const detectionById = new Map<string, RiskDetection>();

  for (const detection of options.detections) {
    if (!eventIds.has(detection.eventId)) {
      continue;
    }

    const current = detectionById.get(detection.id);

    if (
      !current ||
      severityRank[detection.severity] < severityRank[current.severity]
    ) {
      detectionById.set(detection.id, detection);
    }
  }

  const findings: RiskFinding[] = [];
  let statusChanged = false;

  for (const existing of existingById.values()) {
    const detection = detectionById.get(existing.id);

    if (!detection) {
      if (existing.status === 'open') {
        findings.push(resolveFinding(existing, nowIso));
        statusChanged = true;
      } else {
        findings.push(existing);
      }

      continue;
    }

    detectionById.delete(existing.id);
    const content = detectionContent(detection);

    if (existing.status === 'open') {
      findings.push(updateOpenFinding(existing, content, nowIso));
    } else if (existing.status === 'resolved') {
      findings.push(
        reopenFinding(existing, content, nowIso, 'reappeared'),
      );
      statusChanged = true;
    } else if (existing.fingerprint === content.fingerprint) {
      findings.push({ ...existing, lastDetectedAt: nowIso });
    } else {
      findings.push(
        reopenFinding(existing, content, nowIso, 'detection-changed'),
      );
      statusChanged = true;
    }
  }

  for (const detection of detectionById.values()) {
    findings.push(createFinding(detection, nowIso));
    statusChanged = true;
  }

  findings.sort(compareFindings);

  return { findings, statusChanged };
}

function findById(
  findings: readonly RiskFinding[],
  findingId: string,
): RiskFinding | undefined {
  return findings.find((finding) => finding.id === findingId);
}

export interface RiskFindingMutation {
  readonly findings: readonly RiskFinding[];
  readonly result: RiskActionResult;
}

/**
 * Dismissal only hides a finding. It never resolves the underlying issue and
 * does not change the saved event, budget, or other records.
 */
export function dismissRiskFinding(
  findings: readonly RiskFinding[],
  findingId: string,
  now: Date,
): RiskFindingMutation {
  const nowIso = requireValidDate(now);
  const finding = findById(findings, findingId);

  if (!finding) {
    return {
      findings,
      result: { ok: false, message: 'That risk finding no longer exists.' },
    };
  }

  if (finding.status === 'dismissed') {
    return {
      findings,
      result: { ok: false, message: 'That finding is already dismissed.' },
    };
  }

  if (finding.status === 'resolved') {
    return {
      findings,
      result: {
        ok: false,
        message: 'Resolved findings cannot be dismissed.',
      },
    };
  }

  const next: RiskFinding = {
    id: finding.id,
    eventId: finding.eventId,
    ...existingContent(finding),
    detectedAt: finding.detectedAt,
    lastDetectedAt: finding.lastDetectedAt,
    status: 'dismissed',
    statusChangedAt: nowIso,
    dismissedAt: nowIso,
    ...(finding.reopenedAt ? { reopenedAt: finding.reopenedAt } : {}),
    ...(finding.reopenReason ? { reopenReason: finding.reopenReason } : {}),
  };

  return {
    findings: findings.map((entry) => (entry.id === findingId ? next : entry)),
    result: {
      ok: true,
      message: 'Finding dismissed. It can be restored while this workspace is open.',
    },
  };
}

export function restoreRiskFinding(
  findings: readonly RiskFinding[],
  findingId: string,
  now: Date,
): RiskFindingMutation {
  const nowIso = requireValidDate(now);
  const finding = findById(findings, findingId);

  if (!finding) {
    return {
      findings,
      result: { ok: false, message: 'That risk finding no longer exists.' },
    };
  }

  if (finding.status !== 'dismissed') {
    return {
      findings,
      result: {
        ok: false,
        message: 'Only dismissed findings can be restored.',
      },
    };
  }

  const next: RiskFinding = {
    id: finding.id,
    eventId: finding.eventId,
    ...existingContent(finding),
    detectedAt: finding.detectedAt,
    lastDetectedAt: finding.lastDetectedAt,
    status: 'open',
    statusChangedAt: nowIso,
    reopenedAt: nowIso,
    reopenReason: 'dismissal-undone',
  };

  return {
    findings: findings.map((entry) => (entry.id === findingId ? next : entry)),
    result: {
      ok: true,
      message: 'Finding restored. The next analysis will resolve it if the issue is gone.',
    },
  };
}
