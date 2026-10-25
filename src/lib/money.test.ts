import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyCompact, parseRupeesToMinor, rupees } from './money';

describe('formatMoney', () => {
  it('formats whole rupees without distracting decimals', () => {
    expect(formatMoney({ amountMinor: 125_000, currency: 'INR' })).toBe('₹1,250');
  });

  it('keeps paise visible when an amount is not a whole rupee', () => {
    expect(formatMoney({ amountMinor: 125_050, currency: 'INR' })).toBe('₹1,250.50');
    expect(formatMoney({ amountMinor: 12_505, currency: 'INR' })).toBe('₹125.05');
  });

  it('handles zero and negative amounts', () => {
    expect(formatMoney({ amountMinor: 0, currency: 'INR' })).toBe('₹0');
    expect(formatMoney({ amountMinor: -5_000, currency: 'INR' })).toBe('-₹50');
  });

  it('rejects fractional or unsafe minor-unit amounts', () => {
    expect(() => formatMoney({ amountMinor: 10.5, currency: 'INR' })).toThrow(RangeError);
    expect(() =>
      formatMoney({ amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: 'INR' }),
    ).toThrow(RangeError);
  });
});

describe('formatMoneyCompact', () => {
  it('uses Indian lakh and crore compaction for dashboard totals', () => {
    expect(formatMoneyCompact(rupees(8_370_000))).toBe('₹83.7L');
    expect(formatMoneyCompact(rupees(12_50_00_000))).toBe('₹12.5Cr');
  });

  it('rejects unsafe minor-unit amounts', () => {
    expect(() =>
      formatMoneyCompact({ amountMinor: Number.MAX_SAFE_INTEGER + 1, currency: 'INR' }),
    ).toThrow(RangeError);
  });
});

describe('parseRupeesToMinor', () => {
  it('parses whole rupees, decimals, and Indian digit grouping', () => {
    expect(parseRupeesToMinor('1250')).toBe(125_000);
    expect(parseRupeesToMinor('1,250')).toBe(125_000);
    expect(parseRupeesToMinor(' 12,50,000 ')).toBe(125_000_000);
    expect(parseRupeesToMinor('1250.5')).toBe(125_050);
    expect(parseRupeesToMinor('1250.05')).toBe(125_005);
    expect(parseRupeesToMinor('0')).toBe(0);
  });

  it('rejects ambiguous, negative, or over-precise input', () => {
    expect(parseRupeesToMinor('')).toBeNull();
    expect(parseRupeesToMinor('   ')).toBeNull();
    expect(parseRupeesToMinor('.5')).toBeNull();
    expect(parseRupeesToMinor('-50')).toBeNull();
    expect(parseRupeesToMinor('12.345')).toBeNull();
    expect(parseRupeesToMinor('₹1,250')).toBeNull();
    expect(parseRupeesToMinor('1e6')).toBeNull();
  });

  it('rejects amounts that exceed safe integer arithmetic', () => {
    expect(parseRupeesToMinor('99999999999999999999')).toBeNull();
  });
});

describe('rupees', () => {
  it('converts whole rupees to integer paise', () => {
    expect(rupees(2_500)).toEqual({ amountMinor: 250_000, currency: 'INR' });
    expect(rupees(-100)).toEqual({ amountMinor: -10_000, currency: 'INR' });
  });

  it('rejects fractional rupee input', () => {
    expect(() => rupees(10.5)).toThrow(RangeError);
  });
});
