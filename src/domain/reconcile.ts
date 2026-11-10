import type { LeaveBalance, LeaveTransaction } from '@/types/models';

/**
 * Reconciliation (DB design §5.3): recompute each balance from the ledger and report any
 * difference. Used before an export and by tests. A mismatch can only appear if the Security
 * Rules were bypassed (for example a console edit).
 */

export type MismatchKind =
  | 'TOTALS' // stored totals differ from the ledger sums (INV-1)
  | 'AVAILABLE' // availableCredits != totalCredits − totalUsed (INV-2)
  | 'NEGATIVE' // a total or the available amount is negative (BR-INV-02)
  | 'MISSING_BALANCE' // ledger entries exist but no balance document
  | 'ORPHAN_BALANCE' // a balance with no ledger entries
  | 'LINK'; // reversal ⇔ original link is inconsistent (INV-6)

export interface Mismatch {
  readonly balanceId: string;
  readonly kind: MismatchKind;
  readonly detail: string;
}

export interface ReconcileResult {
  readonly ok: boolean;
  readonly mismatches: readonly Mismatch[];
}

export function reconcile(
  ledger: readonly LeaveTransaction[],
  balances: readonly LeaveBalance[],
): ReconcileResult {
  const mismatches: Mismatch[] = [];
  const sums = new Map<string, { credits: number; used: number }>();
  for (const entry of ledger) {
    const current = sums.get(entry.balanceId) ?? { credits: 0, used: 0 };
    sums.set(entry.balanceId, {
      credits: current.credits + entry.creditsDelta,
      used: current.used + entry.usedDelta,
    });
  }

  const balanceIds = new Set<string>();
  for (const balance of balances) {
    balanceIds.add(balance.id);
    const sum = sums.get(balance.id);
    if (sum === undefined) {
      mismatches.push({
        balanceId: balance.id,
        kind: 'ORPHAN_BALANCE',
        detail: 'No ledger entries for this balance.',
      });
    } else if (sum.credits !== balance.totalCredits || sum.used !== balance.totalUsed) {
      mismatches.push({
        balanceId: balance.id,
        kind: 'TOTALS',
        detail: `Ledger: ${String(sum.credits)} credits / ${String(sum.used)} used; balance: ${String(balance.totalCredits)} / ${String(balance.totalUsed)}.`,
      });
    }
    if (balance.availableCredits !== balance.totalCredits - balance.totalUsed) {
      mismatches.push({
        balanceId: balance.id,
        kind: 'AVAILABLE',
        detail: 'Available credits do not equal total credits minus used.',
      });
    }
    if (balance.totalCredits < 0 || balance.totalUsed < 0 || balance.availableCredits < 0) {
      mismatches.push({
        balanceId: balance.id,
        kind: 'NEGATIVE',
        detail: 'A balance figure is negative.',
      });
    }
  }
  for (const balanceId of sums.keys()) {
    if (!balanceIds.has(balanceId)) {
      mismatches.push({
        balanceId,
        kind: 'MISSING_BALANCE',
        detail: 'Ledger entries exist but the balance document is missing.',
      });
    }
  }

  // INV-6 — only meaningful when both sides of a pair were loaded.
  const byId = new Map(ledger.map((entry) => [entry.id, entry]));
  for (const entry of ledger) {
    if (entry.transactionType === 'REVERSAL' && entry.reversesTransactionId !== null) {
      const original = byId.get(entry.reversesTransactionId);
      if (original !== undefined && original.reversedByTransactionId !== entry.id) {
        mismatches.push({
          balanceId: entry.balanceId,
          kind: 'LINK',
          detail: `Reversal ${entry.id} is not linked from its original.`,
        });
      }
    } else if (entry.reversedByTransactionId !== null) {
      const reversal = byId.get(entry.reversedByTransactionId);
      if (reversal === undefined) {
        mismatches.push({
          balanceId: entry.balanceId,
          kind: 'LINK',
          detail: `Entry ${entry.id} points at a missing reversal.`,
        });
      }
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
