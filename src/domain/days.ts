import { DAY_STEP, MAX_DAYS_PER_ENTRY } from '@/domain/constants';

/**
 * Day amounts (D-07, BR-FR-*). Every valid amount is a multiple of 0.5, which is exact in binary
 * floating point, so sums and comparisons here use plain equality — never an epsilon.
 */

/** True for a finite multiple of `DAY_STEP`, greater than 0 and at most `MAX_DAYS_PER_ENTRY`. */
export function isValidDays(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_DAYS_PER_ENTRY &&
    Number.isInteger(value / DAY_STEP)
  );
}

/** True for a finite multiple of `DAY_STEP` of any sign (running totals, deltas). */
export function isDayMultiple(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value / DAY_STEP);
}

/** Exact sum of day amounts. Throws if either side is not a multiple of the step. */
export function addDays(a: number, b: number): number {
  if (!isDayMultiple(a) || !isDayMultiple(b)) {
    throw new RangeError('Day amounts must be multiples of 0.5.');
  }
  return a + b;
}

/** BR-CALC-05: `10`, `2.5` — never `2.50` or `2.0`. */
export function formatDays(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return Number.isInteger(value * 2) ? value.toFixed(1) : value.toString();
}
