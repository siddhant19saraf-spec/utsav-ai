import { MAX_BUDGET_AMOUNT_MINOR } from '@/lib/limits';
import { isValidMoney } from '@/lib/money';
import type {
  ActivityPriority,
  ActivityStatus,
  EventCategory,
  EventSetting,
  Money,
  PlanningStatus,
  RsvpStatus,
  TaskPriority,
  TaskStatus,
} from '@/types/domain';
import type {
  RiskCategory,
  RiskCertainty,
  RiskEntityType,
  RiskFindingStatus,
  RiskReopenReason,
  RiskSeverity,
} from '@/types/risk';

export const eventCategories: readonly EventCategory[] = [
  'wedding',
  'birthday',
  'corporate',
  'anniversary',
  'festival',
  'other',
];
export const planningStatuses: readonly PlanningStatus[] = [
  'draft',
  'planning',
  'on-track',
  'at-risk',
  'completed',
];
export const eventSettings: readonly EventSetting[] = ['indoor', 'outdoor', 'mixed'];
export const taskPriorities: readonly TaskPriority[] = ['low', 'medium', 'high'];
export const taskStatuses: readonly TaskStatus[] = ['open', 'completed'];
export const activityPriorities: readonly ActivityPriority[] = ['low', 'medium', 'high'];
export const activityStatuses: readonly ActivityStatus[] = ['scheduled', 'completed'];
export const rsvpStatuses: readonly RsvpStatus[] = ['pending', 'confirmed', 'declined'];
export const origins = ['sample', 'user'] as const;
export const riskCategories: readonly RiskCategory[] = [
  'financial',
  'scheduling',
  'guest-catering',
  'venue-contingency',
  'proposal-consistency',
];
export const riskSeverities: readonly RiskSeverity[] = ['critical', 'high', 'medium', 'low'];
export const riskCertainties: readonly RiskCertainty[] = [
  'confirmed',
  'potential',
  'missing-data',
  'assumption',
];
export const riskFindingStatuses: readonly RiskFindingStatus[] = [
  'open',
  'resolved',
  'dismissed',
];
export const riskEntityTypes: readonly RiskEntityType[] = [
  'event',
  'budget',
  'budget-category',
  'task',
  'activity',
  'guest',
  'catering-estimate',
  'rescue-proposal',
];
export const riskReopenReasons: readonly RiskReopenReason[] = [
  'reappeared',
  'detection-changed',
  'dismissal-undone',
];
const MAX_BUFFER_PERCENT = 100;

export function fail(message: string): never {
  throw new Error(message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRecord(value: unknown, label: string): Record<string, unknown> {
  return isRecord(value) ? value : fail(`${label} must be an object.`);
}

export function parseString(
  value: unknown,
  label: string,
  options: { readonly allowEmpty?: boolean; readonly maxLength?: number } = {},
): string {
  if (typeof value !== 'string') {
    fail(`${label} must be text.`);
  }

  if (!options.allowEmpty && !value.trim()) {
    fail(`${label} cannot be empty.`);
  }

  if (typeof options.maxLength === 'number' && value.length > options.maxLength) {
    fail(`${label} is too long.`);
  }

  return value;
}

export function parseOptionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseString(value, label, { allowEmpty: true, maxLength });
}

export function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    fail(`${label} must be true or false.`);
  }

  return value;
}

export function parseOptionalBoolean(value: unknown, label: string): boolean | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseBoolean(value, label);
}

export function parseNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`);
  }

  return value;
}

export function parsePositiveInteger(value: unknown, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);

  if (parsed <= 0) {
    fail(`${label} must be greater than zero.`);
  }

  return parsed;
}

export function parseInr(value: unknown, label: string): Money {
  if (!isValidMoney(value) || value.currency !== 'INR') {
    fail(`${label} must be a non-negative integer INR amount.`);
  }

  return { amountMinor: value.amountMinor, currency: 'INR' };
}

export function parseBudgetInr(value: unknown, label: string): Money {
  const money = parseInr(value, label);

  if (money.amountMinor > MAX_BUDGET_AMOUNT_MINOR) {
    fail(`${label} must stay within the supported ₹100 crore limit.`);
  }

  return money;
}

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value === 'string') {
    for (const option of allowed) {
      if (option === value) {
        return option;
      }
    }
  }

  return fail(`${label} is not recognised.`);
}

export function parseOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseEnum(value, allowed, label);
}

export function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be a valid ISO date-time.`);
  }

  return value;
}

export function parseOptionalTimestamp(value: unknown, label: string): string | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parseTimestamp(value, label);
}

export function parseList<T>(
  value: unknown,
  label: string,
  maxLength: number,
  parseItem: (item: unknown, index: number) => T,
): readonly T[] {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }

  if (value.length > maxLength) {
    fail(`${label} has too many entries.`);
  }

  return value.map((item, index) => parseItem(item, index));
}

export function parseBufferPercent(value: unknown, label: string): number {
  const parsed = parseNonNegativeInteger(value, label);

  if (parsed > MAX_BUFFER_PERCENT) {
    fail(`${label} must be between 0 and ${MAX_BUFFER_PERCENT}.`);
  }

  return parsed;
}
