import { describe, expect, it } from 'vitest';

import {
  findOverlaps,
  inclusiveDays,
  isInYear,
  isIsoDate,
  isRealDate,
  overlaps,
  todayIso,
} from '@/domain/dates';
import { juan2026 } from '@/domain/testFixtures';
import type { LeaveTransaction } from '@/types/models';

describe('isRealDate (TC-LU-10, EC-04)', () => {
  it('accepts Feb 29 in a leap year only', () => {
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-02-31')).toBe(false);
  });
  it.each(['2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '26-01-01', '', 'tomorrow'])(
    'rejects %s',
    (value) => {
      expect(isRealDate(value)).toBe(false);
    },
  );
  it('accepts the first and last day of the year (EC-02)', () => {
    expect(isRealDate('2026-01-01')).toBe(true);
    expect(isRealDate('2026-12-31')).toBe(true);
  });
  it('isIsoDate checks shape only', () => {
    expect(isIsoDate('2026-02-31')).toBe(true);
    expect(isIsoDate(20260101)).toBe(false);
  });
});

describe('inclusiveDays (BR-LU-05)', () => {
  it('counts both ends', () => {
    expect(inclusiveDays('2026-02-10', '2026-02-10')).toBe(1);
    expect(inclusiveDays('2026-02-10', '2026-02-11')).toBe(2);
    expect(inclusiveDays('2026-12-30', '2027-01-02')).toBe(4);
  });
  it('is exact across a leap day and a year', () => {
    expect(inclusiveDays('2028-02-28', '2028-03-01')).toBe(3);
    expect(inclusiveDays('2026-01-01', '2026-12-31')).toBe(365);
    expect(inclusiveDays('2028-01-01', '2028-12-31')).toBe(366);
  });
});

describe('isInYear (BR-YR-04)', () => {
  it('requires the date to start with the year', () => {
    expect(isInYear('2026-12-31', 2026)).toBe(true);
    expect(isInYear('2025-12-31', 2026)).toBe(false);
    expect(isInYear('2027-01-01', 2026)).toBe(false);
  });
});

describe('overlaps', () => {
  const a = { from: '2026-02-10', to: '2026-02-12' };
  it('is inclusive at both ends', () => {
    expect(overlaps(a, { from: '2026-02-12', to: '2026-02-14' })).toBe(true);
    expect(overlaps(a, { from: '2026-02-08', to: '2026-02-10' })).toBe(true);
  });
  it('is false for adjacent but disjoint ranges', () => {
    expect(overlaps(a, { from: '2026-02-13', to: '2026-02-14' })).toBe(false);
    expect(overlaps(a, { from: '2026-02-01', to: '2026-02-09' })).toBe(false);
  });
});

describe('findOverlaps (TC-LU-16, BR-LU-09)', () => {
  const { ledger } = juan2026();
  const range = { from: '2026-02-11', to: '2026-02-12' };

  it('finds an overlapping usage', () => {
    expect(findOverlaps(range, ledger)).toHaveLength(1);
  });
  it('ignores allocations', () => {
    expect(findOverlaps({ from: '2026-01-01', to: '2026-12-31' }, ledger)).toHaveLength(4);
  });
  it('ignores reversed entries', () => {
    const reversed = ledger.map<LeaveTransaction>((entry) =>
      entry.dateFrom === '2026-02-10' ? { ...entry, reversedByTransactionId: 'rev_x' } : entry,
    );
    expect(findOverlaps(range, reversed)).toHaveLength(0);
  });
  it('ignores reversal entries (they carry the original dates)', () => {
    const usage = ledger.find((entry) => entry.dateFrom === '2026-02-10');
    if (!usage) throw new Error('fixture');
    const reversal: LeaveTransaction = { ...usage, id: 'rev_x', transactionType: 'REVERSAL' };
    expect(findOverlaps(range, [reversal])).toHaveLength(0);
  });
  it('scopes to one employee when asked', () => {
    expect(findOverlaps(range, ledger, 'someone-else')).toHaveLength(0);
    expect(findOverlaps(range, ledger, 'emp1')).toHaveLength(1);
  });
});

describe('todayIso', () => {
  it('uses the local calendar date with zero padding', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 10, 9, 0, 1))).toBe('2026-11-09');
  });
});
