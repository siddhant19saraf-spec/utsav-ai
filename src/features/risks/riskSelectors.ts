import type {
  RiskCategory,
  RiskFinding,
  RiskFindingStatus,
  RiskSeverity,
} from '@/types/risk';

export const ALL_RISK_EVENTS = 'all';
export const ALL_RISK_CATEGORIES = 'all';
export const ALL_RISK_SEVERITIES = 'all';

export type RiskStatusFilter = RiskFindingStatus | 'all';

export interface RiskCounts {
  readonly total: number;
  readonly open: number;
  readonly resolved: number;
  readonly dismissed: number;
  readonly openBySeverity: Readonly<Record<RiskSeverity, number>>;
}

export interface RiskFilter {
  readonly eventId: string;
  readonly category: RiskCategory | typeof ALL_RISK_CATEGORIES;
  readonly severity: RiskSeverity | typeof ALL_RISK_SEVERITIES;
  readonly status: RiskStatusFilter;
}

export interface EventRiskSummary {
  readonly open: number;
  readonly critical: number;
  readonly high: number;
  readonly highestSeverity: RiskSeverity | null;
}

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

function emptyCounts(): {
  total: number;
  open: number;
  resolved: number;
  dismissed: number;
  openBySeverity: Record<RiskSeverity, number>;
} {
  return {
    total: 0,
    open: 0,
    resolved: 0,
    dismissed: 0,
    openBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
  };
}

export function selectRiskCounts(findings: readonly RiskFinding[]): RiskCounts {
  const counts = emptyCounts();

  for (const finding of findings) {
    counts.total += 1;

    if (finding.status === 'open') {
      counts.open += 1;
      counts.openBySeverity[finding.severity] += 1;
    } else if (finding.status === 'resolved') {
      counts.resolved += 1;
    } else {
      counts.dismissed += 1;
    }
  }

  return counts;
}

export function selectFindingsForEvent(
  findings: readonly RiskFinding[],
  eventId: string,
): readonly RiskFinding[] {
  return eventId === ALL_RISK_EVENTS
    ? findings
    : findings.filter((finding) => finding.eventId === eventId);
}

export function sortRiskFindings(findings: readonly RiskFinding[]): RiskFinding[] {
  return [...findings].sort(
    (first, second) =>
      statusRank[first.status] - statusRank[second.status] ||
      first.eventId.localeCompare(second.eventId) ||
      severityRank[first.severity] - severityRank[second.severity] ||
      second.lastDetectedAt.localeCompare(first.lastDetectedAt) ||
      first.id.localeCompare(second.id),
  );
}

export function filterRiskFindings(
  findings: readonly RiskFinding[],
  filter: RiskFilter,
): RiskFinding[] {
  return sortRiskFindings(
    selectFindingsForEvent(findings, filter.eventId)
      .filter(
        (finding) =>
          filter.category === ALL_RISK_CATEGORIES ||
          finding.category === filter.category,
      )
      .filter(
        (finding) =>
          filter.severity === ALL_RISK_SEVERITIES ||
          finding.severity === filter.severity,
      )
      .filter(
        (finding) =>
          filter.status === 'all' || finding.status === filter.status,
      ),
  );
}

export function selectTopOpenFindings(
  findings: readonly RiskFinding[],
  limit: number,
): RiskFinding[] {
  return sortRiskFindings(findings)
    .filter((finding) => finding.status === 'open')
    .slice(0, Math.max(0, limit));
}

export function selectEventRiskSummary(
  findings: readonly RiskFinding[],
  eventId: string,
): EventRiskSummary {
  let open = 0;
  let critical = 0;
  let high = 0;
  let highestSeverity: RiskSeverity | null = null;

  for (const finding of findings) {
    if (finding.eventId !== eventId || finding.status !== 'open') {
      continue;
    }

    open += 1;

    if (finding.severity === 'critical') {
      critical += 1;
    }

    if (finding.severity === 'high') {
      high += 1;
    }

    if (
      highestSeverity === null ||
      severityRank[finding.severity] < severityRank[highestSeverity]
    ) {
      highestSeverity = finding.severity;
    }
  }

  return { open, critical, high, highestSeverity };
}

export function buildEventRiskSummaries(
  findings: readonly RiskFinding[],
): ReadonlyMap<string, EventRiskSummary> {
  const eventIds = new Set(
    findings
      .filter((finding) => finding.status === 'open')
      .map((finding) => finding.eventId),
  );
  const summaries = new Map<string, EventRiskSummary>();

  for (const eventId of eventIds) {
    summaries.set(eventId, selectEventRiskSummary(findings, eventId));
  }

  return summaries;
}
