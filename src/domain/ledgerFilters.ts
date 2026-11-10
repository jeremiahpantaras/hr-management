import { overlaps } from '@/domain/dates';
import type { LeaveTransaction } from '@/types/models';

/**
 * Client-side filters for ledger rows that are already loaded (DB §8.5): free-text search and the
 * leave-date range cannot be server queries, so they apply to the loaded rows only — the UI says
 * so and offers "Load all" (UI §6.9).
 */
export interface LoadedRowFilters {
  /** Matches remarks, employee name and Employee ID (case-insensitive substring). */
  readonly text?: string;
  /** `YYYY-MM-DD`; entries whose leave dates overlap [from, to] match. Entries without dates don't. */
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export function hasLoadedRowFilters(filters: LoadedRowFilters): boolean {
  return (
    (filters.text ?? '').trim() !== '' ||
    (filters.dateFrom ?? '') !== '' ||
    (filters.dateTo ?? '') !== ''
  );
}

export function filterLoadedRows(
  rows: readonly LeaveTransaction[],
  filters: LoadedRowFilters,
): LeaveTransaction[] {
  const text = (filters.text ?? '').trim().toLowerCase();
  const from = filters.dateFrom ?? '';
  const to = filters.dateTo ?? '';
  return rows.filter((row) => {
    if (text !== '') {
      const haystack = [row.remarks ?? '', row.employeeNameSnapshot, row.employeeNumberSnapshot]
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    if (from !== '' || to !== '') {
      if (row.dateFrom === null || row.dateTo === null) return false;
      const range = { from: from === '' ? '0000-01-01' : from, to: to === '' ? '9999-12-31' : to };
      if (!overlaps(range, { from: row.dateFrom, to: row.dateTo })) return false;
    }
    return true;
  });
}
