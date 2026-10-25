import { z } from 'zod';

/**
 * Shared contracts for the AI planning boundary. This module is imported by
 * both the browser app and the API server, so it must stay free of DOM
 * and Node APIs. Runtime validation here is not a substitute for the
 * deterministic feasibility checks in `planValidation.ts`.
 */

export const AI_PLAN_MODES = [
  'create-plan',
  'revise-plan',
  'answer-question',
  'summarize-risks',
] as const;

export const aiPlanModeSchema = z.enum(AI_PLAN_MODES);
export type AiPlanMode = z.infer<typeof aiPlanModeSchema>;

export const AI_ERROR_CODES = [
  'not-configured',
  'invalid-request',
  'request-too-large',
  'unsupported-media-type',
  'rate-limited',
  'timeout',
  'provider-auth',
  'provider-rate-limited',
  'provider-unavailable',
  'provider-error',
  'invalid-provider-response',
  'method-not-allowed',
  'not-found',
  'server-error',
] as const;

export const aiErrorCodeSchema = z.enum(AI_ERROR_CODES);
export type AiErrorCode = z.infer<typeof aiErrorCodeSchema>;

const eventCategorySchema = z.enum([
  'wedding',
  'birthday',
  'corporate',
  'anniversary',
  'festival',
  'other',
]);

const eventSettingSchema = z.enum(['indoor', 'outdoor', 'mixed']);
const planningStatusSchema = z.enum([
  'draft',
  'planning',
  'on-track',
  'at-risk',
  'completed',
]);
const prioritySchema = z.enum(['low', 'medium', 'high']);
const riskCategorySchema = z.enum([
  'financial',
  'scheduling',
  'guest-catering',
  'venue-contingency',
  'proposal-consistency',
]);
const riskSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
const riskCertaintySchema = z.enum([
  'confirmed',
  'potential',
  'missing-data',
  'assumption',
]);

const MAX_MONEY_MINOR = Number.MAX_SAFE_INTEGER;

function shortText(maxLength: number) {
  return z.string().trim().min(1).max(maxLength);
}

function optionalText(maxLength: number) {
  return z.string().trim().max(maxLength).nullable();
}

function minorUnits() {
  return z.number().int().min(0).max(MAX_MONEY_MINOR);
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD calendar date.');

const localDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    'Expected a local YYYY-MM-DDTHH:mm date-time.',
  );

const nonNegativeCountSchema = z
  .number()
  .int()
  .min(0)
  .max(100_000);

/* ------------------------------------------------------------------ */
/* Request context                                                     */
/* ------------------------------------------------------------------ */

export const aiBudgetCategoryContextSchema = z.object({
  id: shortText(80),
  name: shortText(80),
  plannedMinor: minorUnits(),
  actualMinor: minorUnits(),
  protection: z.enum(['protected', 'flexible']),
  minimumMinor: minorUnits().nullable(),
});
export type AiBudgetCategoryContext = z.infer<
  typeof aiBudgetCategoryContextSchema
>;

export const aiRiskFindingContextSchema = z.object({
  id: shortText(300),
  category: riskCategorySchema,
  severity: riskSeveritySchema,
  certainty: riskCertaintySchema,
  title: shortText(200),
  explanation: z.string().trim().max(2_000),
  recommendedAction: z.string().trim().max(2_000),
});
export type AiRiskFindingContext = z.infer<typeof aiRiskFindingContextSchema>;

export const aiEventContextSchema = z.object({
  id: shortText(80),
  name: shortText(120),
  category: eventCategorySchema,
  startsAt: isoDateSchema,
  venue: optionalText(160),
  setting: eventSettingSchema.nullable(),
  theme: optionalText(80),
  status: planningStatusSchema,
  expectedGuests: nonNegativeCountSchema,
  dietaryRequirementCount: nonNegativeCountSchema.default(0),
  accessibilityRequestCount: nonNegativeCountSchema.default(0),
  accessibilityRequired: z.boolean(),
  accessibilityAddressed: z.boolean(),
  contingencyPlanConfirmed: z.boolean(),
  budget: z.object({
    totalAvailableMinor: minorUnits(),
    plannedMinor: minorUnits(),
    remainingMinor: z.number().int().min(-MAX_MONEY_MINOR).max(MAX_MONEY_MINOR),
    overBudget: z.boolean(),
    reserveEnabled: z.boolean(),
    reserveTargetMinor: minorUnits(),
    reserveAllocatedMinor: minorUnits(),
    reserveShortfallMinor: minorUnits(),
    categories: z.array(aiBudgetCategoryContextSchema).max(30),
  }),
  guestCounts: z.object({
    invited: nonNegativeCountSchema,
    confirmed: nonNegativeCountSchema,
    pending: nonNegativeCountSchema,
    declined: nonNegativeCountSchema,
  }),
  catering: z
    .object({
      perPersonCostMinor: minorUnits(),
      bufferPercent: z.number().int().min(0).max(100),
      baseAttendees: nonNegativeCountSchema,
      estimatedAttendees: nonNegativeCountSchema,
      estimatedCostMinor: minorUnits(),
      attendeeSource: z.enum(['confirmed', 'expected']),
      plannedCateringMinor: minorUnits().nullable(),
    })
    .nullable(),
  tasks: z
    .array(
      z.object({
        title: shortText(160),
        dueDate: isoDateSchema,
        priority: prioritySchema,
        status: z.enum(['open', 'completed']),
      }),
    )
    .max(60),
  activities: z
    .array(
      z.object({
        title: shortText(160),
        startsAt: localDateTimeSchema,
        endsAt: localDateTimeSchema,
        priority: prioritySchema,
        status: z.enum(['scheduled', 'completed']),
      }),
    )
    .max(60),
  openRisks: z.array(aiRiskFindingContextSchema).max(20),
});
export type AiEventContext = z.infer<typeof aiEventContextSchema>;

