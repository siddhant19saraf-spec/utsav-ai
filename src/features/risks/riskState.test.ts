import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import type { Workspace } from '@/types/domain';
import {
  makeBudget,
  makeCategory,
  makeEvent,
  makeProposalSnapshot,
  makeRiskFinding,
  makeWorkspace,
} from '@/test/fixtures';
import { dismissRiskFinding } from './riskReconciliation';
import { applyRiskAnalysis, replaceRiskFindings } from './riskState';

const TODAY = '2026-10-24';
const NOW = new Date('2026-10-24T10:00:00.000Z');
const LATER = new Date('2026-10-24T11:00:00.000Z');

function overrunBudget() {
  return makeBudget({
    totalAvailable: rupees(1_000),
    categories: [
      makeCategory({
        planned: rupees(1_200),
        flexibility: { mode: 'protected' },
      }),
    ],
  });
}

function overrunWorkspace(findings: Workspace['riskFindings'] = undefined): Workspace {
  return makeWorkspace({
    events: [
      makeEvent({
        startsAt: '2099-06-01',
        expectedGuests: 0,
        setting: 'indoor',
        budget: overrunBudget(),
      }),
    ],
    ...(findings ? { riskFindings: findings } : {}),
  });
}

function analyze(workspace: Workspace, now = NOW) {
  return applyRiskAnalysis(workspace, { todayIso: TODAY, now });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);

    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return value;
}

describe('applyRiskAnalysis', () => {
  it('does not duplicate findings across repeated analysis and preserves first detection time', () => {
    const first = analyze(overrunWorkspace());
    const second = analyze(first.workspace, LATER);

    expect(first.workspace.riskFindings).toHaveLength(2);
    expect(second.workspace.riskFindings).toHaveLength(2);
    expect(second.workspace.riskFindings?.map((finding) => finding.id)).toEqual(
      first.workspace.riskFindings?.map((finding) => finding.id),
    );
    expect(
      second.workspace.riskFindings?.every(
        (finding) => finding.lastDetectedAt === LATER.toISOString(),
      ),
    ).toBe(true);
    expect(
      second.workspace.riskFindings?.every(
        (finding) =>
          finding.detectedAt === NOW.toISOString() &&
          finding.statusChangedAt === NOW.toISOString(),
      ),
    ).toBe(true);
    expect(second.reconciliation.statusChanged).toBe(false);
  });

  it('resolves findings after the underlying plan is fixed and keeps them as history', () => {
    const first = analyze(overrunWorkspace());
    const fixedWorkspace: Workspace = {
      ...first.workspace,
      events: first.workspace.events.map((event) => ({
        ...event,
        budget: {
          ...event.budget,
          categories: [
            makeCategory({
              planned: rupees(500),
              flexibility: { mode: 'protected' },
            }),
          ],
        },
      })),
    };
    const fixed = analyze(fixedWorkspace, LATER);
    const findings = fixed.workspace.riskFindings ?? [];

    expect(fixed.analysis.detections).toHaveLength(0);
    expect(findings).toHaveLength(2);
    expect(
      findings.every(
        (finding) =>
          finding.status === 'resolved' &&
          finding.resolvedAt === LATER.toISOString(),
      ),
    ).toBe(true);
    expect(fixed.reconciliation.statusChanged).toBe(true);

    const unchanged = analyze(fixed.workspace, new Date('2026-10-25T10:00:00.000Z'));
    expect(
      unchanged.workspace.riskFindings?.every(
        (finding) => finding.status === 'resolved',
      ),
    ).toBe(true);
  });

  it('keeps a dismissed finding dismissed when the issue remains, and never resolves it', () => {
    const first = analyze(overrunWorkspace());
    const target = first.workspace.riskFindings?.[0];

    expect(target).toBeDefined();

    if (!target) {
      return;
    }

    const dismissed = dismissRiskFinding(
      first.workspace.riskFindings ?? [],
      target.id,
      LATER,
    );
    const afterDismissal = analyze(
      { ...first.workspace, riskFindings: dismissed.findings },
      new Date('2026-10-25T10:00:00.000Z'),
    );
    const kept = afterDismissal.workspace.riskFindings?.find(
      (finding) => finding.id === target.id,
    );
    expect(kept?.status).toBe('dismissed');

    const fixedWorkspace: Workspace = {
      ...afterDismissal.workspace,
      events: afterDismissal.workspace.events.map((event) => ({
        ...event,
        budget: {
          ...event.budget,
          categories: [
            makeCategory({
              planned: rupees(500),
              flexibility: { mode: 'protected' },
            }),
          ],
        },
      })),
    };
    const afterFix = analyze(fixedWorkspace, new Date('2026-10-26T10:00:00.000Z'));
    const stillDismissed = afterFix.workspace.riskFindings?.find(
      (finding) => finding.id === target.id,
    );

    expect(stillDismissed?.status).toBe('dismissed');
    expect(stillDismissed?.resolvedAt).toBeUndefined();
  });

  it('leaves the input workspace and every saved record untouched', () => {
    const workspace = deepFreeze(
      overrunWorkspace([
        makeRiskFinding({
          id: 'risk:event-1:historical',
          status: 'resolved',
          resolvedAt: '2026-10-20T10:00:00.000Z',
        }),
      ]),
    );
    const snapshot = JSON.parse(JSON.stringify(workspace)) as unknown;

    const result = analyze(workspace);

    expect(workspace).toEqual(snapshot);
    expect(result.workspace).not.toBe(workspace);
    expect(result.workspace.events[0]?.budget).toEqual(
      workspace.events[0]?.budget,
    );
    expect(result.workspace.riskFindings).not.toBe(workspace.riskFindings);
  });

  it('prunes proposal snapshots and findings for events that no longer exist', () => {
    const workspace = overrunWorkspace([
      makeRiskFinding({
        id: 'risk:removed-event:financial.test',
        eventId: 'removed-event',
      }),
    ]);
    const withSnapshots: Workspace = {
      ...workspace,
      rescueProposalSnapshots: [
        makeProposalSnapshot({
          proposalId: 'proposal-removed',
          eventId: 'removed-event',
        }),
        makeProposalSnapshot({
          proposalId: 'proposal-current',
          eventId: 'event-1',
          originalEventSignature: 'outdated-event-signature',
          relatedDataSignature: 'outdated-related-signature',
        }),
      ],
    };

    const result = analyze(withSnapshots);

    expect(
      result.workspace.rescueProposalSnapshots?.map((entry) => entry.proposalId),
    ).toEqual(['proposal-current']);
    expect(
      result.workspace.riskFindings?.some(
        (finding) => finding.eventId === 'removed-event',
      ),
    ).toBe(false);
  });

  it('replaces findings without mutating the workspace or other records', () => {
    const workspace = overrunWorkspace();
    const findings = [
      makeRiskFinding({ id: 'replacement-finding', status: 'dismissed' }),
    ];
    const next = replaceRiskFindings(workspace, findings);

    expect(next).not.toBe(workspace);
    expect(next.riskFindings).toBe(findings);
    expect(workspace.riskFindings).toBeUndefined();
    expect(next.events).toBe(workspace.events);
  });
});
