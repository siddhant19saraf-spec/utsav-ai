import { describe, expect, it } from 'vitest';
import {
  makeAiEventContext,
  makeAiPlan,
  makeAiRequest,
} from '../src/test/aiFixtures.ts';
import type { AiRiskFindingContext } from '../src/features/ai/contracts.ts';
import { ProviderError, type AiProvider, type AiProviderRequest } from './provider.ts';
import { AiServiceError, createAiService } from './service.ts';

function makeOpenRisk(id: string): AiRiskFindingContext {
  return {
    id,
    category: 'financial',
    severity: 'high',
    certainty: 'confirmed',
    title: 'Budget rule finding',
    explanation: 'A deterministic budget rule detected an issue.',
    recommendedAction: 'Review the budget planner.',
  };
}

function makeProvider(content: string): {
  provider: AiProvider;
  calls: AiProviderRequest[];
} {
  const calls: AiProviderRequest[] = [];

  return {
    calls,
    provider: {
      name: 'Test Provider',
      model: 'test-model',
      async generate(request) {
        calls.push(request);
        return { content, model: 'test-model' };
      },
    },
  };
}

async function captureServiceError(
  content: string,
  request = makeAiRequest(),
): Promise<AiServiceError> {
  const { provider } = makeProvider(content);
  const service = createAiService({
    provider,
    timeoutMs: 20_000,
    maxOutputTokens: 1_800,
  });

  try {
    await service.generatePlan(request);
  } catch (error) {
    expect(error).toBeInstanceOf(AiServiceError);
    return error as AiServiceError;
  }

  throw new Error('Expected the AI service to reject the provider output.');
}

