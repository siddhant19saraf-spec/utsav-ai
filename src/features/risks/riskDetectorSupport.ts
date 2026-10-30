import { formatMoney } from '@/lib/money';
import type { CelebrationEvent } from '@/types/domain';
import type { RiskEntityRef, RiskEvidence } from '@/types/risk';
import type { RiskAnalysisError, RiskDetection } from './riskTypes';

const MS_PER_DAY = 86_400_000;

function inr(amountMinor: number) {
  return { amountMinor, currency: 'INR' as const };
}

export function formatInr(amountMinor: number): string {
  return formatMoney(inr(amountMinor));
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) {
    return part > 0 ? 100 : 0;
  }

  return Math.round((part / whole) * 100);
}

export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }

  return Math.round((to - from) / MS_PER_DAY);
}

export function formatLocalDateTime(value: string): string {
  return value.replace('T', ' · ');
}

export function evidence(label: string, value: string): RiskEvidence {
  return { label, value };
}

export function entity(type: RiskEntityRef['type'], id: string): RiskEntityRef {
  return { type, id };
}

export function detection(
  event: CelebrationEvent,
  ruleId: string,
  fields: Omit<
    RiskDetection,
    'id' | 'eventId' | 'ruleId'
  > & { readonly entityKey?: string },
): RiskDetection {
  const { entityKey, ...rest } = fields;

  return {
    id: `risk:${event.id}:${ruleId}${entityKey ? `:${entityKey}` : ''}`,
    eventId: event.id,
    ruleId,
    ...rest,
  };
}

export function analysisError(
  event: CelebrationEvent,
  ruleId: string,
  message: string,
): RiskAnalysisError {
  return { eventId: event.id, ruleId, message };
}

export function relatedIds(
  type: RiskEntityRef['type'],
  ids: readonly string[],
  limit = 6,
): RiskEntityRef[] {
  return ids.slice(0, limit).map((id) => entity(type, id));
}
