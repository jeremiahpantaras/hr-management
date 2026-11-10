import { describe, expect, it } from 'vitest';

import { addDays, formatDays, isDayMultiple, isValidDays } from '@/domain/days';

describe('isValidDays (BR-LU-03, BR-CR-05, BR-FR-01)', () => {
  it.each([0.5, 1, 2.5, 10, 364.5, 365])('accepts %s', (value) => {
    expect(isValidDays(value)).toBe(true);
  });
  it.each([0, -1, -0.5, 0.3, 0.25, 1.3, 1.25, 0.05, 365.5, 366, NaN, Infinity])(
    'rejects %s',
    (value) => {
      expect(isValidDays(value)).toBe(false);
    },
  );
  it.each(['1', null, undefined, {}, true])('rejects the non-number %s', (value) => {
    expect(isValidDays(value)).toBe(false);
  });
});

describe('isDayMultiple', () => {
  it('allows signed and zero values that are multiples of 0.5', () => {
    expect(isDayMultiple(0)).toBe(true);
    expect(isDayMultiple(-2.5)).toBe(true);
    expect(isDayMultiple(0.1)).toBe(false);
  });
});

describe('addDays (BR-FR-02)', () => {
  it('sums halves exactly with plain equality', () => {
    let total = 0;
    for (let i = 0; i < 1000; i += 1) total = addDays(total, 0.5);
    expect(total).toBe(500);
  });
  it('throws on a non-step amount', () => {
    expect(() => addDays(1, 0.1)).toThrow(RangeError);
  });
});

describe('formatDays (BR-CALC-05)', () => {
  it('prints whole values without decimals and halves with one', () => {
    expect(formatDays(10)).toBe('10');
    expect(formatDays(2.5)).toBe('2.5');
    expect(formatDays(0)).toBe('0');
    expect(formatDays(-1.5)).toBe('-1.5');
  });
});
