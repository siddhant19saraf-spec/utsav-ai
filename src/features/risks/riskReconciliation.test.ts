import { describe, expect, it } from 'vitest';
import { makeEvent, makeRiskFinding, makeWorkspace } from '@/test/fixtures';
import type { RiskDetection } from './riskTypes';
import {
  createDetectionFingerprint,
  dismissRiskFinding,
  reconcileRiskFindings,
  restoreRiskFinding,
} from './riskReconciliation';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const LATER = new Date('2026-10-24T11:00:00.000Z');

function detection(overrides: Partial<RiskDetection> = {}): RiskDetection {
  return {
    id: 'risk:event-1:financial.test',
    eventId: 'event-1',
    category: 'financial',
    severity: 'high',
    certainty: 'confirmed',
    title: 'Planned spending exceeds the total budget',
    explanation: 'Planned category allocations add up to more than the total.',
    evidence: [
      { label: 'Total budget', value: '₹1,000' },
      { label: 'Planned spending', value: '₹1,100' },
    ],
    recommendedAction: 'Review the flexible allocations before committing.',
    relatedEntities: [
      { type: 'event', id: 'event-1' },
      { type: 'budget', id: 'budget-1' },
    ],
    sourceModule: 'budget-engine',
    ruleId: 'financial.test',
    ...overrides,
  };
}

function workspace(overrides: Parameters<typeof makeWorkspace>[0] = {}) {
  return makeWorkspace({
    events: [makeEvent()],
    ...overrides,
  });
}

function reconcile(
  currentWorkspace: ReturnType<typeof workspace>,
  detections: readonly RiskDetection[],
  now = NOW,
) {
  return reconcileRiskFindings({
    workspace: currentWorkspace,
    detections,
    now,
  });
}

