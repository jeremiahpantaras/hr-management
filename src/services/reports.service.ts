import { getBalancesForEmployeeYear, getYearBalances } from '@/services/leaveBalances.service';
import { getLedgerYear } from '@/services/leaveLedger.service';
import type { LeaveBalance, LeaveTransaction } from '@/types/models';

/**
 * Year-wide reads for reports (DB design §8.8). Employee and leave-type filters are applied in
 * memory by `buildReport`; only an employee filter narrows the reads (a smaller query). The
 * ledger query has no `orderBy` (R-06) so it needs no composite index.
 */
export interface ReportSource {
  readonly balances: readonly LeaveBalance[];
  readonly ledger: readonly LeaveTransaction[];
}

export async function loadReportSource(
  year: number,
  employeeId: string | null,
): Promise<ReportSource> {
  const [balances, ledger] = await Promise.all([
    employeeId === null ? getYearBalances(year) : getBalancesForEmployeeYear(employeeId, year),
    getLedgerYear(year, employeeId ?? undefined),
  ]);
  return { balances, ledger };
}
