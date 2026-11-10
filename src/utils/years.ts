import { LEAVE_YEAR_UI_MIN } from '@/domain/constants';

export { LEAVE_YEAR_UI_MIN };

/** `currentYear + 1` down to `minYear`, newest first. */
export function getYearOptions(currentYear: number, minYear: number = LEAVE_YEAR_UI_MIN): number[] {
  const options: number[] = [];
  for (let year = currentYear + 1; year >= minYear; year -= 1) {
    options.push(year);
  }
  return options;
}

/** Validates a `?year=` value; anything missing, malformed or out of range falls back. */
export function parseYearParam(
  raw: string | null,
  currentYear: number,
  minYear: number = LEAVE_YEAR_UI_MIN,
): number {
  if (raw === null || !/^\d{4}$/.test(raw)) return currentYear;
  const year = Number(raw);
  return year >= minYear && year <= currentYear + 1 ? year : currentYear;
}