export const aiPlanRequestSchema = z.object({
  mode: aiPlanModeSchema,
  message: z.string().trim().min(3).max(2_000),
  event: aiEventContextSchema.nullable(),
});
export type AiPlanRequest = z.infer<typeof aiPlanRequestSchema>;

/* ------------------------------------------------------------------ */
/* Structured AI proposal                                              */
/* ------------------------------------------------------------------ */

export const aiTimelineSuggestionSchema = z.object({
  title: shortText(160),
  startsAt: localDateTimeSchema,
  endsAt: localDateTimeSchema,
  priority: prioritySchema.default('medium'),
  location: optionalText(160).default(null),
  description: optionalText(500).default(null),
});
export type AiTimelineSuggestion = z.infer<
  typeof aiTimelineSuggestionSchema
>;

export const aiTaskSuggestionSchema = z.object({
  title: shortText(160),
  description: optionalText(1_000).default(null),
  dueDate: isoDateSchema,
  priority: prioritySchema.default('medium'),
  milestone: z.boolean().default(false),
});
export type AiTaskSuggestion = z.infer<typeof aiTaskSuggestionSchema>;

export const aiBudgetSuggestionSchema = z.object({
  name: shortText(80),
  plannedMinor: minorUnits(),
  rationale: shortText(500),
  priority: z.enum(['essential', 'important', 'optional']),
});
export type AiBudgetSuggestion = z.infer<typeof aiBudgetSuggestionSchema>;

export const aiGapSchema = z.object({
  title: shortText(160),
  detail: shortText(1_000),
  question: optionalText(300).default(null),
});
export type AiGap = z.infer<typeof aiGapSchema>;

export const aiAlternativeSchema = z.object({
  title: shortText(160),
  summary: shortText(1_000),
  tradeOff: shortText(1_000),
});
export type AiAlternative = z.infer<typeof aiAlternativeSchema>;

export const aiCateringSuggestionSchema = z.object({
  recommendedAttendeeCount: nonNegativeCountSchema,
  perPersonCostMinor: minorUnits().nullable(),
  bufferPercent: z.number().int().min(0).max(100),
  notes: z.array(shortText(400)).max(10).default([]),
});
export type AiCateringSuggestion = z.infer<
  typeof aiCateringSuggestionSchema
>;

export const aiRiskSummaryItemSchema = z.object({
  /** Must reference an open finding supplied in the request context. */
  findingId: shortText(300),
  summary: shortText(1_000),
});
export type AiRiskSummaryItem = z.infer<typeof aiRiskSummaryItemSchema>;

export const aiRiskSummarySchema = z.object({
  overview: optionalText(1_500).default(null),
  items: z.array(aiRiskSummaryItemSchema).max(20).default([]),
});
export type AiRiskSummary = z.infer<typeof aiRiskSummarySchema>;

export const aiPlanSchema = z.object({
  overview: shortText(4_000),
  assumptions: z.array(shortText(500)).max(20).default([]),
  timeline: z.array(aiTimelineSuggestionSchema).max(40).default([]),
  budgetCategories: z.array(aiBudgetSuggestionSchema).max(25).default([]),
  tasks: z.array(aiTaskSuggestionSchema).max(40).default([]),
  catering: aiCateringSuggestionSchema.nullable().default(null),
  gaps: z.array(aiGapSchema).max(20).default([]),
  alternatives: z.array(aiAlternativeSchema).max(10).default([]),
  tradeOffs: z.array(shortText(600)).max(10).default([]),
  riskSummary: aiRiskSummarySchema.nullable().default(null),
});
export type AiPlan = z.infer<typeof aiPlanSchema>;

export const AI_PLAN_SOURCES = ['provider', 'local-fallback'] as const;
export const aiPlanSourceSchema = z.enum(AI_PLAN_SOURCES);
export type AiPlanSource = z.infer<typeof aiPlanSourceSchema>;

export const aiPlanEnvelopeSchema = z.object({
  requestId: shortText(120),
  generatedAt: z.string().datetime({ offset: true }),
  source: aiPlanSourceSchema,
  provider: z.object({
    name: shortText(80),
    model: shortText(120),
  }),
  plan: aiPlanSchema,
});
export type AiPlanEnvelope = z.infer<typeof aiPlanEnvelopeSchema>;

/* ------------------------------------------------------------------ */
/* Status and errors                                                   */
/* ------------------------------------------------------------------ */

export const aiStatusSchema = z.object({
  configured: z.boolean(),
  providerName: z.string().trim().max(80).nullable(),
  model: z.string().trim().max(120).nullable(),
  message: shortText(600),
  limits: z
    .object({
      maxMessageCharacters: z.number().int().positive(),
      maxRequestBytes: z.number().int().positive(),
      timeoutMs: z.number().int().positive(),
      rateLimitPerMinute: z.number().int().positive(),
    })
    .nullable(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

export const aiApiErrorSchema = z.object({
  error: z.object({
    code: aiErrorCodeSchema,
    message: shortText(600),
    requestId: z.string().trim().max(120).nullable(),
    retryAfterSeconds: z.number().int().positive().nullable(),
  }),
});
export type AiApiErrorBody = z.infer<typeof aiApiErrorSchema>;

export function formatSchemaIssues(error: z.ZodError): string {
  const first = error.issues[0];

  if (!first) {
    return 'The data did not match the expected format.';
  }

  const path = first.path.length > 0 ? first.path.join('.') : 'value';
  return `The field “${path}” did not match the expected format.`;
}
