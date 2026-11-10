import { formatDays } from '@/domain/days';
import { reconcile, type Mismatch } from '@/domain/reconcile';
import type { Employee, LeaveBalance, LeaveTransaction } from '@/types/models';

/**
 * The leave credits report (the company's own spreadsheet layout): one row per employee with the
 * credits they started the year with, the days used in each month, the total used and what remains.
 * There are no leave types — every employee has one pool of credits per year. Pure: no Firebase,
 * no SheetJS, no React, so the preview and the workbook cannot disagree.
 */

export const MONTH_LABELS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;
export const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
] as const;

/** The default heading text before "AS OF {MONTH} {YEAR}" — editable on the Reports page. */
export const DEFAULT_REPORT_TITLE = 'BAGO PLANT LEAVE CREDITS';
export const REPORT_TITLE_MAX_LENGTH = 80;

export interface ReportFilters {
  readonly year: number;
  /** 1–12. Only used in the heading ("AS OF AUGUST 2026"); every recorded leave of the year is counted. */
  readonly asOfMonth: number;
  readonly title: string;
  readonly employeeId: string | null;
  readonly includeArchived: boolean;
}

export interface ReportInput {
  readonly filters: ReportFilters;
  readonly employees: readonly Employee[];
  /** The year's balances and ledger as loaded (already limited to one employee when filtered). */
  readonly balances: readonly LeaveBalance[];
  readonly ledger: readonly LeaveTransaction[];
  readonly generatedAt: Date;
  readonly generatedBy: string;
}

export interface ReportRow {
  readonly employeeId: string;
  /** Name, position and location are shown in capitals, as in the company's sheet. */
  readonly name: string;
  readonly position: string;
  readonly location: string;
  /** "TOTAL NO. OF UNUSED LEAVE CREDITS": the credits the employee has for the year. */
  readonly totalCredits: number;
  /** Days used in each month (index 0 = January); 0 when none. */
  readonly months: readonly number[];
  readonly totalUsed: number;
  readonly remaining: number;
  /** All credits used — the row is shaded dark in the sheet. */
  readonly fullyUsed: boolean;
}

export interface ReportModel {
  readonly filters: ReportFilters;
  /** e.g. `BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026`. */
  readonly heading: string;
  readonly rows: readonly ReportRow[];
  readonly totals: { readonly credits: number; readonly used: number; readonly remaining: number };
  readonly mismatches: readonly Mismatch[];
  readonly generatedAt: Date;
  readonly generatedBy: string;
}

/** `EMP-2` before `EMP-10`: compares digit runs as numbers (natural order). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

export function reportHeading(
  filters: Pick<ReportFilters, 'title' | 'asOfMonth' | 'year'>,
): string {
  const title = filters.title.trim().toUpperCase() || 'LEAVE CREDITS';
  const month = MONTH_NAMES[filters.asOfMonth - 1] ?? MONTH_NAMES[0];
  return `${title} AS OF ${month} ${String(filters.year)}`;
}

/**
 * Days used per month. A usage counts in the month it STARTS (its `dateFrom`); a reversal carries the
 * original's dates and subtracts, so a reversed usage nets to zero. Allocation reversals change the
 * credits, not the usage.
 */
export function monthlyUsage(entries: readonly LeaveTransaction[]): number[] {
  const months = new Array<number>(12).fill(0);
  for (const entry of entries) {
    if (entry.dateFrom === null) continue;
    const index = Number(entry.dateFrom.slice(5, 7)) - 1;
    if (index < 0 || index > 11) continue;
    if (entry.transactionType === 'USAGE') months[index] = (months[index] ?? 0) + entry.days;
    else if (entry.transactionType === 'REVERSAL' && entry.reversesType === 'USAGE') {
      months[index] = (months[index] ?? 0) - entry.days;
    }
  }
  return months;
}

export function buildReport(input: ReportInput): ReportModel {
  const { filters, employees, generatedAt, generatedBy } = input;

  // Reconciliation always looks at what was loaded, before any display filter.
  const reconciliation = reconcile(input.ledger, input.balances);

  const balanceByEmployee = new Map(
    input.balances.filter((b) => b.year === filters.year).map((b) => [b.employeeId, b]),
  );
  const entriesByEmployee = new Map<string, LeaveTransaction[]>();
  for (const entry of input.ledger) {
    if (entry.leaveYear !== filters.year) continue;
    entriesByEmployee.set(entry.employeeId, [
      ...(entriesByEmployee.get(entry.employeeId) ?? []),
      entry,
    ]);
  }

  const included = employees.filter((employee) => {
    if (filters.employeeId !== null && filters.employeeId !== employee.id) return false;
    if (!employee.isArchived) return true;
    // Archived employees appear only when asked for AND they have something in this year (BR-RPT-03).
    return (
      filters.includeArchived &&
      (balanceByEmployee.has(employee.id) || entriesByEmployee.has(employee.id))
    );
  });

  const rows: ReportRow[] = included
    .map((employee) => {
      const balance = balanceByEmployee.get(employee.id);
      const months = monthlyUsage(entriesByEmployee.get(employee.id) ?? []);
      const totalCredits = balance?.totalCredits ?? 0;
      const totalUsed = balance?.totalUsed ?? months.reduce((sum, value) => sum + value, 0);
      const remaining = totalCredits - totalUsed;
      return {
        employeeId: employee.id,
        name: employee.fullName.toUpperCase(),
        position: employee.position.toUpperCase(),
        location: (employee.department ?? '').toUpperCase(),
        totalCredits,
        months,
        totalUsed,
        remaining,
        fullyUsed: totalCredits > 0 && remaining <= 0,
      };
    })
    .sort((a, b) => naturalCompare(a.name, b.name) || a.employeeId.localeCompare(b.employeeId));

  const credits = rows.reduce((sum, row) => sum + row.totalCredits, 0);
  const used = rows.reduce((sum, row) => sum + row.totalUsed, 0);

  return {
    filters,
    heading: reportHeading(filters),
    rows,
    totals: { credits, used, remaining: credits - used },
    mismatches: reconciliation.mismatches,
    generatedAt,
    generatedBy,
  };
}

/** One-line description of the totals, used by the preview ("Credits 54 · Used 15 · Remaining 39"). */
export function describeTotals(totals: ReportModel['totals']): string {
  return `Credits ${formatDays(totals.credits)} · Used ${formatDays(totals.used)} · Remaining ${formatDays(totals.remaining)}`;
}
