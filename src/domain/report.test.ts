import { describe, expect, it } from 'vitest';

import { buildReversalEntry } from '@/domain/ledger';
import {
  DEFAULT_REPORT_TITLE,
  MONTH_LABELS,
  buildReport,
  describeTotals,
  monthlyUsage,
  naturalCompare,
  reportHeading,
  type ReportFilters,
} from '@/domain/report';
import { reportFiltersSchema } from '@/domain/schemas/reportFilters';
import { ACTOR, juan2026, makeBalance, makeEmployee } from '@/domain/testFixtures';
import type { LeaveTransaction } from '@/types/models';

const GENERATED = new Date(2026, 7, 9, 14, 30);
const FILTERS: ReportFilters = {
  year: 2026,
  asOfMonth: 8,
  title: DEFAULT_REPORT_TITLE,
  employeeId: null,
  includeArchived: false,
};
const juan = makeEmployee();

function model(over: Partial<Parameters<typeof buildReport>[0]> = {}) {
  const { ledger, balances } = juan2026();
  return buildReport({
    filters: FILTERS,
    employees: [juan],
    balances,
    ledger,
    generatedAt: GENERATED,
    generatedBy: 'Maria Santos',
    ...over,
  });
}

describe('reportHeading', () => {
  it('reads "BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026"', () => {
    expect(reportHeading(FILTERS)).toBe('BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026');
  });
  it('upper-cases and trims a custom title, and falls back when it is blank', () => {
    expect(reportHeading({ ...FILTERS, title: ' acme plant leave ' })).toBe(
      'ACME PLANT LEAVE AS OF AUGUST 2026',
    );
    expect(reportHeading({ ...FILTERS, title: '  ', asOfMonth: 1 })).toBe(
      'LEAVE CREDITS AS OF JANUARY 2026',
    );
  });
});

