import { formatDays } from '@/domain/days';
import { reconcile, type Mismatch } from '@/domain/reconcile';
import { sumTotals } from '@/domain/summary';
import type { Employee, LeaveBalance, LeaveTransaction, LeaveType, IsoDate } from '@/types/models';

/**
 * The report model (UI spec §14, FR-RPT-*): everything the Excel workbook and the on-screen preview
 * show, computed once by this pure function — so the preview, the workbook and the dashboard
 * cannot disagree (BR-RPT-01/02). No Firebase, no SheetJS, no React.
 */

export interface ReportFilters {
  readonly year: number;
  readonly employeeId: string | null;
  readonly leaveTypeId: string | null;
  readonly includeArchived: boolean;
}

export interface ReportInput {
  readonly filters: ReportFilters;
  /** Master data, joined by id: current names win, snapshots are only a fallback (D-10). */
  readonly employees: readonly Employee[];
  readonly leaveTypes: readonly LeaveType[];
  /** The year's balances and ledger as loaded (already limited to one employee when filtered). */
  readonly balances: readonly LeaveBalance[];
  readonly ledger: readonly LeaveTransaction[];
  readonly generatedAt: Date;
  readonly generatedBy: string;
}

export interface SummaryRow {
  readonly employeeNumber: string;
  readonly fullName: string;
  readonly position: string;
  readonly department: string;
  readonly employmentStatus: string;
  readonly leaveYear: number;
  readonly totalCredits: number;
  readonly totalUsed: number;
  readonly totalUnused: number;
  readonly recordStatus: 'Active' | 'Archived';
}

export interface BreakdownRow {
  readonly employeeNumber: string;
  readonly fullName: string;
  readonly leaveYear: number;
  readonly leaveType: string;
  readonly totalCredits: number;
  readonly totalUsed: number;
  readonly remaining: number;
}

export interface TransactionRow {
  readonly id: string;
  readonly employeeNumber: string;
  readonly employeeName: string;
  readonly position: string;
  readonly leaveType: string;
  readonly transactionType: string;
  readonly dateFrom: IsoDate | null;
  readonly dateTo: IsoDate | null;
  readonly days: number;
  readonly remarks: string;
  readonly recordedBy: string;
  readonly dateRecorded: Date | null;
  readonly leaveYear: number;
  /** Signed: `creditsDelta − usedDelta`. */
  readonly effect: number;
  readonly status: string;
}

export interface ReportInfo {
  readonly title: string;
  readonly year: number;
  readonly generatedAt: Date;
  readonly generatedBy: string;
  readonly employeeFilter: string;
  readonly leaveTypeFilter: string;
  readonly includeArchived: boolean;
  readonly employeeCount: number;
  readonly breakdownRowCount: number;
  readonly transactionRowCount: number;
  readonly totalCredits: number;
  readonly totalUsed: number;
  readonly totalUnused: number;
  readonly reconciliation: string;
  readonly notes: string;
}

export interface ReportModel {
  readonly filters: ReportFilters;
  readonly info: ReportInfo;
  readonly summary: readonly SummaryRow[];
  readonly breakdown: readonly BreakdownRow[];
  readonly transactions: readonly TransactionRow[];
  readonly totals: {
    readonly totalCredits: number;
    readonly totalUsed: number;
    readonly totalUnused: number;
  };
  readonly mismatches: readonly Mismatch[];
}

export const REPORT_NOTES =
  'Credits are year-specific; there is no carryover. Reversal entries are included; their effect is netted in balances.';

