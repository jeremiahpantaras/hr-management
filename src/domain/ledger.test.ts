import { describe, expect, it } from 'vitest';

import { AppError } from '@/domain/errors';
import {
  availableDelta,
  buildAllocationEntry,
  buildReversalEntry,
  buildUsageEntry,
  entryEffect,
  isReversalId,
  makeBalanceId,
  makeReversalId,
} from '@/domain/ledger';
import { ACTOR, juan2026, makeEmployee } from '@/domain/testFixtures';

const employee = makeEmployee();
const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return undefined;
};

describe('ids', () => {
  it('builds deterministic balance and reversal ids', () => {
    expect(makeBalanceId('e1', 2026)).toBe('e1_2026');
    expect(makeReversalId('abc')).toBe('rev_abc');
    expect(isReversalId('rev_abc')).toBe(true);
    expect(isReversalId('abc')).toBe(false);
  });
});

describe('entryEffect — the sign matrix (DB §3.6)', () => {
  it('ALLOCATION adds credits', () => {
    expect(entryEffect('ALLOCATION', 2)).toEqual({ creditsDelta: 2, usedDelta: 0 });
  });
  it('USAGE adds used', () => {
    expect(entryEffect('USAGE', 2)).toEqual({ creditsDelta: 0, usedDelta: 2 });
  });
  it('REVERSAL inverts the original', () => {
    expect(entryEffect('REVERSAL', 2, 'ALLOCATION')).toEqual({ creditsDelta: -2, usedDelta: 0 });
    expect(entryEffect('REVERSAL', 2, 'USAGE')).toEqual({ creditsDelta: 0, usedDelta: -2 });
  });
  it('REVERSAL needs to know what it reverses', () => {
    expect(errorCode(() => entryEffect('REVERSAL', 2))).toBe('VALIDATION');
  });
  it('availableDelta = creditsDelta − usedDelta', () => {
    expect(availableDelta({ creditsDelta: 10, usedDelta: 0 })).toBe(10);
    expect(availableDelta({ creditsDelta: 0, usedDelta: 2 })).toBe(-2);
    expect(availableDelta({ creditsDelta: 0, usedDelta: -1 })).toBe(1);
  });
});

