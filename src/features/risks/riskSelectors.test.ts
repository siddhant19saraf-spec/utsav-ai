import { describe, expect, it } from 'vitest';
import { makeRiskFinding } from '@/test/fixtures';
import {
  ALL_RISK_CATEGORIES,
  ALL_RISK_EVENTS,
  ALL_RISK_SEVERITIES,
  buildEventRiskSummaries,
  filterRiskFindings,
  selectEventRiskSummary,
  selectFindingsForEvent,
  selectRiskCounts,
  selectTopOpenFindings,
  sortRiskFindings,
} from './riskSelectors';

function sampleFindings() {
  return [
    makeRiskFinding({
      id: 'risk:alpha:financial.planned-overrun',
      eventId: 'alpha',
      severity: 'high',
      status: 'open',
      lastDetectedAt: '2026-10-20T08:00:00.000Z',
    }),
    makeRiskFinding({
      id: 'risk:alpha:scheduling.task-overdue',
      eventId: 'alpha',
      category: 'scheduling',
      severity: 'critical',
      status: 'open',
      lastDetectedAt: '2026-10-22T08:00:00.000Z',
    }),
    makeRiskFinding({
      id: 'risk:beta:guest-catering.rsvp-incomplete',
      eventId: 'beta',
      category: 'guest-catering',
      severity: 'medium',
      status: 'dismissed',
      lastDetectedAt: '2026-10-21T08:00:00.000Z',
    }),
    makeRiskFinding({
      id: 'risk:beta:venue-contingency.venue-missing',
      eventId: 'beta',
      category: 'venue-contingency',
      severity: 'low',
      status: 'resolved',
      lastDetectedAt: '2026-10-19T08:00:00.000Z',
    }),
  ];
}

describe('selectRiskCounts', () => {
  it('returns zeroed counts, including every severity, for no findings', () => {
    expect(selectRiskCounts([])).toEqual({
      total: 0,
      open: 0,
      resolved: 0,
      dismissed: 0,
      openBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    });
  });

  it('counts each status and only open findings by severity', () => {
    expect(selectRiskCounts(sampleFindings())).toEqual({
      total: 4,
      open: 2,
      resolved: 1,
      dismissed: 1,
      openBySeverity: { critical: 1, high: 1, medium: 0, low: 0 },
    });
  });
});

describe('selectFindingsForEvent', () => {
  it('keeps every finding for the all-events scope', () => {
    expect(selectFindingsForEvent(sampleFindings(), ALL_RISK_EVENTS)).toHaveLength(4);
  });

  it('isolates findings to the requested event', () => {
    const scoped = selectFindingsForEvent(sampleFindings(), 'beta');

    expect(scoped.map((finding) => finding.id)).toEqual([
      'risk:beta:guest-catering.rsvp-incomplete',
      'risk:beta:venue-contingency.venue-missing',
    ]);
  });

  it('returns nothing for an event without findings or an unknown event', () => {
    expect(selectFindingsForEvent(sampleFindings(), 'gamma')).toEqual([]);
  });
});

describe('sortRiskFindings', () => {
  it('orders open first, then by event, severity, latest check, and ID', () => {
    const sorted = sortRiskFindings(sampleFindings());

    expect(sorted.map((finding) => finding.id)).toEqual([
      'risk:alpha:scheduling.task-overdue',
      'risk:alpha:financial.planned-overrun',
      'risk:beta:guest-catering.rsvp-incomplete',
      'risk:beta:venue-contingency.venue-missing',
    ]);
  });

  it('does not mutate the supplied array', () => {
    const findings = sampleFindings();
    const originalOrder = findings.map((finding) => finding.id);

    sortRiskFindings(findings);

    expect(findings.map((finding) => finding.id)).toEqual(originalOrder);
  });

  it('breaks a same-event, same-severity tie with the most recent check first', () => {
    const sorted = sortRiskFindings([
      makeRiskFinding({
        id: 'risk:alpha:older',
        eventId: 'alpha',
        severity: 'high',
        lastDetectedAt: '2026-10-20T08:00:00.000Z',
      }),
      makeRiskFinding({
        id: 'risk:alpha:newer',
        eventId: 'alpha',
        severity: 'high',
        lastDetectedAt: '2026-10-23T08:00:00.000Z',
      }),
    ]);

    expect(sorted.map((finding) => finding.id)).toEqual([
      'risk:alpha:newer',
      'risk:alpha:older',
    ]);
  });
});

describe('filterRiskFindings', () => {
  it('combines event, category, severity, and status filters', () => {
    const filtered = filterRiskFindings(sampleFindings(), {
      eventId: 'alpha',
      category: 'scheduling',
      severity: 'critical',
      status: 'open',
    });

    expect(filtered.map((finding) => finding.id)).toEqual([
      'risk:alpha:scheduling.task-overdue',
    ]);
  });

  it('treats all-* filters as inclusive and still sorts the result', () => {
    const filtered = filterRiskFindings(sampleFindings(), {
      eventId: ALL_RISK_EVENTS,
      category: ALL_RISK_CATEGORIES,
      severity: ALL_RISK_SEVERITIES,
      status: 'all',
    });

    expect(filtered.map((finding) => finding.id)).toEqual([
      'risk:alpha:scheduling.task-overdue',
      'risk:alpha:financial.planned-overrun',
      'risk:beta:guest-catering.rsvp-incomplete',
      'risk:beta:venue-contingency.venue-missing',
    ]);
  });

  it('returns an empty list when a filter combination has no matches', () => {
    expect(
      filterRiskFindings(sampleFindings(), {
        eventId: 'alpha',
        category: 'financial',
        severity: ALL_RISK_SEVERITIES,
        status: 'dismissed',
      }),
    ).toEqual([]);
  });
});

describe('selectTopOpenFindings', () => {
  it('keeps only open findings, ordered by severity, up to the limit', () => {
    expect(
      selectTopOpenFindings(sampleFindings(), 1).map((finding) => finding.id),
    ).toEqual(['risk:alpha:scheduling.task-overdue']);
  });

  it('returns every open finding when the limit exceeds the count', () => {
    expect(selectTopOpenFindings(sampleFindings(), 10)).toHaveLength(2);
  });

  it('returns nothing for a zero or negative limit', () => {
    expect(selectTopOpenFindings(sampleFindings(), 0)).toEqual([]);
    expect(selectTopOpenFindings(sampleFindings(), -2)).toEqual([]);
  });
});

describe('event risk summaries', () => {
  it('summarises only open findings and reports the highest severity', () => {
    expect(selectEventRiskSummary(sampleFindings(), 'alpha')).toEqual({
      open: 2,
      critical: 1,
      high: 1,
      highestSeverity: 'critical',
    });
  });

  it('returns an empty summary for an event with no open findings', () => {
    expect(selectEventRiskSummary(sampleFindings(), 'beta')).toEqual({
      open: 0,
      critical: 0,
      high: 0,
      highestSeverity: null,
    });
  });

  it('builds summaries only for events with open findings', () => {
    const summaries = buildEventRiskSummaries(sampleFindings());

    expect([...summaries.keys()]).toEqual(['alpha']);
    expect(summaries.get('alpha')?.open).toBe(2);
    expect(summaries.has('beta')).toBe(false);
  });

  it('builds an empty map when no finding is open', () => {
    const summaries = buildEventRiskSummaries([
      makeRiskFinding({ status: 'resolved' }),
      makeRiskFinding({ id: 'risk:event-1:dismissed', status: 'dismissed' }),
    ]);

    expect(summaries.size).toBe(0);
  });
});
