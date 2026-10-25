import {
  aiPlanRequestSchema,
  aiPlanSchema,
  formatSchemaIssues,
  type AiPlan,
  type AiPlanRequest,
} from '../src/features/ai/contracts.ts';
import { isValidIsoDate } from '../src/lib/date.ts';
import { isValidLocalDateTime } from '../src/lib/dateTime.ts';
import { buildSystemPrompt, buildUserPrompt } from './prompt.ts';
import { ProviderError, type AiProvider } from './provider.ts';

export type AiServiceErrorCode = 'invalid-request' | 'invalid-provider-response';

export class AiServiceError extends Error {
  readonly code: AiServiceErrorCode;

  constructor(code: AiServiceErrorCode, message: string) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
  }
}

export interface AiService {
  generatePlan(request: AiPlanRequest): Promise<AiPlan>;
}

export interface AiServiceOptions {
  readonly provider: AiProvider;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

function invalidResponse(message: string): never {
  throw new AiServiceError('invalid-provider-response', message);
}

/**
 * Extracts a JSON object from provider text. Models sometimes wrap JSON in a
 * markdown fence despite instructions; the surrounding fence is safe to remove.
 */
export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end <= start) {
    invalidResponse(
      'The AI response did not contain a complete JSON planning object.',
    );
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    invalidResponse('The AI response contained malformed JSON.');
  }
}

function validateConsistency(
  plan: AiPlan,
  request: AiPlanRequest,
): void {
  for (const item of plan.timeline) {
    if (!isValidLocalDateTime(item.startsAt) || !isValidLocalDateTime(item.endsAt)) {
      invalidResponse(
        'The AI response included a timeline item with an invalid local date-time.',
      );
    }

    if (item.endsAt <= item.startsAt) {
      invalidResponse(
        'The AI response included a timeline item that ends before it starts.',
      );
    }
  }

  for (const task of plan.tasks) {
    if (!isValidIsoDate(task.dueDate)) {
      invalidResponse(
        'The AI response included a task with an invalid due date.',
      );
    }
  }

  let budgetTotal = 0;

  for (const category of plan.budgetCategories) {
    budgetTotal += category.plannedMinor;

    if (!Number.isSafeInteger(budgetTotal)) {
      invalidResponse(
        'The AI response included budget amounts beyond the supported range.',
      );
    }
  }

  const openRiskIds = new Set(
    (request.event?.openRisks ?? []).map((finding) => finding.id),
  );
  const summaryItems = plan.riskSummary?.items ?? [];

  for (const item of summaryItems) {
    if (!openRiskIds.has(item.findingId)) {
      invalidResponse(
        'The AI response referenced a risk that was not supplied in the detected findings.',
      );
    }
  }

  if (
    request.mode === 'summarize-risks' &&
    openRiskIds.size > 0 &&
    summaryItems.length === 0
  ) {
    invalidResponse(
      'The AI response did not summarize any of the detected risk findings.',
    );
  }
}

/**
 * Validates provider output against the shared contract before it can reach
 * the browser. Feasibility and protected-plan checks still run client-side
 * against the latest saved workspace; this layer only guarantees a complete,
 * internally consistent structure and prevents invented risk references.
 */
export function createAiService(options: AiServiceOptions): AiService {
  return {
    async generatePlan(rawRequest: AiPlanRequest): Promise<AiPlan> {
      const requestResult = aiPlanRequestSchema.safeParse(rawRequest);

      if (!requestResult.success) {
        throw new AiServiceError(
          'invalid-request',
          formatSchemaIssues(requestResult.error),
        );
      }

      const request = requestResult.data;
      let content: string;

      try {
        const result = await options.provider.generate({
          system: buildSystemPrompt(),
          user: buildUserPrompt(request),
          timeoutMs: options.timeoutMs,
          maxOutputTokens: options.maxOutputTokens,
        });
        content = result.content;
      } catch (error) {
        if (error instanceof ProviderError) {
          throw error;
        }

        throw new ProviderError(
          'provider-error',
          'The AI provider request failed safely.',
        );
      }

      const parsed = aiPlanSchema.safeParse(extractJsonObject(content));

      if (!parsed.success) {
        invalidResponse(
          `The AI response did not match the required planning format. ${formatSchemaIssues(
            parsed.error,
          )}`,
        );
      }

      validateConsistency(parsed.data, request);
      return parsed.data;
    },
  };
}
