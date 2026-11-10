import { buildAllocationEntry, buildUsageEntry, makeBalanceId } from '@/domain/ledger';
import type { Actor, Employee, LeaveBalance, LeaveTransaction, LeaveType } from '@/types/models';

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

export function makeType(id: string, name: string, isActive = true): LeaveType {
  return {
    id,
    name,
    description: null,
    isActive,
    createdAt: null,
    createdBy: 'uHr',
    updatedAt: null,
    updatedBy: 'uHr',
  };
}

export const VACATION = makeType('vac', 'Vacation Leave');
export const SICK = makeType('sick', 'Sick Leave');
export const EMERGENCY = makeType('emer', 'Emergency Leave');

export function makeBalance(overrides: Partial<LeaveBalance> = {}): LeaveBalance {
  const totalCredits = overrides.totalCredits ?? 10;
  const totalUsed = overrides.totalUsed ?? 0;
  return {
    id: makeBalanceId('emp1', 2026, 'vac'),
    employeeId: 'emp1',
    leaveTypeId: 'vac',
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
 * Replays the Juan-2026 dataset through the real builders and returns the resulting ledger and
 * balances: Vacation 10/3/7 · Sick 5/2/3 · Emergency 3/0/3 → totals 18/5/13.
 */
export function juan2026(): { ledger: LeaveTransaction[]; balances: LeaveBalance[] } {
  const employee = makeEmployee();
  const ledger: LeaveTransaction[] = [];
  const totals = new Map<string, { totalCredits: number; totalUsed: number }>();
  let counter = 0;

  const push = (type: typeof VACATION, built: ReturnType<typeof buildAllocationEntry>) => {
    counter += 1;
    const id = `Tx${String(counter).padStart(18, '0')}`;
    ledger.push({ ...built.entry, id, createdAt: new Date(2026, 0, counter) });
    totals.set(type.id, built.balance);
  };
  const allocate = (type: typeof VACATION, days: number) => {
    push(
      type,
      buildAllocationEntry({
        employee,
        leaveType: type,
        year: 2026,
        days,
        balance: totals.get(type.id) ?? null,
        actor: ACTOR,
      }),
    );
  };
  const spend = (type: typeof VACATION, days: number, from: string, to: string) => {
    push(
      type,
      buildUsageEntry({
        employee,
        leaveType: type,
        year: 2026,
        days,
        dateFrom: from,
        dateTo: to,
        balance: totals.get(type.id) ?? null,
        actor: ACTOR,
      }),
    );
  };

  allocate(VACATION, 10);
  allocate(SICK, 5);
  allocate(EMERGENCY, 3);
  spend(VACATION, 2, '2026-02-10', '2026-02-11');
  spend(VACATION, 1, '2026-04-20', '2026-04-20');
  spend(SICK, 1, '2026-03-15', '2026-03-15');
  spend(SICK, 1, '2026-05-05', '2026-05-05');

  const balances = [VACATION, SICK, EMERGENCY].map((type) => {
    const t = totals.get(type.id) ?? { totalCredits: 0, totalUsed: 0 };
    return makeBalance({
      id: makeBalanceId('emp1', 2026, type.id),
      leaveTypeId: type.id,
      totalCredits: t.totalCredits,
      totalUsed: t.totalUsed,
    });
  });
  return { ledger, balances };
}
