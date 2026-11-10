import { LOW_BALANCE_THRESHOLD } from '@/domain/constants';
import type { LeaveBalance } from '@/types/models';

/**
 * The single place totals are computed (BR-CALC-04) — the employee page, dashboard and Excel
 * report all call this, so their figures cannot diverge. There are no leave types: each employee
 * has one pool of credits per year.
 */

export interface Totals {
  readonly totalCredits: number;
  readonly totalUsed: number;
  readonly totalUnused: number;
}

export function sumTotals(
  balances: readonly Pick<LeaveBalance, 'totalCredits' | 'totalUsed'>[],
): Totals {
  let totalCredits = 0;
  let totalUsed = 0;
  for (const balance of balances) {
    totalCredits += balance.totalCredits;
    totalUsed += balance.totalUsed;
  }
  return { totalCredits, totalUsed, totalUnused: totalCredits - totalUsed };
}

export interface LowBalance {
  readonly balance: LeaveBalance;
  readonly status: 'low' | 'depleted';
}

/**
 * Employees whose remaining credits are low (≤ threshold) or depleted (0). Balances with no credits
 * are skipped, and only the given employees count (the dashboard passes the ids of active
 * employees). Lowest remaining first.
 */
export function lowBalances(
  balances: readonly LeaveBalance[],
  eligibleEmployeeIds: ReadonlySet<string>,
  threshold: number = LOW_BALANCE_THRESHOLD,
): LowBalance[] {
  return balances
    .filter(
      (balance) =>
        eligibleEmployeeIds.has(balance.employeeId) &&
        balance.totalCredits > 0 &&
        balance.availableCredits <= threshold,
    )
    .map((balance) => ({
      balance,
      status: balance.availableCredits === 0 ? ('depleted' as const) : ('low' as const),
    }))
    .sort((a, b) => a.balance.availableCredits - b.balance.availableCredits);
}
