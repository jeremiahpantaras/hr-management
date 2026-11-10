import { describe, expect, it } from 'vitest';

import { selectHistoryRows, statusText } from '@/domain/ledgerExport';
import { juan2026 } from '@/domain/testFixtures';
import type { LeaveTransaction } from '@/types/models';

const { ledger } = juan2026(); // 1 allocation + 4 usages, createdAt increasing

describe('selectHistoryRows', () => {
  it('returns every entry, newest first, when no filter is set', () => {
    const rows = selectHistoryRows(ledger, {});
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.id)).toEqual([...ledger].reverse().map((r) => r.id));
  });
  it('does not change the input order', () => {
    const copy = [...ledger];
    selectHistoryRows(ledger, {});
    expect(ledger).toEqual(copy);
  });
  it('filters by employee and by entry type', () => {
    expect(selectHistoryRows(ledger, { employeeId: 'nobody' })).toHaveLength(0);
    expect(selectHistoryRows(ledger, { employeeId: 'emp1' })).toHaveLength(5);
    expect(selectHistoryRows(ledger, { transactionType: 'ALLOCATION' })).toHaveLength(1);
    expect(selectHistoryRows(ledger, { transactionType: 'USAGE' })).toHaveLength(4);
    expect(selectHistoryRows(ledger, { transactionType: '' })).toHaveLength(5);
  });
  it('applies the search text and the leave-date range to the whole list', () => {
    const withRemarks = ledger.map<LeaveTransaction>((e, i) =>
      i === 1 ? { ...e, remarks: 'Family trip' } : e,
    );
    expect(selectHistoryRows(withRemarks, { text: 'family' })).toHaveLength(1);
    expect(
      selectHistoryRows(withRemarks, { dateFrom: '2026-04-01', dateTo: '2026-05-31' }),
    ).toHaveLength(2);
    expect(selectHistoryRows(withRemarks, { text: 'family', dateFrom: '2026-04-01' })).toHaveLength(
      0,
    );
  });
});

describe('statusText', () => {
  const base = { reversedByTransactionId: null, reversesTransactionId: null };
  it('is empty for a normal entry', () => {
    expect(statusText(base)).toBe('');
  });
  it('says Reversed, or which entry a reversal undoes', () => {
    expect(statusText({ ...base, reversedByTransactionId: 'rev_x' })).toBe('Reversed');
    expect(statusText({ ...base, reversesTransactionId: 'AAAAAAAAAAAAAAABCDEFGH' })).toBe(
      'Reversal of …BCDEFGH'.replace('BCDEFGH', 'CDEFGH'),
    );
  });
});
