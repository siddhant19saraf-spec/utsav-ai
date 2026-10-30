import type { CurrencyCode, Money } from '@/types/domain';

// Every currency in CurrencyCode uses two minor-unit digits (for example, paise).
const MINOR_UNITS_PER_MAJOR = 100;
const currencyCodes: readonly CurrencyCode[] = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const compactFormatters = new Map<CurrencyCode, Intl.NumberFormat>();

function currencyFormatter(
  currency: CurrencyCode,
  hasMinorUnits: boolean,
): Intl.NumberFormat {
  const key = `${currency}:${hasMinorUnits ? 'minor' : 'major'}`;
  let formatter = currencyFormatters.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: hasMinorUnits ? 2 : 0,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }

  return formatter;
}

export function isValidMinorUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return currencyCodes.some((code) => code === value);
}

export function isValidMoney(value: unknown): value is Money {
  return (
    typeof value === 'object' &&
    value !== null &&
    'amountMinor' in value &&
    isValidMinorUnits(value.amountMinor) &&
    'currency' in value &&
    isCurrencyCode(value.currency)
  );
}

/** Converts integer minor units to an unsymbolised INR input value. */
export function formatMinorForInput(amountMinor: number): string {
  if (!isValidMinorUnits(amountMinor)) {
    throw new RangeError('Money amounts must be non-negative safe integers in minor units.');
  }

  const whole = Math.trunc(amountMinor / MINOR_UNITS_PER_MAJOR);
  const paise = amountMinor % MINOR_UNITS_PER_MAJOR;

  if (paise === 0) {
    return String(whole);
  }

  return `${whole}.${paise.toString().padStart(2, '0').replace(/0$/, '')}`;
}

export function formatMoney(money: Money): string {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new RangeError('Money amounts must be safe integers in minor units.');
  }

  const hasMinorUnits = money.amountMinor % MINOR_UNITS_PER_MAJOR !== 0;

  return currencyFormatter(money.currency, hasMinorUnits).format(
    money.amountMinor / MINOR_UNITS_PER_MAJOR,
  );
}

export function formatMoneyCompact(money: Money): string {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new RangeError('Money amounts must be safe integers in minor units.');
  }

  let formatter = compactFormatters.get(money.currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: money.currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    compactFormatters.set(money.currency, formatter);
  }

  return formatter.format(money.amountMinor / MINOR_UNITS_PER_MAJOR);
}

export function parseRupeesToMinor(value: string): number | null {
  const normalized = value.trim().replace(/[,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    return null;
  }

  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0') || '0');
  const amountMinor = whole * MINOR_UNITS_PER_MAJOR + fraction;

  return Number.isSafeInteger(amountMinor) ? amountMinor : null;
}

export function rupees(amount: number): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError('Rupee inputs must be safe integers.');
  }

  return { amountMinor: amount * MINOR_UNITS_PER_MAJOR, currency: 'INR' };
}
