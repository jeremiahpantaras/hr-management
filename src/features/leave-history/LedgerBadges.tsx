import { StatusBadge } from '@/components/data/StatusBadge';
import { transactionKind } from '@/domain/ledgerDisplay';
import type { LeaveTransaction } from '@/types/models';

/** Allocation and Edit (pink) · Usage (neutral) · Reversal (warning) — text always present (UI §7). */
export function TransactionTypeBadge({ entry }: { readonly entry: LeaveTransaction }) {
  const kind = transactionKind(entry);
  if (kind === 'Allocation')
    return (
      <StatusBadge tone="pink" icon={false}>
        Allocation
      </StatusBadge>
    );
  if (kind === 'Reversal') return <StatusBadge tone="warning">Reversal</StatusBadge>;
  if (kind === 'Edit')
    return (
      <StatusBadge tone="pink" icon={false}>
        Edit
      </StatusBadge>
    );
  return <StatusBadge icon={false}>Usage</StatusBadge>;
}

/** The Status column: "Reversed" for an original that was reversed; "Reversal of …" for a reversal. */
export function LedgerStatus({ entry }: { readonly entry: LeaveTransaction }) {
  if (entry.reversedByTransactionId !== null)
    return <StatusBadge tone="warning">Reversed</StatusBadge>;
  if (entry.reversesTransactionId !== null) {
    return (
      <span className="text-caption text-fg-muted">
        Reversal of …{entry.reversesTransactionId.slice(-6)}
      </span>
    );
  }
  return null;
}