describe('risk finding reconciliation', () => {
  it('creates an open finding with a content fingerprint and lifecycle timestamps', () => {
    const result = reconcile(workspace(), [detection()]);

    expect(result.findings).toHaveLength(1);
    expect(result.statusChanged).toBe(true);
    expect(result.findings[0]).toMatchObject({
      id: 'risk:event-1:financial.test',
      eventId: 'event-1',
      status: 'open',
      detectedAt: NOW.toISOString(),
      lastDetectedAt: NOW.toISOString(),
      statusChangedAt: NOW.toISOString(),
      severity: 'high',
    });
    expect(result.findings[0]?.fingerprint).toBe(
      createDetectionFingerprint(detection()),
    );
  });

  it('updates the same open finding on repeated analysis instead of duplicating it', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const second = reconcile(
      workspace({ riskFindings: first.findings }),
      [detection()],
      LATER,
    );

    expect(second.findings).toHaveLength(1);
    expect(second.findings[0]?.detectedAt).toBe(NOW.toISOString());
    expect(second.findings[0]?.lastDetectedAt).toBe(LATER.toISOString());
    expect(second.findings[0]?.status).toBe('open');
    expect(second.statusChanged).toBe(false);
  });

  it('collapses duplicate detections in one pass, keeping the most severe content', () => {
    const result = reconcile(workspace(), [
      detection({ severity: 'medium', title: 'Medium duplicate' }),
      detection({ severity: 'critical', title: 'Critical duplicate' }),
      detection({ severity: 'high', title: 'High duplicate' }),
    ]);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe('critical');
    expect(result.findings[0]?.title).toBe('Critical duplicate');
  });

  it('resolves an open finding when its issue is no longer detected and preserves history', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const resolved = reconcile(
      workspace({ riskFindings: first.findings }),
      [],
      LATER,
    );
    const finding = resolved.findings[0];

    expect(resolved.statusChanged).toBe(true);
    expect(finding?.status).toBe('resolved');
    expect(finding?.resolvedAt).toBe(LATER.toISOString());
    expect(finding?.detectedAt).toBe(NOW.toISOString());
    expect(finding?.lastDetectedAt).toBe(NOW.toISOString());
    expect(finding?.title).toBe('Planned spending exceeds the total budget');

    const stillGone = reconcile(
      workspace({ riskFindings: resolved.findings }),
      [],
      new Date('2026-10-25T09:00:00.000Z'),
    );
    expect(stillGone.findings[0]?.status).toBe('resolved');
    expect(stillGone.findings[0]?.resolvedAt).toBe(LATER.toISOString());
    expect(stillGone.statusChanged).toBe(false);
  });

  it('reopens a resolved finding when the issue reappears', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const resolved = reconcile(
      workspace({ riskFindings: first.findings }),
      [],
      LATER,
    );
    const reopened = reconcile(
      workspace({ riskFindings: resolved.findings }),
      [detection()],
      new Date('2026-10-26T09:00:00.000Z'),
    );
    const finding = reopened.findings[0];

    expect(finding?.status).toBe('open');
    expect(finding?.reopenedAt).toBe('2026-10-26T09:00:00.000Z');
    expect(finding?.reopenReason).toBe('reappeared');
    expect(finding?.detectedAt).toBe(NOW.toISOString());
    expect(reopened.statusChanged).toBe(true);
  });

  it('keeps a dismissed finding dismissed while its fingerprint is unchanged', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const dismissed = dismissRiskFinding(
      first.findings,
      'risk:event-1:financial.test',
      LATER,
    );

    expect(dismissed.result.ok).toBe(true);

    const next = reconcile(
      workspace({ riskFindings: dismissed.findings }),
      [detection()],
      new Date('2026-10-25T09:00:00.000Z'),
    );
    const finding = next.findings[0];

    expect(finding?.status).toBe('dismissed');
    expect(finding?.dismissedAt).toBe(LATER.toISOString());
    expect(finding?.lastDetectedAt).toBe('2026-10-25T09:00:00.000Z');
    expect(finding?.reopenedAt).toBeUndefined();
    expect(next.statusChanged).toBe(false);
  });

  it('reopens a dismissed finding when its evidence or severity changes', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const dismissed = dismissRiskFinding(
      first.findings,
      'risk:event-1:financial.test',
      LATER,
    );
    const changed = reconcile(
      workspace({ riskFindings: dismissed.findings }),
      [
        detection({
          severity: 'critical',
          evidence: [
            { label: 'Total budget', value: '₹1,000' },
            { label: 'Planned spending', value: '₹1,400' },
          ],
          explanation: 'The overrun has grown since the finding was dismissed.',
        }),
      ],
      new Date('2026-10-25T09:00:00.000Z'),
    );
    const finding = changed.findings[0];

    expect(finding?.status).toBe('open');
    expect(finding?.severity).toBe('critical');
    expect(finding?.reopenReason).toBe('detection-changed');
    expect(changed.statusChanged).toBe(true);
  });

  it('updates an open finding in place when its evidence and severity change', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const changed = reconcile(
      workspace({ riskFindings: first.findings }),
      [
        detection({
          severity: 'critical',
          evidence: [{ label: 'Overrun', value: '₹400' }],
        }),
      ],
      LATER,
    );
    const finding = changed.findings[0];

    expect(finding?.status).toBe('open');
    expect(finding?.severity).toBe('critical');
    expect(finding?.evidence).toEqual([{ label: 'Overrun', value: '₹400' }]);
    expect(finding?.detectedAt).toBe(NOW.toISOString());
    expect(finding?.statusChangedAt).toBe(NOW.toISOString());
    expect(finding?.lastDetectedAt).toBe(LATER.toISOString());
  });

  it('omits findings whose event has been removed and leaves other events isolated', () => {
    const staleFinding = makeRiskFinding({
      id: 'risk:removed-event:financial.test',
      eventId: 'removed-event',
    });
    const keptFinding = makeRiskFinding({
      id: 'risk:event-2:financial.test',
      eventId: 'event-2',
    });
    const result = reconcileRiskFindings({
      workspace: makeWorkspace({
        events: [makeEvent({ id: 'event-2' })],
        riskFindings: [staleFinding, keptFinding],
      }),
      detections: [
        detection({
          id: 'risk:event-2:financial.test',
          eventId: 'event-2',
        }),
      ],
      now: NOW,
    });

    expect(result.findings.map((finding) => finding.id)).toEqual([
      'risk:event-2:financial.test',
    ]);
    expect(result.findings[0]?.eventId).toBe('event-2');
  });

  it('creates a detection under its own event rather than reusing another event finding', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const second = reconcile(
      makeWorkspace({
        events: [makeEvent(), makeEvent({ id: 'event-2' })],
        riskFindings: first.findings,
      }),
      [
        detection(),
        detection({
          id: 'risk:event-2:financial.test',
          eventId: 'event-2',
          title: 'Second event overrun',
        }),
      ],
      LATER,
    );

    expect(second.findings).toHaveLength(2);
    expect(
      second.findings.filter((finding) => finding.eventId === 'event-2'),
    ).toHaveLength(1);
  });

  it('rejects an invalid reconciliation timestamp', () => {
    expect(() =>
      reconcileRiskFindings({
        workspace: workspace(),
        detections: [],
        now: new Date('not-a-date'),
      }),
    ).toThrow(/valid Date/i);
  });
});