/** `EMP-2` before `EMP-10`: compares digit runs as numbers (natural order). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

function transactionTypeLabel(entry: LeaveTransaction): string {
  switch (entry.transactionType) {
    case 'ALLOCATION':
      return 'Credit Allocation';
    case 'USAGE':
      return 'Leave Usage';
    case 'REVERSAL':
      return entry.reversesType === 'ALLOCATION'
        ? 'Reversal (Credit Allocation)'
        : 'Reversal (Leave Usage)';
  }
}

function statusLabel(entry: LeaveTransaction): string {
  if (entry.reversedByTransactionId !== null) return 'Reversed';
  if (entry.reversesTransactionId !== null) return `Reversal of ${entry.reversesTransactionId}`;
  return '';
}

export function buildReport(input: ReportInput): ReportModel {
  const { filters, employees, leaveTypes, generatedAt, generatedBy } = input;
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const typeById = new Map(leaveTypes.map((t) => [t.id, t]));

  // Reconciliation always looks at what was loaded, before any display filter (BR-RPT-06).
  const reconciliation = reconcile(input.ledger, input.balances);

  const archivedIds = new Set(employees.filter((e) => e.isArchived).map((e) => e.id));
  const keepEmployee = (employeeId: string): boolean =>
    (filters.employeeId === null || filters.employeeId === employeeId) &&
    (filters.includeArchived || !archivedIds.has(employeeId));
  const keepType = (leaveTypeId: string): boolean =>
    filters.leaveTypeId === null || filters.leaveTypeId === leaveTypeId;

  const balances = input.balances.filter(
    (b) => b.year === filters.year && keepEmployee(b.employeeId) && keepType(b.leaveTypeId),
  );
  const ledger = input.ledger.filter(
    (e) => e.leaveYear === filters.year && keepEmployee(e.employeeId) && keepType(e.leaveTypeId),
  );

  const typeName = (id: string, snapshot?: string): string =>
    typeById.get(id)?.name ?? snapshot ?? id;

  // ── Leave Breakdown: one row per employee × leave type with a balance ──
  const breakdown: BreakdownRow[] = balances
    .map((b) => {
      const emp = employeeById.get(b.employeeId);
      const snapshot = input.ledger.find((e) => e.employeeId === b.employeeId);
      return {
        employeeNumber: emp?.employeeNumber ?? snapshot?.employeeNumberSnapshot ?? b.employeeId,
        fullName: emp?.fullName ?? snapshot?.employeeNameSnapshot ?? b.employeeId,
        leaveYear: b.year,
        leaveType: typeName(
          b.leaveTypeId,
          input.ledger.find((e) => e.leaveTypeId === b.leaveTypeId)?.leaveTypeNameSnapshot,
        ),
        totalCredits: b.totalCredits,
        totalUsed: b.totalUsed,
        remaining: b.totalCredits - b.totalUsed,
      };
    })
    .sort(
      (a, b) =>
        naturalCompare(a.employeeNumber, b.employeeNumber) ||
        a.leaveType.localeCompare(b.leaveType),
    );

  // ── Employee Summary ──
  const balancedIds = new Set(balances.map((b) => b.employeeId));
  const filtered = filters.employeeId !== null || filters.leaveTypeId !== null;
  const summaryEmployees = employees.filter((e) => {
    if (!keepEmployee(e.id)) return false;
    if (balancedIds.has(e.id)) return true;
    // Active employees without balances appear with zeros — unless a filter narrows the report.
    return !filtered && !e.isArchived;
  });
  const summary: SummaryRow[] = summaryEmployees
    .map((emp) => {
      const totals = sumTotals(balances.filter((b) => b.employeeId === emp.id));
      return {
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        position: emp.position,
        department: emp.department ?? '',
        employmentStatus: emp.employmentStatus,
        leaveYear: filters.year,
        totalCredits: totals.totalCredits,
        totalUsed: totals.totalUsed,
        totalUnused: totals.totalUnused,
        recordStatus: emp.isArchived ? ('Archived' as const) : ('Active' as const),
      };
    })
    .sort((a, b) => naturalCompare(a.employeeNumber, b.employeeNumber));

  // ── Transactions, oldest first (sorted in memory, R-06) ──
  const transactions: TransactionRow[] = ledger
    .map((e) => {
      const emp = employeeById.get(e.employeeId);
      return {
        id: e.id,
        employeeNumber: emp?.employeeNumber ?? e.employeeNumberSnapshot,
        employeeName: emp?.fullName ?? e.employeeNameSnapshot,
        position: emp?.position ?? e.positionSnapshot,
        leaveType: typeName(e.leaveTypeId, e.leaveTypeNameSnapshot),
        transactionType: transactionTypeLabel(e),
        dateFrom: e.dateFrom,
        dateTo: e.dateTo,
        days: e.days,
        remarks: e.remarks ?? '',
        recordedBy: e.createdByName,
        dateRecorded: e.createdAt,
        leaveYear: e.leaveYear,
        effect: e.creditsDelta - e.usedDelta,
        status: statusLabel(e),
      };
    })
    .sort((a, b) => {
      const at = a.dateRecorded?.getTime() ?? 0;
      const bt = b.dateRecorded?.getTime() ?? 0;
      return at - bt || a.id.localeCompare(b.id);
    });

  const totals = sumTotals(balances);
  const filterEmployeeName =
    filters.employeeId === null
      ? 'All employees'
      : (() => {
          const emp = employeeById.get(filters.employeeId);
          return emp ? `${emp.fullName} (${emp.employeeNumber})` : filters.employeeId;
        })();

  const mismatchCount = new Set(reconciliation.mismatches.map((m) => m.balanceId)).size;
  const reconciliationText = reconciliation.ok
    ? 'OK'
    : `${String(mismatchCount)} mismatched balance(s): ${reconciliation.mismatches
        .map((m) => `${m.balanceId} (${m.kind})`)
        .join('; ')}`;

  const info: ReportInfo = {
    title: filters.employeeId === null ? 'HR Leave Report' : 'Employee Leave Report',
    year: filters.year,
    generatedAt,
    generatedBy,
    employeeFilter: filterEmployeeName,
    leaveTypeFilter:
      filters.leaveTypeId === null ? 'All leave types' : typeName(filters.leaveTypeId),
    includeArchived: filters.includeArchived,
    employeeCount: summary.length,
    breakdownRowCount: breakdown.length,
    transactionRowCount: transactions.length,
    totalCredits: totals.totalCredits,
    totalUsed: totals.totalUsed,
    totalUnused: totals.totalUnused,
    reconciliation: reconciliationText,
    notes: REPORT_NOTES,
  };

  return {
    filters,
    info,
    summary,
    breakdown,
    transactions,
    totals,
    mismatches: reconciliation.mismatches,
  };
}

/** One-line description of the totals, used by the preview ("Credits 54 · Used 15 · Unused 39"). */
export function describeTotals(totals: ReportModel['totals']): string {
  return `Credits ${formatDays(totals.totalCredits)} · Used ${formatDays(totals.totalUsed)} · Unused ${formatDays(totals.totalUnused)}`;
}
