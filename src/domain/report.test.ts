import { describe, expect, it } from 'vitest';

import { buildReport, describeTotals, naturalCompare, type ReportFilters } from '@/domain/report';
import { reportFiltersSchema } from '@/domain/schemas/reportFilters';
import {
  ACTOR,
  EMERGENCY,
  SICK,
  VACATION,
  juan2026,
  makeBalance,
  makeEmployee,
} from '@/domain/testFixtures';
import { buildAllocationEntry, buildReversalEntry, makeBalanceId } from '@/domain/ledger';
import type { LeaveBalance, LeaveTransaction } from '@/types/models';

const GENERATED = new Date(2026, 10, 9, 14, 30);
const ALL: ReportFilters = {
  year: 2026,
  employeeId: null,
  leaveTypeId: null,
  includeArchived: true,
};

const juan = makeEmployee();
const types = [VACATION, SICK, EMERGENCY];

function model(over: Partial<Parameters<typeof buildReport>[0]> = {}) {
  const { ledger, balances } = juan2026();
  return buildReport({
    filters: ALL,
    employees: [juan],
    leaveTypes: types,
    balances,
    ledger,
    generatedAt: GENERATED,
    generatedBy: 'Maria Santos',
    ...over,
  });
}

describe('buildReport — the Juan-2026 reference data (TC-RPT-02, BR-RPT-02)', () => {
  it('Employee Summary shows 18 / 5 / 13 for Juan', () => {
    const report = model();
    expect(report.summary).toHaveLength(1);
    expect(report.summary[0]).toMatchObject({
      employeeNumber: 'EMP-0042',
      fullName: 'Juan Dela Cruz',
      position: 'Accounting Staff',
      department: 'Finance',
      employmentStatus: 'Regular',
      leaveYear: 2026,
      totalCredits: 18,
      totalUsed: 5,
      totalUnused: 13,
      recordStatus: 'Active',
    });
  });

  it('Leave Breakdown shows 10/3/7, 5/2/3, 3/0/3 sorted by leave type name', () => {
    const rows = model().breakdown.map((r) => [
      r.leaveType,
      r.totalCredits,
      r.totalUsed,
      r.remaining,
    ]);
    expect(rows).toEqual([
      ['Emergency Leave', 3, 0, 3],
      ['Sick Leave', 5, 2, 3],
      ['Vacation Leave', 10, 3, 7],
    ]);
  });

  it('summary totals = Σ breakdown rows = Σ ledger deltas', () => {
    const report = model();
    const sum = (key: 'totalCredits' | 'totalUsed') =>
      report.breakdown.reduce((total, row) => total + row[key], 0);
    expect(report.summary[0]?.totalCredits).toBe(sum('totalCredits'));
    expect(report.summary[0]?.totalUsed).toBe(sum('totalUsed'));
    const { ledger } = juan2026();
    expect(ledger.reduce((t, e) => t + e.creditsDelta, 0)).toBe(18);
    expect(ledger.reduce((t, e) => t + e.usedDelta, 0)).toBe(5);
    expect(report.totals).toEqual({ totalCredits: 18, totalUsed: 5, totalUnused: 13 });
    expect(describeTotals(report.totals)).toBe('Credits 18 · Used 5 · Unused 13');
  });

  it('Transactions: one row per ledger entry, oldest first, days positive, effect signed', () => {
    const report = model();
    expect(report.transactions).toHaveLength(7);
    const times = report.transactions.map((t) => t.dateRecorded?.getTime() ?? 0);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(report.transactions.every((t) => t.days > 0)).toBe(true);
    const usage = report.transactions.find((t) => t.dateFrom === '2026-02-10');
    expect(usage).toMatchObject({
      transactionType: 'Leave Usage',
      dateTo: '2026-02-11',
      days: 2,
      effect: -2,
      recordedBy: 'Maria Santos',
      leaveType: 'Vacation Leave',
      status: '',
    });
    expect(report.transactions[0]).toMatchObject({
      transactionType: 'Credit Allocation',
      effect: 10,
    });
  });

  it('Report Info states the filters, counts, totals, reconciliation and notes', () => {
    const { info } = model();
    expect(info).toMatchObject({
      title: 'HR Leave Report',
      year: 2026,
      generatedBy: 'Maria Santos',
      employeeFilter: 'All employees',
      leaveTypeFilter: 'All leave types',
      includeArchived: true,
      employeeCount: 1,
      breakdownRowCount: 3,
      transactionRowCount: 7,
      totalCredits: 18,
      totalUsed: 5,
      totalUnused: 13,
      reconciliation: 'OK',
    });
    expect(info.notes).toContain('no carryover');
    expect(info.generatedAt).toBe(GENERATED);
  });
});

