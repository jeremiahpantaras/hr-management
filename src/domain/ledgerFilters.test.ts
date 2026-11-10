import { describe, expect, it } from 'vitest';

import { filterLoadedRows, hasLoadedRowFilters } from '@/domain/ledgerFilters';
import { juan2026 } from '@/domain/testFixtures';
import type { LeaveTransaction } from '@/types/models';

const { ledger } = juan2026();
const withRemarks = ledger.map<LeaveTransaction>((entry, index) =>
  index === 1 ? { ...entry, remarks: 'Family trip to Cebu' } : entry,
);

describe('filterLoadedRows (TC-LU-17)', () => {
  it('returns everything when no filter is set', () => {
    expect(filterLoadedRows(withRemarks, {})).toHaveLength(5);
    expect(hasLoadedRowFilters({})).toBe(false);
    expect(hasLoadedRowFilters({ text: '  ' })).toBe(false);
  });
  it('searches remarks, employee name and Employee ID, ignoring case', () => {
    expect(filterLoadedRows(withRemarks, { text: 'cebu' })).toHaveLength(1);
    expect(filterLoadedRows(withRemarks, { text: 'JUAN' })).toHaveLength(5);
    expect(filterLoadedRows(withRemarks, { text: 'emp-0042' })).toHaveLength(5);
    expect(filterLoadedRows(withRemarks, { text: 'nobody' })).toHaveLength(0);
    expect(hasLoadedRowFilters({ text: 'x' })).toBe(true);
  });
  it('filters by leave-date overlap and drops entries without dates', () => {
    const feb = filterLoadedRows(withRemarks, { dateFrom: '2026-02-11', dateTo: '2026-02-28' });
    expect(feb).toHaveLength(1);
    expect(feb[0]?.dateFrom).toBe('2026-02-10');
    expect(
      filterLoadedRows(withRemarks, { dateFrom: '2026-01-01', dateTo: '2026-12-31' }),
    ).toHaveLength(4);
  });
  it('supports open-ended ranges', () => {
    expect(filterLoadedRows(withRemarks, { dateFrom: '2026-05-01' })).toHaveLength(1);
    expect(filterLoadedRows(withRemarks, { dateTo: '2026-03-31' })).toHaveLength(2);
  });
  it('combines text and dates', () => {
    expect(
      filterLoadedRows(withRemarks, { text: 'cebu', dateFrom: '2026-02-01', dateTo: '2026-02-28' }),
    ).toHaveLength(1);
    expect(filterLoadedRows(withRemarks, { text: 'cebu', dateFrom: '2026-04-01' })).toHaveLength(0);
    expect(filterLoadedRows(withRemarks, { text: 'cebu', dateTo: '2026-01-31' })).toHaveLength(0);
  });
});
