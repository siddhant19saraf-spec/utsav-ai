import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatEventDate,
  formatTaskDate,
  isOverdue,
  isValidIsoDate,
  toIsoDate,
} from './date';

describe('toIsoDate', () => {
  it('uses the local calendar date without timezone drift', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

describe('isValidIsoDate', () => {
  it('accepts real calendar dates including leap days', () => {
    expect(isValidIsoDate('2026-10-24')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  it('rejects impossible or malformed dates', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('24-10-2026')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('throws for invalid input rather than returning a wrong date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('date formatting', () => {
  it('formats event dates with weekday, day, month, and year in en-IN', () => {
    expect(formatEventDate('2026-12-01')).toBe('Tue, 1 Dec, 2026');
  });

  it('formats task dates in en-IN', () => {
    expect(formatTaskDate('2026-10-24')).toBe('24 Oct 2026');
  });
});

describe('isOverdue', () => {
  it('treats only dates before today as overdue', () => {
    expect(isOverdue('2026-10-23', '2026-10-24')).toBe(true);
    expect(isOverdue('2026-10-24', '2026-10-24')).toBe(false);
    expect(isOverdue('2026-10-25', '2026-10-24')).toBe(false);
  });
});
