import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateRange,
  formatDays,
  formatTimestamp,
  getInitials,
} from '@/utils/format';
import { LEAVE_YEAR_UI_MIN, getYearOptions, parseYearParam } from '@/utils/years';

describe('formatDays (BR-CALC-05)', () => {
  it.each([
    [10, '10'],
    [0, '0'],
    [2.5, '2.5'],
    [0.5, '0.5'],
    [12, '12'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatDays(value)).toBe(expected);
  });
});

describe('formatDate / formatDateRange', () => {
  it('formats an ISO date without time-zone drift', () => {
    expect(formatDate('2026-02-10')).toBe('Feb 10, 2026');
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
  });

  it('returns invalid input unchanged', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatDate('2026-02-31')).toBe('2026-02-31');
  });

  it('shows a single day once, and ranges compactly', () => {
    expect(formatDateRange('2026-02-10', '2026-02-10')).toBe('Feb 10, 2026');
    expect(formatDateRange('2026-02-10', '2026-02-11')).toBe('Feb 10 – Feb 11, 2026');
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe('Dec 30, 2025 – Jan 2, 2026');
  });
});

describe('formatTimestamp', () => {
  it('formats a local date and time', () => {
    expect(formatTimestamp(new Date(2026, 1, 12, 14, 30))).toBe('Feb 12, 2026 2:30 PM');
  });
});

describe('getInitials', () => {
  it.each([
    ['Juan Dela Cruz', 'JC'],
    ['Maria', 'M'],
    ['  ana   reyes ', 'AR'],
    ['', '?'],
  ])('%j → %s', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });
});

describe('year helpers', () => {
  it('lists currentYear+1 down to the UI minimum', () => {
    expect(getYearOptions(2026)).toEqual([2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020]);
    expect(getYearOptions(2026, 2025)).toEqual([2027, 2026, 2025]);
    expect(LEAVE_YEAR_UI_MIN).toBe(2020);
  });

  it('validates ?year= and falls back to the current year', () => {
    expect(parseYearParam('2025', 2026)).toBe(2025);
    expect(parseYearParam('2027', 2026)).toBe(2027);
    expect(parseYearParam('2028', 2026)).toBe(2026);
    expect(parseYearParam('2019', 2026)).toBe(2026);
    expect(parseYearParam('abc', 2026)).toBe(2026);
    expect(parseYearParam('20255', 2026)).toBe(2026);
    expect(parseYearParam(null, 2026)).toBe(2026);
  });
});
