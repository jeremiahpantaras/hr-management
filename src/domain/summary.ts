import { LOW_BALANCE_THRESHOLD } from '@/domain/constants';
import type { LeaveBalance, LeaveType } from '@/types/models';

/**
 * The single place totals are computed (BR-CALC-04) — the employee page, dashboard and Excel
 * export all call this, so their figures cannot diverge.
 */

export interface Totals {
  readonly totalCredits: number;
  readonly totalUsed: number;
  readonly totalUnused: number;
}

export interface BreakdownRow extends Totals {
  readonly leaveTypeId: string;
  readonly leaveTypeName: string;
  readonly isActive: boolean;
  /** False for an active type the employee has no balance for (shown as zeros). */
  readonly hasBalance: boolean;
}

export interface BalanceSummary {
  readonly totals: Totals;
  readonly rows: readonly BreakdownRow[];
}

type BalanceFigures = Pick<LeaveBalance, 'leaveTypeId' | 'totalCredits' | 'totalUsed'>;

export function sumTotals(balances: readonly Pick<LeaveBalance, 'totalCredits' | 'totalUsed'>[]) {
  let totalCredits = 0;
  let totalUsed = 0;
  for (const balance of balances) {
    totalCredits += balance.totalCredits;
    totalUsed += balance.totalUsed;
  }
  return { totalCredits, totalUsed, totalUnused: totalCredits - totalUsed } satisfies Totals;
}

/**
 * One employee-year (or any set of balances): totals plus a row per leave type. Rows cover every
 * ACTIVE type (zeros when there is no balance) and any inactive type that has a balance (BR-LT-02);
 * a balance whose type no longer exists in the list is still counted, labelled by id.
 */
export function summarizeBalances(
  balances: readonly BalanceFigures[],
  leaveTypes: readonly Pick<LeaveType, 'id' | 'name' | 'isActive'>[],
): BalanceSummary {
  const byType = new Map<string, { credits: number; used: number }>();
  for (const balance of balances) {
    const current = byType.get(balance.leaveTypeId) ?? { credits: 0, used: 0 };
    byType.set(balance.leaveTypeId, {
      credits: current.credits + balance.totalCredits,
      used: current.used + balance.totalUsed,
    });
  }

  const rows: BreakdownRow[] = [];
  const seen = new Set<string>();
  for (const type of leaveTypes) {
    const figures = byType.get(type.id);
    if (!type.isActive && figures === undefined) continue;
    seen.add(type.id);
    const credits = figures?.credits ?? 0;
    const used = figures?.used ?? 0;
    rows.push({
      leaveTypeId: type.id,
      leaveTypeName: type.name,
      isActive: type.isActive,
      hasBalance: figures !== undefined,
      totalCredits: credits,
      totalUsed: used,
      totalUnused: credits - used,
    });
  }
  for (const [leaveTypeId, figures] of byType) {
    if (seen.has(leaveTypeId)) continue;
    rows.push({
      leaveTypeId,
      leaveTypeName: leaveTypeId,
      isActive: false,
      hasBalance: true,
      totalCredits: figures.credits,
      totalUsed: figures.used,
      totalUnused: figures.credits - figures.used,
    });
  }
  rows.sort((a, b) => a.leaveTypeName.localeCompare(b.leaveTypeName));
  return { totals: sumTotals(balances), rows };
}

export interface LowBalance {
  readonly balance: LeaveBalance;
  readonly status: 'low' | 'depleted';
}

/**
 * Per employee × type balances that are low (available ≤ threshold) or depleted (0). Balances
 * with no credits are skipped, and only the given employees count (the dashboard passes the
 * ids of active employees). Lowest availability first.
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
