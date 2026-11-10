import { formatDays } from '@/domain/days';
import type { LeaveTransaction } from '@/types/models';

/** Presentation helpers for ledger rows (UI spec §6.6, §6.11). Pure: no React, no Firebase. */

const MINUS = '−'; // U+2212, as in the UI spec ("−2 days")

const unit = (days: number): string => `day${days === 1 ? '' : 's'}`;

export type TransactionKind = 'Allocation' | 'Usage' | 'Reversal' | 'Edit';

export function transactionKind(entry: Pick<LeaveTransaction, 'transactionType'>): TransactionKind {
  switch (entry.transactionType) {
    case 'ALLOCATION':
      return 'Allocation';
    case 'USAGE':
      return 'Usage';
    case 'REVERSAL':
      return 'Reversal';
    case 'ADJUSTMENT':
      return 'Edit';
  }
}

/** The signed effect on the balance, e.g. `+10 days`, `−2 days`, `+1 day (reversal)`. */
export function effectLabel(
  entry: Pick<LeaveTransaction, 'transactionType' | 'reversesType' | 'days'> &
    Partial<Pick<LeaveTransaction, 'creditsDelta'>>,
): string {
  const days = formatDays(entry.days);
  switch (entry.transactionType) {
    case 'ALLOCATION':
      return `+${days} ${unit(entry.days)}`;
    case 'USAGE':
      return `${MINUS}${days} ${unit(entry.days)}`;
    case 'ADJUSTMENT':
      // An edit may raise or lower the total, so the sign comes from the stored delta.
      return `${(entry.creditsDelta ?? entry.days) < 0 ? MINUS : '+'}${days} ${unit(entry.days)} (edit)`;
    case 'REVERSAL':
      return entry.reversesType === 'ALLOCATION'
        ? `${MINUS}${days} ${unit(entry.days)} (reversal)`
        : `+${days} ${unit(entry.days)} (reversal)`;
  }
}

/**
 * Only an ALLOCATION or USAGE that has not been reversed can be reversed (BR-COR-03). An edit is
 * not reversed — edit the days again instead.
 */
export function isReversible(
  entry: Pick<LeaveTransaction, 'transactionType' | 'reversedByTransactionId'>,
): boolean {
  return (
    (entry.transactionType === 'ALLOCATION' || entry.transactionType === 'USAGE') &&
    entry.reversedByTransactionId === null
  );
}

/** The change in remaining days an entry's reversal would cause (for the dialog preview). */
export function reversalAvailableDelta(
  entry: Pick<LeaveTransaction, 'transactionType' | 'days'>,
): number {
  return entry.transactionType === 'USAGE' ? entry.days : -entry.days;
}
