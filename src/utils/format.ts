import { format, isValid, parse } from 'date-fns';

import { formatDays } from '@/domain/days';

// Display formatting only — no business logic. `formatDays` lives in the domain (BR-CALC-05).
export { formatDays };

/** Leave dates are stored as `YYYY-MM-DD` strings; parse without time-zone drift. */
function parseIsoDate(iso: string): Date | null {
  const parsed = parse(iso, 'yyyy-MM-dd', new Date(0));
  return isValid(parsed) ? parsed : null;
}

/** `2026-02-10` → `Feb 10, 2026`. Returns the input unchanged if it is not a valid date. */
export function formatDate(iso: string): string {
  const date = parseIsoDate(iso);
  return date ? format(date, 'MMM d, yyyy') : iso;
}

/** Single day → `Feb 10, 2026`; same year → `Feb 10 – Feb 11, 2026`; else both years. */
export function formatDateRange(fromIso: string, toIso: string): string {
  if (fromIso === toIso) return formatDate(fromIso);
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return `${fromIso} – ${toIso}`;
  return from.getFullYear() === to.getFullYear()
    ? `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}`
    : `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`;
}

/** `Feb 10, 2026 2:30 PM` in the browser's local time zone. */
export function formatTimestamp(date: Date): string {
  return format(date, 'MMM d, yyyy h:mm a');
}

/** `Juan Dela Cruz` → `JD` (first and last word). */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
