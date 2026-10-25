import { describe, expect, it } from 'vitest';
import {
  aiPlanEnvelopeSchema,
  aiPlanRequestSchema,
  aiPlanSchema,
  aiStatusSchema,
} from './contracts';
import {
  makeAiEnvelope,
  makeAiEventContext,
  makeAiPlan,
  makeAiRequest,
} from '@/test/aiFixtures';

describe('AI planning contracts', () => {
  it('accepts a complete request, plan, envelope, and status payload', () => {
    expect(aiPlanRequestSchema.safeParse(makeAiRequest()).success).toBe(true);
    expect(aiPlanSchema.safeParse(makeAiPlan()).success).toBe(true);
    expect(aiPlanEnvelopeSchema.safeParse(makeAiEnvelope()).success).toBe(true);
    expect(
      aiStatusSchema.safeParse({
        configured: false,
        providerName: null,
        model: null,
        message: 'AI planning is not configured.',
        limits: {
          maxMessageCharacters: 2_000,
          maxRequestBytes: 96_000,
          timeoutMs: 20_000,
          rateLimitPerMinute: 10,
        },
      }).success,
    ).toBe(true);
  });

  it('applies safe defaults for optional plan arrays', () => {
    const parsed = aiPlanSchema.safeParse({ overview: 'A short plan overview.' });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.assumptions).toEqual([]);
      expect(parsed.data.timeline).toEqual([]);
      expect(parsed.data.tasks).toEqual([]);
      expect(parsed.data.budgetCategories).toEqual([]);
      expect(parsed.data.catering).toBeNull();
    }
  });

  it('rejects unknown modes, short messages, and oversized messages', () => {
    expect(
      aiPlanRequestSchema.safeParse(makeAiRequest({ mode: 'answer' as never })).success,
    ).toBe(false);
    expect(
      aiPlanRequestSchema.safeParse(makeAiRequest({ message: '  hi ' })).success,
    ).toBe(false);
    expect(
      aiPlanRequestSchema.safeParse(
        makeAiRequest({ message: 'x'.repeat(2_001) }),
      ).success,
    ).toBe(false);
  });

  it('rejects malformed dates, negative money, and invalid priorities', () => {
    const invalidTimeline = makeAiPlan();
    invalidTimeline.timeline[0] = {
      ...invalidTimeline.timeline[0]!,
      startsAt: '2030-12-01 17:00',
    };
    expect(aiPlanSchema.safeParse(invalidTimeline).success).toBe(false);

    const negativeBudget = makeAiPlan();
    negativeBudget.budgetCategories[0] = {
      ...negativeBudget.budgetCategories[0]!,
      plannedMinor: -1,
    };
    expect(aiPlanSchema.safeParse(negativeBudget).success).toBe(false);

    const invalidPriority = makeAiPlan();
    invalidPriority.tasks[0] = {
      ...invalidPriority.tasks[0]!,
      priority: 'urgent' as never,
    };
    expect(aiPlanSchema.safeParse(invalidPriority).success).toBe(false);
  });

  it('rejects malformed provider envelopes and invalid status values', () => {
    expect(
      aiPlanEnvelopeSchema.safeParse(
        makeAiEnvelope({ source: 'ai' as never }),
      ).success,
    ).toBe(false);
    expect(
      aiPlanEnvelopeSchema.safeParse(
        makeAiEnvelope({ generatedAt: 'not-a-timestamp' }),
      ).success,
    ).toBe(false);
    expect(
      aiStatusSchema.safeParse({
        configured: false,
        providerName: null,
        model: null,
        message: 'Unavailable.',
        limits: null,
        extra: 'ignored',
      }).success,
    ).toBe(true);
  });

  it('enforces collection limits and event-context constraints', () => {
    const tooManyTasks = makeAiPlan();
    tooManyTasks.tasks = Array.from({ length: 41 }, (_, index) => ({
      title: `Task ${index}`,
      description: null,
      dueDate: '2030-11-20',
      priority: 'medium' as const,
      milestone: false,
    }));
    expect(aiPlanSchema.safeParse(tooManyTasks).success).toBe(false);

    const negativeGuests = makeAiEventContext();
    negativeGuests.expectedGuests = -1;
    expect(aiPlanSchema.safeParse(makeAiPlan()).success).toBe(true);
    expect(
      aiPlanRequestSchema.safeParse({
        mode: 'create-plan',
        message: 'Plan something useful.',
        event: negativeGuests,
      }).success,
    ).toBe(false);
  });
});
