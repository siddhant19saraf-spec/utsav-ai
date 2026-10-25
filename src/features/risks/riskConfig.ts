/**
 * Every numeric boundary used by risk detection lives here. Analysis accepts
 * overrides so thresholds can be tuned or tested without editing rule code.
 */
export interface RiskThresholds {
  /** Days before the event when preparation checks become active. */
  readonly nearEventDays: number;
  /** Days before the event that escalate near-event findings. */
  readonly criticalWindowDays: number;
  /** Whole days considered enough lead time for an important task. */
  readonly minimumPreparationDays: number;
  /** Percentage over budget that makes a planned overrun critical. */
  readonly criticalOverrunPercent: number;
  /** Reserve shortfall percentage at or above which the finding is high. */
  readonly reserveShortfallHighPercent: number;
  /** Pending RSVP percentage of the invited list that is material. */
  readonly pendingRsvpHighPercent: number;
  /** Absolute pending RSVP count that is always material. */
  readonly pendingRsvpMinimumCount: number;
  /** Confirmed-versus-expected deviation percentage that is material. */
  readonly attendanceDeviationPercent: number;
  /** Absolute attendance deviation that is always material. */
  readonly attendanceDeviationMinimumCount: number;
  /** Percentage over the catering plan that raises severity to high. */
  readonly cateringOverrunHighPercent: number;
  /** Guest count at or above which missing venue or guest data is material. */
  readonly largeEventGuestCount: number;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = Object.freeze({
  nearEventDays: 14,
  criticalWindowDays: 7,
  minimumPreparationDays: 3,
  criticalOverrunPercent: 10,
  reserveShortfallHighPercent: 50,
  pendingRsvpHighPercent: 25,
  pendingRsvpMinimumCount: 3,
  attendanceDeviationPercent: 10,
  attendanceDeviationMinimumCount: 2,
  cateringOverrunHighPercent: 10,
  largeEventGuestCount: 20,
});

const percentageKeys = new Set<keyof RiskThresholds>([
  'criticalOverrunPercent',
  'reserveShortfallHighPercent',
  'pendingRsvpHighPercent',
  'attendanceDeviationPercent',
  'cateringOverrunHighPercent',
]);

const countKeys = new Set<keyof RiskThresholds>([
  'pendingRsvpMinimumCount',
  'attendanceDeviationMinimumCount',
  'largeEventGuestCount',
]);

const dayKeys = new Set<keyof RiskThresholds>([
  'nearEventDays',
  'criticalWindowDays',
  'minimumPreparationDays',
]);

function isThresholdKey(value: string): value is keyof RiskThresholds {
  return Object.prototype.hasOwnProperty.call(DEFAULT_RISK_THRESHOLDS, value);
}

function validateValue(key: keyof RiskThresholds, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Risk threshold “${key}” must be a non-negative whole number.`);
  }

  if (percentageKeys.has(key) && value > 100) {
    throw new RangeError(`Risk threshold “${key}” must be a percentage from 0 to 100.`);
  }

  if (countKeys.has(key) && value < 1) {
    throw new RangeError(`Risk threshold “${key}” must be at least 1.`);
  }

  if (dayKeys.has(key) && key === 'minimumPreparationDays' && value > 365) {
    throw new RangeError(`Risk threshold “${key}” must be 365 days or fewer.`);
  }
}

/**
 * Merges overrides over the defaults and validates the combined result.
 * Unknown keys and non-numeric values are rejected rather than ignored.
 */
export function resolveRiskThresholds(
  overrides: Partial<RiskThresholds> | undefined = undefined,
): RiskThresholds {
  const resolved: Record<keyof RiskThresholds, number> = {
    ...DEFAULT_RISK_THRESHOLDS,
  };

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (!isThresholdKey(key)) {
        throw new RangeError(`Unknown risk threshold “${key}”.`);
      }

      if (typeof value !== 'number') {
        throw new RangeError(`Risk threshold “${key}” must be a number.`);
      }

      validateValue(key, value);
      resolved[key] = value;
    }
  }

  if (resolved.criticalWindowDays > resolved.nearEventDays) {
    throw new RangeError(
      'The critical window cannot be longer than the near-event window.',
    );
  }

  return Object.freeze(resolved);
}