describe('risk finding dismissal and restoration', () => {
  it('moves an open finding to dismissed history without resolving the underlying issue', () => {
    const first = reconcile(workspace(), [detection()], NOW);
    const original = first.findings[0];
    const result = dismissRiskFinding(
      first.findings,
      'risk:event-1:financial.test',
      LATER,
    );
    const finding = result.findings[0];

    expect(result.result.ok).toBe(true);
    expect(result.result.message).toMatch(/dismissed/i);
    expect(finding?.status).toBe('dismissed');
    expect(finding?.dismissedAt).toBe(LATER.toISOString());
    expect(finding?.resolvedAt).toBeUndefined();
    expect(finding?.title).toBe(original?.title);
    expect(result.findings).not.toBe(first.findings);
  });

  it('rejects dismissal of resolved, missing, or already dismissed findings', () => {
    const resolved = makeRiskFinding({
      id: 'risk:event-1:resolved',
      status: 'resolved',
      resolvedAt: NOW.toISOString(),
    });
    const dismissed = makeRiskFinding({
      id: 'risk:event-1:dismissed',
      status: 'dismissed',
      dismissedAt: NOW.toISOString(),
    });

    expect(
      dismissRiskFinding([resolved], resolved.id, LATER).result.message,
    ).toMatch(/resolved findings cannot be dismissed/i);
    expect(
      dismissRiskFinding([dismissed], dismissed.id, LATER).result.message,
    ).toMatch(/already dismissed/i);
    expect(
      dismissRiskFinding([], 'missing', LATER).result.message,
    ).toMatch(/no longer exists/i);
  });

  it('restores a dismissed finding as open with an explicit reopen reason', () => {
    const dismissed = makeRiskFinding({
      id: 'risk:event-1:dismissed',
      status: 'dismissed',
      dismissedAt: NOW.toISOString(),
    });
    const result = restoreRiskFinding([dismissed], dismissed.id, LATER);
    const finding = result.findings[0];

    expect(result.result.ok).toBe(true);
    expect(finding?.status).toBe('open');
    expect(finding?.reopenedAt).toBe(LATER.toISOString());
    expect(finding?.reopenReason).toBe('dismissal-undone');
    expect(finding?.dismissedAt).toBeUndefined();
    expect(dismissed.status).toBe('dismissed');
  });

  it('rejects restoring a finding that is not dismissed', () => {
    const open = makeRiskFinding();
    const findings = [open];
    const result = restoreRiskFinding(findings, open.id, LATER);

    expect(result.result.ok).toBe(false);
    expect(result.result.message).toMatch(/only dismissed findings/i);
    expect(result.findings).toBe(findings);
    expect(open.status).toBe('open');
  });
});