describe('filters (TC-RPT-05, TC-RPT-07, BR-RPT-03)', () => {
  const ana = makeEmployee({ id: 'ana', employeeNumber: 'EMP-0043', fullName: 'Ana Reyes' });
  const mario = makeEmployee({
    id: 'mario',
    employeeNumber: 'EMP-0100',
    fullName: 'Mario Santos',
    isArchived: true,
  });
  const recluse = makeEmployee({
    id: 'rec',
    employeeNumber: 'EMP-0200',
    fullName: 'No Records',
    isArchived: true,
  });

  function withMore() {
    const base = juan2026();
    const anaEntry = buildAllocationEntry({
      employee: ana,
      leaveType: VACATION,
      year: 2026,
      days: 4,
      balance: null,
      actor: ACTOR,
    });
    const marioEntry = buildAllocationEntry({
      employee: { ...mario, isArchived: false },
      leaveType: SICK,
      year: 2026,
      days: 6,
      balance: null,
      actor: ACTOR,
    });
    const extras: LeaveTransaction[] = [
      { ...anaEntry.entry, id: 'Ta'.padEnd(20, '0'), createdAt: new Date(2026, 5, 1) },
      { ...marioEntry.entry, id: 'Tm'.padEnd(20, '0'), createdAt: new Date(2026, 5, 2) },
    ];
    const extraBalances: LeaveBalance[] = [
      makeBalance({
        id: makeBalanceId('ana', 2026, 'vac'),
        employeeId: 'ana',
        leaveTypeId: 'vac',
        totalCredits: 4,
        totalUsed: 0,
      }),
      makeBalance({
        id: makeBalanceId('mario', 2026, 'sick'),
        employeeId: 'mario',
        leaveTypeId: 'sick',
        totalCredits: 6,
        totalUsed: 0,
      }),
    ];
    return {
      employees: [juan, ana, mario, recluse],
      balances: [...base.balances, ...extraBalances],
      ledger: [...base.ledger, ...extras],
    };
  }

  it('an employee filter narrows summary, breakdown and transactions, and says so in Report Info', () => {
    const report = model({ ...withMore(), filters: { ...ALL, employeeId: 'ana' } });
    expect(report.summary.map((r) => r.fullName)).toEqual(['Ana Reyes']);
    expect(report.breakdown).toHaveLength(1);
    expect(report.transactions).toHaveLength(1);
    expect(report.totals).toEqual({ totalCredits: 4, totalUsed: 0, totalUnused: 4 });
    expect(report.info.employeeFilter).toBe('Ana Reyes (EMP-0043)');
    expect(report.info.title).toBe('Employee Leave Report');
  });

  it('a leave type filter narrows the figures so totals still equal the breakdown rows', () => {
    const report = model({ ...withMore(), filters: { ...ALL, leaveTypeId: 'vac' } });
    expect(report.breakdown.every((r) => r.leaveType === 'Vacation Leave')).toBe(true);
    expect(report.totals).toEqual({ totalCredits: 14, totalUsed: 3, totalUnused: 11 });
    expect(report.summary.map((r) => r.fullName)).toEqual(['Juan Dela Cruz', 'Ana Reyes']);
    expect(report.transactions.every((t) => t.leaveType === 'Vacation Leave')).toBe(true);
    expect(report.info.leaveTypeFilter).toBe('Vacation Leave');
  });

  it('TC-RPT-07: archived employees with records are included; without records they are not', () => {
    const report = model(withMore());
    const names = report.summary.map((r) => r.fullName);
    expect(names).toContain('Mario Santos');
    expect(names).not.toContain('No Records');
    expect(report.summary.find((r) => r.fullName === 'Mario Santos')?.recordStatus).toBe(
      'Archived',
    );
  });

  it('"include archived" off drops archived employees from every sheet and the totals', () => {
    const report = model({ ...withMore(), filters: { ...ALL, includeArchived: false } });
    expect(report.summary.map((r) => r.fullName)).not.toContain('Mario Santos');
    expect(report.transactions.some((t) => t.employeeName === 'Mario Santos')).toBe(false);
    expect(report.totals.totalCredits).toBe(22); // 18 + Ana's 4
  });

  it('active employees without balances appear with zeros — unless a filter is set', () => {
    const report = model({ ...withMore() });
    const noBalance = report.summary.find((r) => r.fullName === 'Ana Reyes');
    expect(noBalance).toMatchObject({ totalCredits: 4 });
    const lonely = makeEmployee({
      id: 'lonely',
      employeeNumber: 'EMP-0300',
      fullName: 'Lonely Active',
    });
    const withZero = model({ employees: [juan, lonely] });
    expect(withZero.summary.find((r) => r.fullName === 'Lonely Active')).toMatchObject({
      totalCredits: 0,
      totalUsed: 0,
      totalUnused: 0,
    });
    const filtered = model({ employees: [juan, lonely], filters: { ...ALL, leaveTypeId: 'vac' } });
    expect(filtered.summary.map((r) => r.fullName)).toEqual(['Juan Dela Cruz']);
  });

  it('another year yields an empty report', () => {
    const report = model({ filters: { ...ALL, year: 2025 } });
    expect(report.breakdown).toHaveLength(0);
    expect(report.transactions).toHaveLength(0);
    expect(report.totals).toEqual({ totalCredits: 0, totalUsed: 0, totalUnused: 0 });
  });
});

