import { describe, expect, it } from 'vitest';
import { formatCount, formatCountLabel, formatDateTime } from './format';

describe('formatCount', () => {
  it('groups digits with Indian place values', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1_200)).toBe('1,200');
    expect(formatCount(1_234_567)).toBe('12,34,567');
  });
});

describe('formatCountLabel', () => {
  it('uses the singular noun for exactly one', () => {
    expect(formatCountLabel(1, 'guest')).toBe('1 guest');
  });

  it('uses the plural noun for zero and many', () => {
    expect(formatCountLabel(0, 'guest')).toBe('0 guests');
    expect(formatCountLabel(12_000, 'guest')).toBe('12,000 guests');
  });

  it('accepts an irregular plural', () => {
    expect(formatCountLabel(2, 'activity overlap needs', 'activity overlaps need')).toBe(
      '2 activity overlaps need',
    );
  });
});

describe('formatDateTime', () => {
  it('formats a valid ISO timestamp with its year', () => {
    const formatted = formatDateTime('2026-10-31T09:00:00.000Z');

    expect(formatted).not.toBe('Unknown time');
    expect(formatted).toContain('2026');
  });

  it('returns a safe placeholder for an invalid timestamp', () => {
    expect(formatDateTime('not-a-date')).toBe('Unknown time');
  });
});
