import { formatDays } from '@/domain/days';
import type { LeaveTransaction } from '@/types/models';

/** Presentation helpers for ledger rows (UI spec §6.6, §6.11). Pure: no React, no Firebase. */

const MINUS = '−'; // U+2212, as in the UI spec ("−2 days")

const unit = (days: number, word: 'day' | 'credit'): string => `${word}${days === 1 ? '' : 's'}`;

export type TransactionKind = 'Allocation' | 'Usage' | 'Reversal';

export function transactionKind(entry: Pick<LeaveTransaction, 'transactionType'>): TransactionKind {
  switch (entry.transactionType) {
    case 'ALLOCATION':
      return 'Allocation';
    case 'USAGE':
      return 'Usage';
    case 'REVERSAL':
      return 'Reversal';
  }
}

/** The signed effect on the balance, e.g. `+10 credits`, `−2 days`, `+1 day (reversal)`. */
export function effectLabel(
  entry: Pick<LeaveTransaction, 'transactionType' | 'reversesType' | 'days'>,
): string {
  const days = formatDays(entry.days);
  switch (entry.transactionType) {
    case 'ALLOCATION':
      return `+${days} ${unit(entry.days, 'credit')}`;
    case 'USAGE':
      return `${MINUS}${days} ${unit(entry.days, 'day')}`;
    case 'REVERSAL':
      return entry.reversesType === 'ALLOCATION'
        ? `${MINUS}${days} ${unit(entry.days, 'credit')} (reversal)`
        : `+${days} ${unit(entry.days, 'day')} (reversal)`;
  }
}

/** Only an ALLOCATION or USAGE that has not been reversed can be reversed (BR-COR-03). */
export function isReversible(
  entry: Pick<LeaveTransaction, 'transactionType' | 'reversedByTransactionId'>,
): boolean {
  return entry.transactionType !== 'REVERSAL' && entry.reversedByTransactionId === null;
}

/** The change in available credits an entry's reversal would cause (for the dialog preview). */
export function reversalAvailableDelta(
  entry: Pick<LeaveTransaction, 'transactionType' | 'days'>,
): number {
  return entry.transactionType === 'USAGE' ? entry.days : -entry.days;
}
