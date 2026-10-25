import { describe, expect, it } from 'vitest';
import { rupees } from '@/lib/money';
import {
  makeBudget,
  makeCateringEstimate,
  makeEvent,
  makeGuest,
  makeRiskFinding,
  makeWorkspace,
} from '@/test/fixtures';
import { makeAiEventContext, makeAiRequest } from '@/test/aiFixtures';
import { buildLocalFallbackPlan } from './aiFallback';

const now = new Date('2026-10-24T09:00:00.000Z');

function makeFallbackWorkspace() {
  const event = makeEvent({
    id: 'event-1',
    name: 'Test Celebration',
    startsAt: '2030-12-01',
    venue: 'Test Venue',
    expectedGuests: 100,
    budget: makeBudget({
      eventId: 'event-1',
      totalAvailable: rupees(100_000),
    }),
  });

  return makeWorkspace({
    events: [event],
    guests: [
      makeGuest({ id: 'guest-1', eventId: 'event-1', rsvp: 'confirmed' }),
      makeGuest({ id: 'guest-2', eventId: 'event-1', rsvp: 'pending' }),
    ],
    cateringEstimates: [
      makeCateringEstimate({
        eventId: 'event-1',
        perPersonCost: rupees(500),
        bufferPercent: 10,
      }),
    ],
    riskFindings: [
      makeRiskFinding({
        id: 'risk-open',
        eventId: 'event-1',
        title: 'Open budget finding',
        status: 'open',
      }),
      makeRiskFinding({
        id: 'risk-resolved',
        eventId: 'event-1',
        title: 'Resolved finding',
        status: 'resolved',
      }),
    ],
  });
}

describe('deterministic local fallback', () => {
  it('builds a labelled, deterministic outline without inventing AI content', () => {
    const workspace = makeFallbackWorkspace();
    const result = buildLocalFallbackPlan(makeAiRequest(), workspace, now);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    const { envelope } = result;
    expect(envelope.source).toBe('local-fallback');
    expect(envelope.provider).toEqual({
      name: 'Local deterministic rules',
      model: 'app-rules',
    });
    expect(envelope.requestId).toMatch(/^local-/);
    expect(envelope.plan.timeline).toEqual([]);
    expect(envelope.plan.budgetCategories).toEqual([]);
    expect(envelope.plan.tasks).toHaveLength(3);
    expect(
      envelope.plan.assumptions.some((entry) =>
        entry.includes('not by an AI model'),
      ),
    ).toBe(true);
    expect(
      envelope.plan.assumptions.some((entry) =>
        entry.includes('No vendor was contacted'),
      ),
    ).toBe(true);
    expect(envelope.plan.overview).toContain('AI planning is unavailable');
    expect(envelope.plan.riskSummary?.items.map((item) => item.findingId)).toEqual([
      'risk-open',
    ]);
    expect(envelope.plan.catering).toMatchObject({
      recommendedAttendeeCount: 1,
      perPersonCostMinor: 50_000,
      bufferPercent: 10,
    });
    expect(envelope.plan.catering?.notes.join(' ')).toContain(
      'not a new recommendation',
    );
    expect(envelope.plan.overview).not.toContain('guaranteed');
  });

  it('is deterministic for the same request, workspace, and time', () => {
    const workspace = makeFallbackWorkspace();
    const first = buildLocalFallbackPlan(makeAiRequest(), workspace, now);
    const second = buildLocalFallbackPlan(makeAiRequest(), workspace, now);

    expect(first).toEqual(second);
  });

  it('does not invent an event when none is saved', () => {
    const workspace = makeWorkspace();
    const result = buildLocalFallbackPlan(
      { mode: 'create-plan', message: 'Plan a birthday for 30 guests.', event: null },
      workspace,
      now,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.envelope.plan.overview).toContain('no saved event is selected');
    expect(result.envelope.plan.tasks).toEqual([]);
    expect(result.envelope.plan.timeline).toEqual([]);
    expect(result.envelope.plan.budgetCategories).toEqual([]);
    expect(result.envelope.plan.riskSummary).toBeNull();
    expect(
      result.envelope.plan.gaps.some((gap) => gap.title === 'No saved event selected'),
    ).toBe(true);
  });

  it('treats an unknown event id as no saved event', () => {
    const workspace = makeFallbackWorkspace();
    const request = makeAiRequest({
      event: { ...makeAiEventContext(), id: 'event-missing' },
    });
    const result = buildLocalFallbackPlan(request, workspace, now);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.envelope.plan.tasks).toEqual([]);
    expect(result.envelope.plan.overview).toContain('no saved event is selected');
  });

  it('summarizes only saved findings without recalculating severity', () => {
    const workspace = makeFallbackWorkspace();
    const result = buildLocalFallbackPlan(
      makeAiRequest({ mode: 'summarize-risks' }),
      workspace,
      now,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.envelope.plan.tasks).toEqual([]);
    expect(result.envelope.plan.catering).toBeNull();
    expect(result.envelope.plan.overview).toContain('1 open deterministic finding');
    expect(result.envelope.plan.riskSummary?.items).toEqual([
      {
        findingId: 'risk-open',
        summary: expect.stringContaining('Open budget finding'),
      },
    ]);
    expect(
      result.envelope.plan.riskSummary?.overview,
    ).toContain('Severities and evidence come from Risk Intelligence');
  });

  it('does not answer a free-form question as if AI were available', () => {
    const workspace = makeFallbackWorkspace();
    const result = buildLocalFallbackPlan(
      makeAiRequest({
        mode: 'answer-question',
        message: 'Which tasks must be completed first?',
      }),
      workspace,
      now,
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.envelope.plan.overview).toContain('cannot answer');
    expect(
      result.envelope.plan.gaps.some(
        (gap) => gap.title === 'Natural-language answer unavailable',
      ),
    ).toBe(true);
    expect(result.envelope.plan.assumptions[0]).toContain('not by an AI model');
  });
});
