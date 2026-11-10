import type { LeaveTransaction } from '@/types/models';

/**
 * Leave dates are `YYYY-MM-DD` strings (D-06). Everything here works on the calendar date in UTC
 * arithmetic, so the result never depends on the machine's time zone (TC-LU-12).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/** True when the string is a real calendar date (rejects Feb 31, and Feb 29 in a common year). */
export function isRealDate(value: unknown): value is string {
  if (!isIsoDate(value)) return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const MS_PER_DAY = 86_400_000;

function toUtcMs(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** `dateTo − dateFrom + 1` calendar days (BR-LU-05). Both must be real dates. */
export function inclusiveDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY) + 1;
}

/** True when the date lies in the calendar year (inclusive of Jan 1 and Dec 31). */
export function isInYear(iso: string, year: number): boolean {
  return isIsoDate(iso) && iso.startsWith(`${String(year)}-`);
}

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

/** Inclusive ranges overlap when each starts on or before the other ends. ISO strings sort. */
export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/**
 * Existing USAGE entries that overlap a candidate range (BR-LU-09). Reversed entries, reversal
 * entries and other employees' entries never count (TC-LU-16); the caller scopes year/employee.
 */
export function findOverlaps(
  candidate: DateRange,
  entries: readonly LeaveTransaction[],
  employeeId?: string,
): LeaveTransaction[] {
  return entries.filter(
    (entry) =>
      entry.transactionType === 'USAGE' &&
      entry.reversedByTransactionId === null &&
      (employeeId === undefined || entry.employeeId === employeeId) &&
      entry.dateFrom !== null &&
      entry.dateTo !== null &&
      overlaps(candidate, { from: entry.dateFrom, to: entry.dateTo }),
  );
}

/** Today's calendar date in the machine's local zone. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}
