import { buildAllocationEntry, buildUsageEntry, makeBalanceId } from '@/domain/ledger';
import type { Actor, Employee, LeaveBalance, LeaveTransaction } from '@/types/models';

/** Test-only helpers (never imported by the app): the "Juan-2026" reference dataset. */
export const ACTOR: Actor = { uid: 'uHr', name: 'Maria Santos' };

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp1',
    employeeNumber: 'EMP-0042',
    employeeNumberKey: 'EMP-0042',
    fullName: 'Juan Dela Cruz',
    position: 'Accounting Staff',
    department: 'Finance',
    employmentStatus: 'Regular',
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdAt: null,
    createdBy: 'uHr',
    updatedAt: null,
    updatedBy: 'uHr',
    ...overrides,
  };
}

export function makeBalance(overrides: Partial<LeaveBalance> = {}): LeaveBalance {
  const totalCredits = overrides.totalCredits ?? 10;
  const totalUsed = overrides.totalUsed ?? 0;
  return {
    id: makeBalanceId('emp1', 2026),
    employeeId: 'emp1',
    year: 2026,
    totalCredits,
    totalUsed,
    availableCredits: totalCredits - totalUsed,
    lastTransactionId: 'T'.repeat(20),
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

/**
 * Replays the Juan-2026 dataset through the real builders: 10 credits; used 2 (Feb 10–11), 1 (Mar 15),
 * 1 (Apr 20), 1 (May 5) → 10 credits / 5 used / 5 remaining.
 */
export function juan2026(): { ledger: LeaveTransaction[]; balances: LeaveBalance[] } {
  const employee = makeEmployee();
  const ledger: LeaveTransaction[] = [];
  let totals: { totalCredits: number; totalUsed: number } | null = null;
  let counter = 0;

  const push = (built: ReturnType<typeof buildAllocationEntry>) => {
    counter += 1;
    const id = `Tx${String(counter).padStart(18, '0')}`;
    ledger.push({ ...built.entry, id, createdAt: new Date(2026, 0, counter) });
    totals = built.balance;
  };

  push(buildAllocationEntry({ employee, year: 2026, days: 10, balance: totals, actor: ACTOR }));
  for (const [days, from, to] of [
    [2, '2026-02-10', '2026-02-11'],
    [1, '2026-03-15', '2026-03-15'],
    [1, '2026-04-20', '2026-04-20'],
    [1, '2026-05-05', '2026-05-05'],
  ] as const) {
    push(
      buildUsageEntry({
        employee,
        year: 2026,
        days,
        dateFrom: from,
        dateTo: to,
        balance: totals,
        actor: ACTOR,
      }),
    );
  }

  const final = totals ?? { totalCredits: 0, totalUsed: 0 };
  return {
    ledger,
    balances: [makeBalance({ totalCredits: final.totalCredits, totalUsed: final.totalUsed })],
  };
}