describe('buildAllocationEntry (BR-CR-*)', () => {
  const base = { employee, year: 2026, balance: null, actor: ACTOR };

  it('creates the first balance (TC-CR-01)', () => {
    const { entry, balance } = buildAllocationEntry({ ...base, days: 10 });
    expect(balance).toEqual({ totalCredits: 10, totalUsed: 0 });
    expect(entry).toMatchObject({
      transactionType: 'ALLOCATION',
      days: 10,
      creditsDelta: 10,
      usedDelta: 0,
      dateFrom: null,
      dateTo: null,
      reversesTransactionId: null,
      reversedByTransactionId: null,
      resultingTotalCredits: 10,
      resultingTotalUsed: 0,
      balanceId: 'emp1_2026',
      createdBy: 'uHr',
      createdByName: 'Maria Santos',
    });
  });
  it('snapshots the employee', () => {
    const { entry } = buildAllocationEntry({ ...base, days: 1 });
    expect(entry).toMatchObject({
      employeeNumberSnapshot: 'EMP-0042',
      employeeNameSnapshot: 'Juan Dela Cruz',
      positionSnapshot: 'Accounting Staff',
      departmentSnapshot: 'Finance',
    });
  });
  it('adds a second allocation on top of the first (TC-CR-02: 10 then 2 → 12)', () => {
    const { balance } = buildAllocationEntry({
      ...base,
      days: 2,
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    expect(balance.totalCredits).toBe(12);
  });
  it('allows a future year (TC-CR-08)', () => {
    expect(buildAllocationEntry({ ...base, year: 2027, days: 1 }).entry.balanceId).toBe(
      'emp1_2027',
    );
  });
  it.each([0, -1, 0.3, 1.25, 366])('rejects %s days (TC-CR-04)', (days) => {
    expect(errorCode(() => buildAllocationEntry({ ...base, days }))).toBe('VALIDATION');
  });
  it.each([0.5, 1, 2.5, 365])('accepts %s days (TC-CR-05)', (days) => {
    expect(buildAllocationEntry({ ...base, days }).entry.days).toBe(days);
  });
  it('rejects an archived employee (TC-CR-06)', () => {
    expect(
      errorCode(() =>
        buildAllocationEntry({ ...base, days: 1, employee: makeEmployee({ isArchived: true }) }),
      ),
    ).toBe('EMPLOYEE_ARCHIVED');
  });
  it('rejects a year outside 2000–2100 and a non-integer year', () => {
    expect(errorCode(() => buildAllocationEntry({ ...base, days: 1, year: 1999 }))).toBe(
      'VALIDATION',
    );
    expect(errorCode(() => buildAllocationEntry({ ...base, days: 1, year: 2101 }))).toBe(
      'VALIDATION',
    );
    expect(errorCode(() => buildAllocationEntry({ ...base, days: 1, year: 2026.5 }))).toBe(
      'VALIDATION',
    );
  });
  it('stores blank remarks as null, trims others, and rejects 501 characters (TC-CR-12)', () => {
    expect(buildAllocationEntry({ ...base, days: 1, remarks: '   ' }).entry.remarks).toBeNull();
    expect(buildAllocationEntry({ ...base, days: 1, remarks: ' hi ' }).entry.remarks).toBe('hi');
    expect(
      errorCode(() => buildAllocationEntry({ ...base, days: 1, remarks: 'x'.repeat(501) })),
    ).toBe('VALIDATION');
    expect(
      buildAllocationEntry({ ...base, days: 1, remarks: 'x'.repeat(500) }).entry.remarks,
    ).toHaveLength(500);
  });
});

describe('buildUsageEntry (BR-LU-*, BR-INS-*)', () => {
  const balance = { totalCredits: 10, totalUsed: 3 };
  const base = {
    employee,
    year: 2026,
    days: 2,
    dateFrom: '2026-02-10',
    dateTo: '2026-02-11',
    balance,
    actor: ACTOR,
  };

  it('deducts from the balance (TC-LU-01)', () => {
    const { entry, balance: after } = buildUsageEntry(base);
    expect(after).toEqual({ totalCredits: 10, totalUsed: 5 });
    expect(entry).toMatchObject({
      transactionType: 'USAGE',
      creditsDelta: 0,
      usedDelta: 2,
      dateFrom: '2026-02-10',
      dateTo: '2026-02-11',
      resultingTotalCredits: 10,
      resultingTotalUsed: 5,
    });
  });
  it('succeeds when days equal available and leaves 0 (TC-LU-02)', () => {
    const { balance: after } = buildUsageEntry({
      ...base,
      days: 7,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-07',
    });
    expect(after.totalCredits - after.totalUsed).toBe(0);
  });
  it('rejects one more than available with both figures (TC-LU-03)', () => {
    try {
      buildUsageEntry({ ...base, days: 8, dateFrom: '2026-03-01', dateTo: '2026-03-08' });
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe('INSUFFICIENT_BALANCE');
      expect((error as AppError).details).toEqual({ available: 7, requested: 8 });
    }
  });
  it('with no balance, reports 0 available and does not create one (TC-LU-04)', () => {
    try {
      buildUsageEntry({ ...base, balance: null });
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe('INSUFFICIENT_BALANCE');
      expect((error as AppError).details).toEqual({ available: 0, requested: 2 });
    }
  });
  it('rejects dateTo before dateFrom (TC-LU-05)', () => {
    expect(
      errorCode(() => buildUsageEntry({ ...base, dateFrom: '2026-02-11', dateTo: '2026-02-10' })),
    ).toBe('VALIDATION');
  });
  it('rejects a range crossing the year boundary (TC-LU-06)', () => {
    expect(
      errorCode(() =>
        buildUsageEntry({ ...base, days: 2, dateFrom: '2026-12-30', dateTo: '2027-01-02' }),
      ),
    ).toBe('VALIDATION');
    expect(
      buildUsageEntry({ ...base, days: 2, dateFrom: '2026-12-30', dateTo: '2026-12-31' }).entry
        .dateTo,
    ).toBe('2026-12-31');
  });
  it('rejects dates outside the leave year (TC-LU-07)', () => {
    expect(
      errorCode(() => buildUsageEntry({ ...base, dateFrom: '2025-12-31', dateTo: '2026-01-01' })),
    ).toBe('VALIDATION');
  });
  it('rejects more days than the range holds; allows 0.5 on a single date (TC-LU-08)', () => {
    expect(errorCode(() => buildUsageEntry({ ...base, days: 3 }))).toBe('VALIDATION');
    expect(
      buildUsageEntry({ ...base, days: 0.5, dateFrom: '2026-02-10', dateTo: '2026-02-10' }).entry
        .days,
    ).toBe(0.5);
    expect(
      errorCode(() =>
        buildUsageEntry({ ...base, days: 1.5, dateFrom: '2026-02-10', dateTo: '2026-02-10' }),
      ),
    ).toBe('VALIDATION');
  });
  it.each([0, -1, 0.3, 366])('rejects %s days (TC-LU-09)', (days) => {
    expect(errorCode(() => buildUsageEntry({ ...base, days }))).toBe('VALIDATION');
  });
  it('validates real calendar dates (TC-LU-10)', () => {
    expect(
      buildUsageEntry({
        ...base,
        year: 2028,
        days: 1,
        dateFrom: '2028-02-29',
        dateTo: '2028-02-29',
      }).entry.dateFrom,
    ).toBe('2028-02-29');
    expect(
      errorCode(() =>
        buildUsageEntry({ ...base, days: 1, dateFrom: '2026-02-29', dateTo: '2026-02-29' }),
      ),
    ).toBe('VALIDATION');
    expect(
      errorCode(() =>
        buildUsageEntry({ ...base, days: 1, dateFrom: '2026-02-31', dateTo: '2026-02-31' }),
      ),
    ).toBe('VALIDATION');
  });
  it('accepts Jan 1 and Dec 31 (EC-02)', () => {
    expect(
      buildUsageEntry({ ...base, days: 1, dateFrom: '2026-01-01', dateTo: '2026-01-01' }).entry
        .dateFrom,
    ).toBe('2026-01-01');
    expect(
      buildUsageEntry({ ...base, days: 1, dateFrom: '2026-12-31', dateTo: '2026-12-31' }).entry
        .dateTo,
    ).toBe('2026-12-31');
  });
  it('rejects an archived employee (TC-LU-11)', () => {
    expect(
      errorCode(() => buildUsageEntry({ ...base, employee: makeEmployee({ isArchived: true }) })),
    ).toBe('EMPLOYEE_ARCHIVED');
  });
  it('stores the dates exactly as entered (BR-LU-11)', () => {
    const { entry } = buildUsageEntry(base);
    expect([entry.dateFrom, entry.dateTo]).toEqual(['2026-02-10', '2026-02-11']);
  });
});

describe('buildReversalEntry (BR-COR-*, TC-REV-*)', () => {
  const { ledger } = juan2026();
  const usage = ledger.find((e) => e.dateFrom === '2026-04-20')!;
  const allocation = ledger[0]!;

  it('mirrors every field of a usage with opposite deltas (TC-REV-01, TC-REV-11)', () => {
    const { entry, balance, reversalId } = buildReversalEntry({
      original: usage,
      balance: { totalCredits: 10, totalUsed: 3 },
      reason: 'Recorded under the wrong employee',
      actor: ACTOR,
    });
    expect(reversalId).toBe(`rev_${usage.id}`);
    expect(balance).toEqual({ totalCredits: 10, totalUsed: 2 });
    expect(entry).toMatchObject({
      transactionType: 'REVERSAL',
      days: usage.days,
      creditsDelta: 0,
      usedDelta: -usage.days,
      dateFrom: usage.dateFrom,
      dateTo: usage.dateTo,
      employeeId: usage.employeeId,
      employeeNumberSnapshot: usage.employeeNumberSnapshot,
      employeeNameSnapshot: usage.employeeNameSnapshot,
      positionSnapshot: usage.positionSnapshot,
      departmentSnapshot: usage.departmentSnapshot,
      leaveYear: usage.leaveYear,
      balanceId: usage.balanceId,
      reversesTransactionId: usage.id,
      reversesType: 'USAGE',
      reversedByTransactionId: null,
      remarks: 'Recorded under the wrong employee',
      resultingTotalCredits: 10,
      resultingTotalUsed: 2,
    });
  });
  it('reverses an unused allocation of 2 (TC-REV-02: 12/3 → 10/3)', () => {
    const { balance } = buildReversalEntry({
      original: { ...allocation, days: 2, creditsDelta: 2 },
      balance: { totalCredits: 12, totalUsed: 3 },
      reason: 'Entered twice',
      actor: ACTOR,
    });
    expect(balance).toEqual({ totalCredits: 10, totalUsed: 3 });
  });
  it('blocks reversing an allocation whose credits are partly used (TC-REV-03)', () => {
    try {
      buildReversalEntry({
        original: allocation,
        balance: { totalCredits: 10, totalUsed: 8 },
        reason: 'Wrong amount',
        actor: ACTOR,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe('CANNOT_REVERSE');
      expect((error as AppError).details).toEqual({ used: 8, days: 10 });
    }
  });
  it('allows reversing an allocation exactly when nothing is used (EC-20)', () => {
    const { balance } = buildReversalEntry({
      original: allocation,
      balance: { totalCredits: 10, totalUsed: 0 },
      reason: 'Wrong employee',
      actor: ACTOR,
    });
    expect(balance).toEqual({ totalCredits: 0, totalUsed: 0 });
  });
  it('cannot reverse a reversal (TC-REV-04)', () => {
    expect(
      errorCode(() =>
        buildReversalEntry({
          original: { ...usage, transactionType: 'REVERSAL' },
          balance: { totalCredits: 10, totalUsed: 3 },
          reason: 'Oops',
          actor: ACTOR,
        }),
      ),
    ).toBe('CANNOT_REVERSE');
  });
  it('cannot reverse an entry twice (BR-DUP-04)', () => {
    expect(
      errorCode(() =>
        buildReversalEntry({
          original: { ...usage, reversedByTransactionId: `rev_${usage.id}` },
          balance: { totalCredits: 10, totalUsed: 3 },
          reason: 'Again',
          actor: ACTOR,
        }),
      ),
    ).toBe('ALREADY_REVERSED');
  });
  it.each(['', '  ', 'ab', ' ab '])(
    'requires a reason of ≥ 3 characters: %j (TC-REV-05)',
    (reason) => {
      expect(
        errorCode(() =>
          buildReversalEntry({
            original: usage,
            balance: { totalCredits: 10, totalUsed: 3 },
            reason,
            actor: ACTOR,
          }),
        ),
      ).toBe('VALIDATION');
    },
  );
  it('is allowed for an archived employee — it takes no employee input (TC-REV-06)', () => {
    expect(
      buildReversalEntry({
        original: usage,
        balance: { totalCredits: 10, totalUsed: 3 },
        reason: 'Archived employee fix',
        actor: ACTOR,
      }).entry.transactionType,
    ).toBe('REVERSAL');
  });
  it('treats a missing balance as an inconsistency', () => {
    expect(
      errorCode(() =>
        buildReversalEntry({ original: usage, balance: null, reason: 'Reason', actor: ACTOR }),
      ),
    ).toBe('CANNOT_REVERSE');
  });
});

describe('the Juan-2026 dataset replayed through the builders', () => {
  it('produces ledger entries whose resulting totals follow the balance', () => {
    const { ledger } = juan2026();
    expect(ledger.map((e) => [e.resultingTotalCredits, e.resultingTotalUsed])).toEqual([
      [10, 0],
      [10, 2],
      [10, 3],
      [10, 4],
      [10, 5],
    ]);
  });
});
