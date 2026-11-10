import { describe, expect, it } from 'vitest';

import { reconcile } from '@/domain/reconcile';
import { juan2026 } from '@/domain/testFixtures';

describe('reconcile (TC-RPT-08, BR-INV-01)', () => {
  it('passes for a consistent ledger and balances', () => {
    const { ledger, balances } = juan2026();
    expect(reconcile(ledger, balances)).toEqual({ ok: true, mismatches: [] });
  });
  it('detects a tampered total', () => {
    const { ledger, balances } = juan2026();
    const tampered = balances.map((b, i) =>
      i === 0 ? { ...b, totalCredits: 999, availableCredits: 999 - b.totalUsed } : b,
    );
    const result = reconcile(ledger, tampered);
    expect(result.ok).toBe(false);
    expect(result.mismatches.map((m) => m.kind)).toContain('TOTALS');
  });
  it('detects a derived-available mismatch', () => {
    const { ledger, balances } = juan2026();
    const first = balances[0];
    if (!first) throw new Error('fixture');
    const result = reconcile(ledger, [{ ...first, availableCredits: 99 }, ...balances.slice(1)]);
    expect(result.mismatches.map((m) => m.kind)).toContain('AVAILABLE');
  });
  it('detects ledger entries with no balance, and a balance with no entries', () => {
    const { ledger, balances } = juan2026();
    expect(reconcile(ledger, balances.slice(1)).mismatches.map((m) => m.kind)).toContain(
      'MISSING_BALANCE',
    );
    expect(reconcile([], balances).mismatches.map((m) => m.kind)).toContain('ORPHAN_BALANCE');
  });
  it('detects a negative figure', () => {
    const { ledger, balances } = juan2026();
    const first = balances[0];
    if (!first) throw new Error('fixture');
    const result = reconcile(ledger, [{ ...first, totalUsed: -1 }, ...balances.slice(1)]);
    expect(result.mismatches.map((m) => m.kind)).toContain('NEGATIVE');
  });
  it('detects a broken reversal link (INV-6)', () => {
    const { ledger, balances } = juan2026();
    const first = ledger[3];
    if (!first) throw new Error('fixture');
    const linkedToNothing = ledger.map((e) =>
      e.id === first.id ? { ...e, reversedByTransactionId: 'rev_missing' } : e,
    );
    expect(reconcile(linkedToNothing, balances).mismatches.map((m) => m.kind)).toContain('LINK');
  });
});
