import type { TransactionType } from '@/domain/constants';
import { filterLoadedRows, type LoadedRowFilters } from '@/domain/ledgerFilters';
import type { LeaveTransaction } from '@/types/models';

/**
 * Which ledger entries a history export contains, and in what order. Pure: the same filters the
 * Leave History page applies (employee, entry type, search text, leave dates), but applied to the
 * WHOLE year, not just the rows that happen to be loaded on screen.
 */
export interface HistoryExportFilters extends LoadedRowFilters {
  readonly employeeId?: string;
  /** `''` or absent = every kind. */
  readonly transactionType?: TransactionType | '';
}

export function selectHistoryRows(
  entries: readonly LeaveTransaction[],
  filters: HistoryExportFilters,
): LeaveTransaction[] {
  const scoped = entries.filter(
    (entry) =>
      (!filters.employeeId || entry.employeeId === filters.employeeId) &&
      (!filters.transactionType || entry.transactionType === filters.transactionType),
  );
  return filterLoadedRows(scoped, filters).sort((a, b) => {
    const byTime = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });
}

/** `Reversed`, `Reversal of …ABC123`, or empty — the same wording as the Status column. */
export function statusText(
  entry: Pick<LeaveTransaction, 'reversedByTransactionId' | 'reversesTransactionId'>,
): string {
  if (entry.reversedByTransactionId !== null) return 'Reversed';
  if (entry.reversesTransactionId !== null)
    return `Reversal of …${entry.reversesTransactionId.slice(-6)}`;
  return '';
}