describe('reversals (TC-RPT-06, BR-RPT-04)', () => {
  it('lists the original and its reversal as two rows with Status / Reference filled', () => {
    const { ledger, balances } = juan2026();
    const usage = ledger.find((e) => e.dateFrom === '2026-04-20')!;
    const built = buildReversalEntry({
      original: usage,
      balance: { totalCredits: 10, totalUsed: 3 },
      reason: 'Wrong employee',
      actor: ACTOR,
    });
    const reversal: LeaveTransaction = {
      ...built.entry,
      id: built.reversalId,
      createdAt: new Date(2026, 6, 1),
    };
    const withReversal = ledger.map((e) =>
      e.id === usage.id ? { ...e, reversedByTransactionId: built.reversalId } : e,
    );
    const fixed = balances.map((b) =>
      b.leaveTypeId === 'vac' ? { ...b, totalUsed: 2, availableCredits: 8 } : b,
    );
    const report = model({ ledger: [...withReversal, reversal], balances: fixed });
    const rows = report.transactions.filter((t) => t.dateFrom === '2026-04-20');
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.transactionType === 'Leave Usage')?.status).toBe('Reversed');
    const reversalRow = rows.find((r) => r.transactionType === 'Reversal (Leave Usage)');
    expect(reversalRow?.status).toBe(`Reversal of ${usage.id}`);
    expect(reversalRow).toMatchObject({ days: 1, effect: 1, remarks: 'Wrong employee' });
    expect(report.info.reconciliation).toBe('OK');
    expect(report.totals).toEqual({ totalCredits: 18, totalUsed: 4, totalUnused: 14 });
  });

  it('labels reversals of allocations', () => {
    const { ledger, balances } = juan2026();
    const allocation = ledger[2]!; // emergency 3
    const built = buildReversalEntry({
      original: allocation,
      balance: { totalCredits: 3, totalUsed: 0 },
      reason: 'Entered twice',
      actor: ACTOR,
    });
    const report = model({
      ledger: [
        ...ledger,
        { ...built.entry, id: built.reversalId, createdAt: new Date(2026, 7, 1) },
      ],
      balances: balances.map((b) =>
        b.leaveTypeId === 'emer' ? { ...b, totalCredits: 0, availableCredits: 0 } : b,
      ),
    });
    expect(
      report.transactions.some(
        (t) => t.transactionType === 'Reversal (Credit Allocation)' && t.effect === -3,
      ),
    ).toBe(true);
  });
});

describe('reconciliation (TC-RPT-08, BR-RPT-06)', () => {
  it('lists a tampered balance in Report Info and in mismatches, without blocking the report', () => {
    const { ledger, balances } = juan2026();
    const tampered = balances.map((b, i) =>
      i === 0 ? { ...b, totalCredits: 999, availableCredits: 999 - b.totalUsed } : b,
    );
    const report = model({ ledger, balances: tampered });
    expect(report.mismatches.length).toBeGreaterThan(0);
    expect(report.info.reconciliation).toMatch(/^1 mismatched balance\(s\): .*\(TOTALS\)/);
    expect(report.summary).toHaveLength(1); // still produced
  });
});

describe('names and ordering (D-10, R-06)', () => {
  it('shows CURRENT master names joined by id; snapshots are only a fallback', () => {
    const renamed = makeEmployee({ fullName: 'Juan D. Cruz', position: 'Senior Accountant' });
    const report = model({
      employees: [renamed],
      leaveTypes: [{ ...VACATION, name: 'Annual Leave' }, SICK, EMERGENCY],
    });
    expect(report.summary[0]?.fullName).toBe('Juan D. Cruz');
    expect(report.breakdown.some((r) => r.leaveType === 'Annual Leave')).toBe(true);
    expect(report.transactions.every((t) => t.employeeName === 'Juan D. Cruz')).toBe(true);
    const orphan = model({ employees: [], leaveTypes: [] });
    expect(orphan.transactions[0]?.employeeName).toBe('Juan Dela Cruz'); // snapshot fallback
    expect(orphan.breakdown[0]?.leaveType).toMatch(/Leave$/);
  });

  it('sorts Employee IDs naturally', () => {
    expect(['EMP-10', 'EMP-2', 'EMP-1'].sort(naturalCompare)).toEqual(['EMP-1', 'EMP-2', 'EMP-10']);
    expect(naturalCompare('emp-1', 'EMP-1')).toBe(0);
  });
});

describe('reportFiltersSchema', () => {
  it('requires a valid integer year and keeps the rest optional', () => {
    expect(
      reportFiltersSchema.safeParse({
        year: 2026,
        employeeId: null,
        leaveTypeId: null,
        includeArchived: true,
      }).success,
    ).toBe(true);
    expect(
      reportFiltersSchema.safeParse({
        year: 1999,
        employeeId: null,
        leaveTypeId: null,
        includeArchived: true,
      }).success,
    ).toBe(false);
    expect(
      reportFiltersSchema.safeParse({
        year: 2026.5,
        employeeId: null,
        leaveTypeId: null,
        includeArchived: true,
      }).success,
    ).toBe(false);
    expect(
      reportFiltersSchema.safeParse({ employeeId: null, leaveTypeId: null, includeArchived: true })
        .success,
    ).toBe(false);
  });
});