describe('AI service validation boundary', () => {
  it('returns a complete validated plan and bounds the provider request', async () => {
    const plan = makeAiPlan();
    const { provider, calls } = makeProvider(JSON.stringify(plan));
    const service = createAiService({
      provider,
      timeoutMs: 12_000,
      maxOutputTokens: 1_200,
    });
    const request = makeAiRequest();
    const result = await service.generatePlan(request);

    expect(result).toEqual(plan);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      timeoutMs: 12_000,
      maxOutputTokens: 1_200,
    });
    expect(calls[0]?.user).toContain('Test Celebration');
    expect(calls[0]?.system).toContain('JSON');
  });

  it('accepts fenced JSON and strips unexpected provider fields', async () => {
    const plan = { ...makeAiPlan(), injectedProviderField: 'unexpected' };
    const content = `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``;
    const { provider } = makeProvider(content);
    const service = createAiService({
      provider,
      timeoutMs: 20_000,
      maxOutputTokens: 1_800,
    });
    const result = await service.generatePlan(makeAiRequest());

    expect(result.overview).toBe(plan.overview);
    expect('injectedProviderField' in result).toBe(false);
  });

  it('rejects malformed JSON without echoing provider content', async () => {
    const error = await captureServiceError(
      '{"overview": "unterminated secret payload",}',
    );

    expect(error.code).toBe('invalid-provider-response');
    expect(error.message).toContain('malformed JSON');
    expect(error.message).not.toContain('unterminated secret payload');
  });

  it('rejects output that is missing required plan fields', async () => {
    const error = await captureServiceError(
      JSON.stringify({ timeline: [], tasks: [] }),
    );

    expect(error.code).toBe('invalid-provider-response');
    expect(error.message).toContain('required planning format');
    expect(error.message).toContain('overview');
  });

  it('rejects invalid timeline order and date-times', async () => {
    const backwards = makeAiPlan({
      timeline: [
        {
          title: 'Backwards',
          startsAt: '2030-12-01T18:00',
          endsAt: '2030-12-01T17:00',
          priority: 'medium',
          location: null,
          description: null,
        },
      ],
    });
    const invalidDate = makeAiPlan({
      timeline: [
        {
          title: 'Invalid date',
          startsAt: '2030-13-01T17:00',
          endsAt: '2030-13-01T18:00',
          priority: 'medium',
          location: null,
          description: null,
        },
      ],
    });

    const backwardsError = await captureServiceError(JSON.stringify(backwards));
    const dateError = await captureServiceError(JSON.stringify(invalidDate));

    expect(backwardsError.code).toBe('invalid-provider-response');
    expect(backwardsError.message).toContain('ends before it starts');
    expect(dateError.code).toBe('invalid-provider-response');
    expect(dateError.message).toContain('invalid local date-time');
  });

  it('rejects impossible task dates and overflowing budget totals', async () => {
    const invalidTask = makeAiPlan({
      tasks: [
        {
          title: 'Impossible date',
          description: null,
          dueDate: '2030-02-30',
          priority: 'medium',
          milestone: false,
        },
      ],
    });
    const overflowingBudget = makeAiPlan({
      budgetCategories: [
        {
          name: 'First',
          plannedMinor: Number.MAX_SAFE_INTEGER,
          rationale: 'Large allocation.',
          priority: 'essential',
        },
        {
          name: 'Second',
          plannedMinor: Number.MAX_SAFE_INTEGER,
          rationale: 'Large allocation.',
          priority: 'optional',
        },
      ],
    });

    const taskError = await captureServiceError(JSON.stringify(invalidTask));
    const budgetError = await captureServiceError(
      JSON.stringify(overflowingBudget),
    );

    expect(taskError.code).toBe('invalid-provider-response');
    expect(taskError.message).toContain('invalid due date');
    expect(budgetError.code).toBe('invalid-provider-response');
    expect(budgetError.message).toContain('supported range');
  });

  it('rejects risk summaries that reference findings not supplied in the request', async () => {
    const plan = makeAiPlan({
      riskSummary: {
        overview: null,
        items: [{ findingId: 'invented-risk', summary: 'Invented risk.' }],
      },
    });
    const error = await captureServiceError(JSON.stringify(plan));

    expect(error.code).toBe('invalid-provider-response');
    expect(error.message).toContain('not supplied');
  });

  it('requires risk summarization when open findings were supplied', async () => {
    const request = makeAiRequest({
      mode: 'summarize-risks',
      event: makeAiEventContext({ openRisks: [makeOpenRisk('risk-1')] }),
    });
    const plan = makeAiPlan({ riskSummary: null });
    const error = await captureServiceError(JSON.stringify(plan), request);

    expect(error.code).toBe('invalid-provider-response');
    expect(error.message).toContain('did not summarize');
  });

  it('accepts a risk summary that references only supplied findings', async () => {
    const request = makeAiRequest({
      mode: 'summarize-risks',
      event: makeAiEventContext({ openRisks: [makeOpenRisk('risk-1')] }),
    });
    const plan = makeAiPlan({
      riskSummary: {
        overview: 'One open deterministic finding.',
        items: [{ findingId: 'risk-1', summary: 'Budget needs review.' }],
      },
    });
    const { provider } = makeProvider(JSON.stringify(plan));
    const service = createAiService({
      provider,
      timeoutMs: 20_000,
      maxOutputTokens: 1_800,
    });
    const result = await service.generatePlan(request);

    expect(result.riskSummary?.items).toEqual([
      { findingId: 'risk-1', summary: 'Budget needs review.' },
    ]);
  });

  it('rejects an invalid request before contacting the provider', async () => {
    const { provider, calls } = makeProvider(JSON.stringify(makeAiPlan()));
    const service = createAiService({
      provider,
      timeoutMs: 20_000,
      maxOutputTokens: 1_800,
    });
    const promise = service.generatePlan(makeAiRequest({ message: 'hi' }));

    await expect(promise).rejects.toMatchObject({
      name: 'AiServiceError',
      code: 'invalid-request',
    });
    expect(calls).toHaveLength(0);
  });

  it('propagates safe provider failures without wrapping them', async () => {
    const original = new ProviderError(
      'auth',
      'The AI provider rejected the server credentials.',
    );
    const provider: AiProvider = {
      name: 'Test Provider',
      model: 'test-model',
      async generate() {
        throw original;
      },
    };
    const service = createAiService({
      provider,
      timeoutMs: 20_000,
      maxOutputTokens: 1_800,
    });

    await expect(service.generatePlan(makeAiRequest())).rejects.toBe(original);
  });

  it('maps unexpected provider failures to a safe generic error', async () => {
    const provider: AiProvider = {
      name: 'Test Provider',
      model: 'test-model',
      async generate() {
        throw new Error('raw provider payload with provider-private-value');
      },
    };
    const service = createAiService({
      provider,
      timeoutMs: 20_000,
      maxOutputTokens: 1_800,
    });

    try {
      await service.generatePlan(makeAiRequest());
      throw new Error('Expected the service to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      const providerError = error as ProviderError;
      expect(providerError.code).toBe('provider-error');
      expect(providerError.message).not.toContain('provider-private-value');
      expect(providerError.message).not.toContain('raw provider payload');
    }
  });
});