describe('buildReport — the Juan-2026 reference data', () => {
  it('has one row: 10 credits, Feb 2 / Mar 1 / Apr 1 / May 1, used 5, remaining 5', () => {
    const report = model();
    expect(report.rows).toHaveLength(1);
    const row = report.rows[0];
    expect(row).toMatchObject({
      employeeId: 'emp1',
      name: 'JUAN DELA CRUZ',
      position: 'ACCOUNTING STAFF',
      location: 'FINANCE',
      totalCredits: 10,
      totalUsed: 5,
      remaining: 5,
      fullyUsed: false,
    });
    expect(row?.months).toEqual([0, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(report.totals).toEqual({ credits: 10, used: 5, remaining: 5 });
    expect(report.heading).toBe('BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026');
    expect(report.mismatches).toEqual([]);
  });

  it('months always add up to the total used', () => {
    const row = model().rows[0]!;
    expect(row.months.reduce((a, b) => a + b, 0)).toBe(row.totalUsed);
  });

  it('has 12 month labels', () => {
    expect(MONTH_LABELS).toHaveLength(12);
  });

  it('describes the totals for the preview', () => {
    expect(describeTotals(model().totals)).toBe('Total 10 · Used 5 · Remaining 5');
  });
});

describe('buildReport — rows', () => {
  it('marks an employee with all credits used as fullyUsed (the dark row)', () => {
    const { ledger } = juan2026();
    const report = model({ balances: [makeBalance({ totalCredits: 10, totalUsed: 10 })], ledger });
    expect(report.rows[0]).toMatchObject({ remaining: 0, fullyUsed: true });
  });

  it('an employee with no credits is not "fully used"', () => {
    const report = model({ balances: [], ledger: [] });
    expect(report.rows[0]).toMatchObject({
      totalCredits: 0,
      totalUsed: 0,
      remaining: 0,
      fullyUsed: false,
    });
    expect(report.rows[0]?.months.every((m) => m === 0)).toBe(true);
  });

  it('sorts A–Z by name, naturally', () => {
    const report = model({
      employees: [
        makeEmployee({ id: 'c', fullName: 'Zeta, Z' }),
        makeEmployee({ id: 'a', fullName: 'Agrida, Luriden' }),
        makeEmployee({ id: 'b', fullName: 'Person 10' }),
        makeEmployee({ id: 'd', fullName: 'Person 2' }),
      ],
      balances: [],
      ledger: [],
    });
    expect(report.rows.map((r) => r.name)).toEqual([
      'AGRIDA, LURIDEN',
      'PERSON 2',
      'PERSON 10',
      'ZETA, Z',
    ]);
  });

  it('uses an empty location when the employee has none', () => {
    const report = model({ employees: [makeEmployee({ department: null })] });
    expect(report.rows[0]?.location).toBe('');
  });

  it('filters to a single employee', () => {
    const report = model({
      filters: { ...FILTERS, employeeId: 'other' },
      employees: [juan, makeEmployee({ id: 'other', fullName: 'Other Person' })],
    });
    expect(report.rows.map((r) => r.employeeId)).toEqual(['other']);
  });

  it('ignores balances and entries of other years', () => {
    const { ledger, balances } = juan2026();
    const report = model({ filters: { ...FILTERS, year: 2027 }, ledger, balances });
    expect(report.rows[0]).toMatchObject({ totalCredits: 0, totalUsed: 0 });
  });
});

describe('buildReport — archived employees (BR-RPT-03)', () => {
  const archived = makeEmployee({ id: 'old', fullName: 'Old Timer', isArchived: true });
  const withData = makeBalance({
    id: 'old_2026',
    employeeId: 'old',
    totalCredits: 4,
    totalUsed: 1,
  });

  it('are left out by default', () => {
    expect(model({ employees: [juan, archived], balances: [withData] }).rows).toHaveLength(1);
  });
  it('appear when asked for AND they have data this year', () => {
    const filters = { ...FILTERS, includeArchived: true };
    expect(model({ filters, employees: [juan, archived], balances: [withData] }).rows).toHaveLength(
      2,
    );
    expect(model({ filters, employees: [juan, archived], balances: [] }).rows).toHaveLength(1);
  });
});

describe('monthlyUsage', () => {
  it('attributes a usage to the month it starts in', () => {
    const { ledger } = juan2026();
    const crossing: LeaveTransaction = {
      ...ledger[1]!,
      dateFrom: '2026-01-30',
      dateTo: '2026-02-02',
      days: 3,
    };
    expect(monthlyUsage([crossing])[0]).toBe(3);
    expect(monthlyUsage([crossing])[1]).toBe(0);
  });

  it('nets a reversed usage to zero', () => {
    const { ledger } = juan2026();
    const usage = ledger[1]!;
    const { entry } = buildReversalEntry({
      original: usage,
      balance: { totalCredits: 10, totalUsed: 5 },
      reason: 'Entered by mistake',
      actor: ACTOR,
    });
    const reversal: LeaveTransaction = { ...entry, id: `rev_${usage.id}`, createdAt: GENERATED };
    expect(monthlyUsage([usage, reversal])[1]).toBe(0);
  });

  it('does not count allocations or allocation reversals', () => {
    const { ledger } = juan2026();
    expect(monthlyUsage([ledger[0]!]).every((m) => m === 0)).toBe(true);
  });
});

describe('naturalCompare', () => {
  it('orders digit runs numerically and ignores case', () => {
    expect(['EMP-10', 'emp-2', 'EMP-1'].sort(naturalCompare)).toEqual(['EMP-1', 'emp-2', 'EMP-10']);
  });
});

describe('reportFiltersSchema', () => {
  const ok = { ...FILTERS };
  it('accepts valid filters', () => {
    expect(reportFiltersSchema.safeParse(ok).success).toBe(true);
  });
  it('rejects a bad month, year or over-long title', () => {
    expect(reportFiltersSchema.safeParse({ ...ok, asOfMonth: 13 }).success).toBe(false);
    expect(reportFiltersSchema.safeParse({ ...ok, asOfMonth: 0 }).success).toBe(false);
    expect(reportFiltersSchema.safeParse({ ...ok, year: 1999 }).success).toBe(false);
    expect(reportFiltersSchema.safeParse({ ...ok, title: 'x'.repeat(81) }).success).toBe(false);
  });
});
