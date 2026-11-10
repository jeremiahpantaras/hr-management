import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ErrorsModule from '@/domain/errors';
import { reconcile } from '@/domain/reconcile';
import { sumTotals, summarizeBalances } from '@/domain/summary';
import type * as FirebaseLibModule from '@/lib/firebase';
import type * as AuthServiceModule from '@/services/auth.service';
import { toLeaveBalance, toLeaveTransaction } from '@/services/firestore/converters';
import { mapFirebaseError } from '@/services/firestore/errors';
import type * as EmployeesServiceModule from '@/services/employees.service';
import type * as BalancesServiceModule from '@/services/leaveBalances.service';
import type * as LedgerServiceModule from '@/services/leaveLedger.service';
import type * as LeaveTypesServiceModule from '@/services/leaveTypes.service';
import type { Actor, LeaveBalance, LeaveTransaction } from '@/types/models';

import {
  PROJECT_ID,
  clearAuthUsers,
  createAuthUser,
  createRulesEnv,
  requireAuthEmulator,
  seedUserProfile,
} from '../setup/emulator';

/**
 * Ledger integration (TC-CR / TC-LU / TC-DUP / TC-REV / TC-CONC / TC-DASH-01 aggregates): the REAL
 * ledger and balance services — real transactions — against the Firestore + Auth emulators and the
 * repository's real `firestore.rules`. After every test the whole ledger is reconciled against
 * the balances (TC-CONC-04, BR-INV-01).
 */
const PASSWORD = 'Password123!';

let rulesEnv: RulesTestEnvironment;
let ledger: typeof LedgerServiceModule;
let balances: typeof BalancesServiceModule;
let employees: typeof EmployeesServiceModule;
let leaveTypes: typeof LeaveTypesServiceModule;
let auth: typeof AuthServiceModule;
let firebase: typeof FirebaseLibModule;
let errors: typeof ErrorsModule;
let actor: Actor;
let juanId: string;
let anaId: string;
let vacId: string;
let sickId: string;

beforeAll(async () => {
  requireAuthEmulator();
  rulesEnv = await createRulesEnv();
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:000000000000:web:demo');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.resetModules();
  [ledger, balances, employees, leaveTypes, auth, firebase, errors] = await Promise.all([
    import('@/services/leaveLedger.service'),
    import('@/services/leaveBalances.service'),
    import('@/services/employees.service'),
    import('@/services/leaveTypes.service'),
    import('@/services/auth.service'),
    import('@/lib/firebase'),
    import('@/domain/errors'),
  ]);
});

afterAll(async () => {
  await auth.signOutUser();
  await rulesEnv.cleanup();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await rulesEnv.clearFirestore();
  await clearAuthUsers();
  const uid = await createAuthUser('hr@example.test', PASSWORD);
  await seedUserProfile(rulesEnv, uid, { email: 'hr@example.test', fullName: 'Maria Santos' });
  await auth.signIn('hr@example.test', PASSWORD);
  actor = { uid, name: 'Maria Santos' };

  juanId = await employees.createEmployee(
    {
      employeeNumber: 'EMP-0042',
      fullName: 'Juan Dela Cruz',
      position: 'Accounting Staff',
      department: 'Finance',
      employmentStatus: 'Regular',
    },
    uid,
  );
  anaId = await employees.createEmployee(
    {
      employeeNumber: 'EMP-0043',
      fullName: 'Ana Reyes',
      position: 'HR Officer',
      department: null,
      employmentStatus: 'Probationary',
    },
    uid,
  );
  vacId = await leaveTypes.createLeaveType({ name: 'Vacation Leave', description: null }, uid);
  sickId = await leaveTypes.createLeaveType({ name: 'Sick Leave', description: null }, uid);
});

afterEach(async () => {
  // TC-CONC-04 / BR-INV-01: whatever the test did, ledger and balances must agree.
  const everything = await readEverything();
  const result = reconcile(everything.ledger, everything.balances);
  expect(result.mismatches).toEqual([]);
  await auth.signOutUser();
});

/** Reads straight from the database (rules bypassed), independent of the services under test. */
async function readEverything(): Promise<{ ledger: LeaveTransaction[]; balances: LeaveBalance[] }> {
  let result: { ledger: LeaveTransaction[]; balances: LeaveBalance[] } = {
    ledger: [],
    balances: [],
  };
  await rulesEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const [txns, bals] = await Promise.all([
      getDocs(collection(db, 'leaveTransactions')),
      getDocs(collection(db, 'leaveBalances')),
    ]);
    result = {
      ledger: txns.docs.flatMap((d) => {
        const entry = toLeaveTransaction(d.id, d.data());
        return entry ? [entry] : [];
      }),
      balances: bals.docs.flatMap((d) => {
        const balance = toLeaveBalance(d.id, d.data());
        return balance ? [balance] : [];
      }),
    };
  });
  return result;
}

let capture: Record<string, unknown> | null = null;
async function raw(path: string, id: string) {
  await rulesEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), path, id));
    capture = snapshot.exists() ? snapshot.data() : null;
  });
  return capture;
}
async function errorCodeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof errors.AppError ? error.code : `NOT_APP_ERROR:${String(error)}`;
  }
}

const alloc = (days: number, over: Partial<LedgerServiceModule.AllocationRequest> = {}) =>
  ledger.recordAllocation({
    transactionId: ledger.newTransactionId(),
    employeeId: juanId,
    leaveTypeId: vacId,
    year: 2026,
    days,
    remarks: null,
    actor,
    ...over,
  });
const spend = (
  days: number,
  from: string,
  to: string,
  over: Partial<LedgerServiceModule.UsageRequest> = {},
) =>
  ledger.recordUsage({
    transactionId: ledger.newTransactionId(),
    employeeId: juanId,
    leaveTypeId: vacId,
    year: 2026,
    days,
    dateFrom: from,
    dateTo: to,
    remarks: null,
    actor,
    ...over,
  });
const balanceId = (employee = juanId, year = 2026, type = vacId) =>
  `${employee}_${String(year)}_${type}`;

describe('TC-CR: allocation', () => {
  it('TC-CR-01: creates the ledger entry and a new balance atomically', async () => {
    const result = await alloc(10, { remarks: '2026 annual vacation credits' });
    expect(result).toMatchObject({
      status: 'created',
      balance: { totalCredits: 10, totalUsed: 0 },
    });
    const entry = await raw('leaveTransactions', result.transactionId);
    expect(entry).toMatchObject({
      transactionType: 'ALLOCATION',
      days: 10,
      creditsDelta: 10,
      usedDelta: 0,
      leaveYear: 2026,
      balanceId: balanceId(),
      remarks: '2026 annual vacation credits',
      createdBy: actor.uid,
      createdByName: 'Maria Santos',
      employeeNumberSnapshot: 'EMP-0042',
      employeeNameSnapshot: 'Juan Dela Cruz',
      positionSnapshot: 'Accounting Staff',
      departmentSnapshot: 'Finance',
      leaveTypeNameSnapshot: 'Vacation Leave',
      resultingTotalCredits: 10,
      resultingTotalUsed: 0,
      reversedByTransactionId: null,
    });
    expect(entry?.createdAt).toBeDefined(); // TC-LU-13: server time
    expect(await raw('leaveBalances', balanceId())).toMatchObject({
      totalCredits: 10,
      totalUsed: 0,
      availableCredits: 10,
      lastTransactionId: result.transactionId,
      year: 2026,
    });
  });

  it('TC-CR-02: allocating 2 more gives 12 with two entries and the first unchanged', async () => {
    const first = await alloc(10);
    const firstBefore = await raw('leaveTransactions', first.transactionId);
    const second = await alloc(2);
    expect(second.balance.totalCredits).toBe(12);
    expect(await raw('leaveBalances', balanceId())).toMatchObject({
      totalCredits: 12,
      availableCredits: 12,
      lastTransactionId: second.transactionId,
    });
    expect(await raw('leaveTransactions', first.transactionId)).toEqual(firstBefore);
    const all = await readEverything();
    expect(all.ledger).toHaveLength(2);
  });

  it('TC-CR-03 / TC-CR-14: another type or year is a separate balance and changes nothing else', async () => {
    await alloc(10);
    const sickBefore = await raw('leaveBalances', balanceId(juanId, 2026, sickId));
    expect(sickBefore).toBeNull();
    await alloc(5, { leaveTypeId: sickId });
    await alloc(3, { year: 2027 });
    await alloc(7, { employeeId: anaId });
    expect(await raw('leaveBalances', balanceId())).toMatchObject({ totalCredits: 10 });
    expect(await raw('leaveBalances', balanceId(juanId, 2026, sickId))).toMatchObject({
      totalCredits: 5,
    });
    expect(await raw('leaveBalances', balanceId(juanId, 2027, vacId))).toMatchObject({
      totalCredits: 3,
    });
    expect(await raw('leaveBalances', balanceId(anaId, 2026, vacId))).toMatchObject({
      totalCredits: 7,
    });
  });

  it('TC-CR-06: an archived employee cannot receive credits, and nothing is written', async () => {
    await employees.archiveEmployee(juanId, actor.uid);
    expect(await errorCodeOf(alloc(5))).toBe('EMPLOYEE_ARCHIVED');
    expect((await readEverything()).ledger).toHaveLength(0);
  });

  it('TC-CR-07: an inactive leave type cannot be allocated', async () => {
    await leaveTypes.setLeaveTypeActive(vacId, false, actor.uid);
    expect(await errorCodeOf(alloc(5))).toBe('LEAVE_TYPE_INACTIVE');
  });

  it('TC-CR-08: a future year is allowed (EC)', async () => {
    expect((await alloc(4, { year: 2027 })).balance.totalCredits).toBe(4);
  });

  it('rejects an unknown employee or leave type', async () => {
    expect(await errorCodeOf(alloc(1, { employeeId: 'ghost' }))).toBe('NOT_FOUND');
    expect(await errorCodeOf(alloc(1, { leaveTypeId: 'ghost' }))).toBe('NOT_FOUND');
  });

  it('TC-CR-12: remarks of 501 characters are rejected; 500 are accepted', async () => {
    expect(await errorCodeOf(alloc(1, { remarks: 'x'.repeat(501) }))).toBe('VALIDATION');
    expect((await alloc(1, { remarks: 'x'.repeat(500) })).status).toBe('created');
  });

  it('TC-CR-11: resultingTotal* on each entry equals the balance right after it', async () => {
    const a = await alloc(10);
    const u = await spend(3, '2026-02-10', '2026-02-12');
    const entryA = await raw('leaveTransactions', a.transactionId);
    const entryU = await raw('leaveTransactions', u.transactionId);
    expect([entryA?.resultingTotalCredits, entryA?.resultingTotalUsed]).toEqual([10, 0]);
    expect([entryU?.resultingTotalCredits, entryU?.resultingTotalUsed]).toEqual([10, 3]);
  });
});

describe('TC-LU: usage', () => {
  beforeEach(async () => {
    await alloc(10);
  });

  it('TC-LU-01: deducts and records the dates exactly as entered (TC-LU-13: server stamps)', async () => {
    const result = await spend(2, '2026-02-10', '2026-02-11', { remarks: 'Family trip' });
    expect(result.balance).toEqual({ totalCredits: 10, totalUsed: 2 });
    const entry = await raw('leaveTransactions', result.transactionId);
    expect(entry).toMatchObject({
      transactionType: 'USAGE',
      days: 2,
      creditsDelta: 0,
      usedDelta: 2,
      dateFrom: '2026-02-10',
      dateTo: '2026-02-11',
      remarks: 'Family trip',
      createdBy: actor.uid,
      createdByName: 'Maria Santos',
    });
    expect(await raw('leaveBalances', balanceId())).toMatchObject({
      totalUsed: 2,
      availableCredits: 8,
    });
  });

  it('TC-LU-12: the stored dates are the same strings whatever the machine time zone', async () => {
    const result = await spend(1, '2026-03-08', '2026-03-08');
    const entry = await raw('leaveTransactions', result.transactionId);
    expect([entry?.dateFrom, entry?.dateTo]).toEqual(['2026-03-08', '2026-03-08']);
    // Re-read through the converter: still strings, never Dates.
    const page = await ledger.listLedgerPage({ year: 2026, transactionType: 'USAGE' });
    expect(page.items[0]?.dateFrom).toBe('2026-03-08');
  });

  it('TC-LU-02: using exactly the available amount succeeds and leaves 0', async () => {
    const result = await spend(10, '2026-03-01', '2026-03-10');
    expect(result.balance).toEqual({ totalCredits: 10, totalUsed: 10 });
    expect(await raw('leaveBalances', balanceId())).toMatchObject({ availableCredits: 0 });
  });

  it('TC-LU-03: one more than available is INSUFFICIENT_BALANCE with both figures; nothing is written', async () => {
    await spend(9, '2026-03-01', '2026-03-09');
    const before = await readEverything();
    try {
      await spend(2, '2026-05-05', '2026-05-06');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(errors.AppError);
      expect((error as ErrorsModule.AppError).code).toBe('INSUFFICIENT_BALANCE');
      expect((error as ErrorsModule.AppError).details).toEqual({ available: 1, requested: 2 });
      expect(errors.appErrorMessage(error)).toBe('Not enough credits: 1 available, 2 requested.');
    }
    expect(await readEverything()).toEqual(before);
  });

  it('TC-LU-04: with no balance it is INSUFFICIENT_BALANCE and no balance is created', async () => {
    expect(await errorCodeOf(spend(1, '2026-02-10', '2026-02-10', { leaveTypeId: sickId }))).toBe(
      'INSUFFICIENT_BALANCE',
    );
    expect(await raw('leaveBalances', balanceId(juanId, 2026, sickId))).toBeNull();
    expect(await errorCodeOf(spend(1, '2026-02-10', '2026-02-10', { employeeId: anaId }))).toBe(
      'INSUFFICIENT_BALANCE',
    );
  });

  it('TC-LU-11: an archived employee or an inactive type is rejected', async () => {
    await leaveTypes.setLeaveTypeActive(vacId, false, actor.uid);
    expect(await errorCodeOf(spend(1, '2026-02-10', '2026-02-10'))).toBe('LEAVE_TYPE_INACTIVE');
    await leaveTypes.setLeaveTypeActive(vacId, true, actor.uid);
    await employees.archiveEmployee(juanId, actor.uid);
    expect(await errorCodeOf(spend(1, '2026-02-10', '2026-02-10'))).toBe('EMPLOYEE_ARCHIVED');
  });

  it('TC-LU-05…09: invalid dates and days are rejected before anything is written', async () => {
    const cases: [number, string, string][] = [
      [1, '2026-02-11', '2026-02-10'],
      [2, '2026-12-31', '2027-01-01'],
      [1, '2025-12-31', '2025-12-31'],
      [3, '2026-02-10', '2026-02-11'],
      [0, '2026-02-10', '2026-02-10'],
      [0.3, '2026-02-10', '2026-02-10'],
      [366, '2026-01-01', '2026-12-31'],
      [1, '2026-02-29', '2026-02-29'],
    ];
    for (const [days, from, to] of cases) {
      expect(await errorCodeOf(spend(days, from, to))).toBe('VALIDATION');
    }
    expect((await readEverything()).ledger).toHaveLength(1);
  });

  it('TC-LU-19: two half days make exactly 1.0 used', async () => {
    await spend(0.5, '2026-04-01', '2026-04-01');
    const second = await spend(0.5, '2026-04-02', '2026-04-02');
    expect(second.balance.totalUsed).toBe(1);
  });

  it('TC-LU-20: the employee history returns only that employee/year, newest first', async () => {
    await alloc(5, { employeeId: anaId });
    await spend(1, '2026-02-10', '2026-02-10');
    await spend(1, '2026-03-10', '2026-03-10');
    await alloc(2, { year: 2027 });
    const page = await ledger.listLedgerPage({ year: 2026, employeeId: juanId });
    expect(page.items.every((e) => e.employeeId === juanId && e.leaveYear === 2026)).toBe(true);
    expect(page.items.map((e) => e.dateFrom)).toEqual(['2026-03-10', '2026-02-10', null]);
  });
});

describe('TC-DUP: idempotency', () => {
  it('TC-DUP-01: the same transactionId twice (sequential) records once', async () => {
    await alloc(10);
    const id = ledger.newTransactionId();
    const first = await spend(2, '2026-02-10', '2026-02-11', { transactionId: id });
    const second = await spend(2, '2026-02-10', '2026-02-11', { transactionId: id });
    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(second.balance).toEqual(first.balance);
    expect(await raw('leaveBalances', balanceId())).toMatchObject({ totalUsed: 2 });
    expect((await readEverything()).ledger).toHaveLength(2);
  });

  it('TC-DUP-02: the same transactionId concurrently records once', async () => {
    await alloc(10);
    const id = ledger.newTransactionId();
    const results = await Promise.all([
      spend(2, '2026-02-10', '2026-02-11', { transactionId: id }),
      spend(2, '2026-02-10', '2026-02-11', { transactionId: id }),
      spend(2, '2026-02-10', '2026-02-11', { transactionId: id }),
    ]);
    expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(2);
    expect(await raw('leaveBalances', balanceId())).toMatchObject({ totalUsed: 2 });
  });

  it('TC-DUP-05: after an uncertain outcome, retrying with the same id detects the success', async () => {
    await alloc(10);
    const id = ledger.newTransactionId();
    await spend(1, '2026-02-10', '2026-02-10', { transactionId: id }); // "the response was lost"
    const retry = await spend(1, '2026-02-10', '2026-02-10', { transactionId: id });
    expect(retry.status).toBe('duplicate');
    expect(await raw('leaveBalances', balanceId())).toMatchObject({ totalUsed: 1 });
  });

  it('BR-DUP-03: a new dialog session (new id) with identical data is a second entry', async () => {
    await alloc(10);
    await spend(1, '2026-02-10', '2026-02-10');
    await spend(1, '2026-02-10', '2026-02-10');
    expect(await raw('leaveBalances', balanceId())).toMatchObject({ totalUsed: 2 });
  });
});

describe('TC-REV: reversal', () => {
  it('TC-REV-01: reversing a 1-day usage (10/3/7 → 10/2/8) links both ways', async () => {
    await alloc(10);
    await spend(2, '2026-02-10', '2026-02-11');
    const target = await spend(1, '2026-04-20', '2026-04-20');
    const result = await ledger.reverseEntry({
      originalTransactionId: target.transactionId,
      reason: 'Recorded under the wrong employee',
      actor,
    });
    expect(result).toMatchObject({
      status: 'created',
      transactionId: `rev_${target.transactionId}`,
      balance: { totalCredits: 10, totalUsed: 2 },
    });
    expect(await raw('leaveBalances', balanceId())).toMatchObject({
      totalUsed: 2,
      availableCredits: 8,
      lastTransactionId: `rev_${target.transactionId}`,
    });
    expect(await raw('leaveTransactions', target.transactionId)).toMatchObject({
      reversedByTransactionId: `rev_${target.transactionId}`,
      days: 1,
      usedDelta: 1,
    });
    expect(await raw('leaveTransactions', `rev_${target.transactionId}`)).toMatchObject({
      transactionType: 'REVERSAL',
      reversesTransactionId: target.transactionId,
      reversesType: 'USAGE',
      usedDelta: -1,
      creditsDelta: 0,
      days: 1,
      dateFrom: '2026-04-20',
      remarks: 'Recorded under the wrong employee',
    });
  });

  it('TC-REV-02: reversing an unused allocation of 2 (12/3 → 10/3)', async () => {
    await alloc(10);
    await spend(3, '2026-02-10', '2026-02-12');
    const extra = await alloc(2);
    const result = await ledger.reverseEntry({
      originalTransactionId: extra.transactionId,
      reason: 'Entered twice',
      actor,
    });
    expect(result.balance).toEqual({ totalCredits: 10, totalUsed: 3 });
  });

  it('TC-REV-03: an allocation whose credits are partly used cannot be reversed; nothing is written', async () => {
    const first = await alloc(10);
    await spend(8, '2026-03-01', '2026-03-08');
    const before = await readEverything();
    try {
      await ledger.reverseEntry({
        originalTransactionId: first.transactionId,
        reason: 'Wrong amount',
        actor,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as ErrorsModule.AppError).code).toBe('CANNOT_REVERSE');
      expect(errors.appErrorMessage(error)).toBe(
        "Can't reverse this allocation: 8 of its 10 credits are already used. Reverse the related usage entries first.",
      );
    }
    expect(await readEverything()).toEqual(before);
  });

  it('…and works after the related usage is reversed first (the documented order)', async () => {
    const first = await alloc(10);
    const usage = await spend(8, '2026-03-01', '2026-03-08');
    await ledger.reverseEntry({
      originalTransactionId: usage.transactionId,
      reason: 'Wrong entry',
      actor,
    });
    const result = await ledger.reverseEntry({
      originalTransactionId: first.transactionId,
      reason: 'Wrong amount',
      actor,
    });
    expect(result.balance).toEqual({ totalCredits: 0, totalUsed: 0 }); // EC-20: the document remains
    expect(await raw('leaveBalances', balanceId())).toMatchObject({
      totalCredits: 0,
      availableCredits: 0,
    });
  });

  it('TC-REV-04: a reversal cannot be reversed', async () => {
    await alloc(10);
    const usage = await spend(1, '2026-02-10', '2026-02-10');
    const reversal = await ledger.reverseEntry({
      originalTransactionId: usage.transactionId,
      reason: 'Oops',
      actor,
    });
    expect(
      await errorCodeOf(
        ledger.reverseEntry({
          originalTransactionId: reversal.transactionId,
          reason: 'Again',
          actor,
        }),
      ),
    ).toBe('CANNOT_REVERSE');
  });

  it('TC-REV-05: a reason shorter than 3 characters is rejected', async () => {
    await alloc(10);
    const usage = await spend(1, '2026-02-10', '2026-02-10');
    for (const reason of ['', ' ', 'ab']) {
      expect(
        await errorCodeOf(
          ledger.reverseEntry({ originalTransactionId: usage.transactionId, reason, actor }),
        ),
      ).toBe('VALIDATION');
    }
  });

  it('TC-REV-06 / TC-LT-08 / EC-09: allowed for an archived employee and an inactive type', async () => {
    await alloc(10);
    const usage = await spend(2, '2026-02-10', '2026-02-11');
    await employees.archiveEmployee(juanId, actor.uid);
    await leaveTypes.setLeaveTypeActive(vacId, false, actor.uid);
    const result = await ledger.reverseEntry({
      originalTransactionId: usage.transactionId,
      reason: 'Archived fix',
      actor,
    });
    expect(result.status).toBe('created');
  });

  it('TC-DUP-06: reversing the same entry twice changes the balance once', async () => {
    await alloc(10);
    const usage = await spend(2, '2026-02-10', '2026-02-11');
    const first = await ledger.reverseEntry({
      originalTransactionId: usage.transactionId,
      reason: 'Mistake',
      actor,
    });
    const second = await ledger.reverseEntry({
      originalTransactionId: usage.transactionId,
      reason: 'Mistake',
      actor,
    });
    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(await raw('leaveBalances', balanceId())).toMatchObject({
      totalUsed: 0,
      availableCredits: 10,
    });
    expect((await readEverything()).ledger).toHaveLength(3);
  });

  it('TC-DUP-06: concurrent reversals of the same entry reverse once', async () => {
    await alloc(10);
    const usage = await spend(2, '2026-02-10', '2026-02-11');
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        ledger.reverseEntry({
          originalTransactionId: usage.transactionId,
          reason: 'Mistake',
          actor,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
    expect(await raw('leaveBalances', balanceId())).toMatchObject({ totalUsed: 0 });
  });

  it('a missing original is NOT_FOUND', async () => {
    expect(
      await errorCodeOf(
        ledger.reverseEntry({
          originalTransactionId: 'doesNotExist00000000',
          reason: 'Reason',
          actor,
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('TC-REV-07 / TC-REV-12: original and reversal both appear in history, and re-recording reconciles', async () => {
    await alloc(10);
    const usage = await spend(2, '2026-02-10', '2026-02-11');
    await ledger.reverseEntry({
      originalTransactionId: usage.transactionId,
      reason: 'Wrong dates',
      actor,
    });
    await spend(2, '2026-02-12', '2026-02-13'); // the corrected record
    const page = await ledger.listLedgerPage({ year: 2026, employeeId: juanId });
    const ids = page.items.map((e) => e.id);
    expect(ids).toContain(usage.transactionId);
    expect(ids).toContain(`rev_${usage.transactionId}`);
    const original = page.items.find((e) => e.id === usage.transactionId);
    expect(original?.reversedByTransactionId).toBe(`rev_${usage.transactionId}`);
    const all = await readEverything();
    expect(reconcile(all.ledger, all.balances).ok).toBe(true);
  });

  it('TC-REV-14: a direct edit of an existing ledger entry is denied by the rules', async () => {
    await alloc(10);
    const usage = await spend(2, '2026-02-10', '2026-02-11');
    const { db } = firebase.getFirebase();
    expect(
      await errorCodeOf(updateDoc(doc(db, 'leaveTransactions', usage.transactionId), { days: 1 })),
    ).not.toBeNull();
    expect(await raw('leaveTransactions', usage.transactionId)).toMatchObject({ days: 2 });
  });
});

describe('TC-CONC: concurrency and atomicity', () => {
  it('TC-CONC-01: two usages of 6 against 10 available — exactly one fits', async () => {
    await alloc(10);
    const outcomes = await Promise.allSettled([
      spend(6, '2026-03-01', '2026-03-06'),
      spend(6, '2026-04-01', '2026-04-06'),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected');
    expect(rejected?.status === 'rejected' && (rejected.reason as ErrorsModule.AppError).code).toBe(
      'INSUFFICIENT_BALANCE',
    );
    expect(await raw('leaveBalances', balanceId())).toMatchObject({
      totalUsed: 6,
      availableCredits: 4,
    });
    expect((await readEverything()).ledger).toHaveLength(2);
  });

  it('BR-INS-04: many concurrent usages never overdraw — exactly those that fit succeed', async () => {
    await alloc(10);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        spend(3, `2026-0${String(i + 1)}-01`, `2026-0${String(i + 1)}-03`),
      ),
    );
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled').length;
    expect(fulfilled).toBe(3); // 3 × 3 = 9 ≤ 10 < 12
    const stored = await raw('leaveBalances', balanceId());
    expect(stored).toMatchObject({ totalUsed: 9, availableCredits: 1 });
  });

  it('TC-CONC-02: ten concurrent allocations of 1 are all recorded', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => alloc(1)));
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled').length;
    const stored = await raw('leaveBalances', balanceId());
    expect(stored?.totalCredits).toBe(fulfilled);
    expect((await readEverything()).ledger).toHaveLength(fulfilled);
    // Any failure must be the retryable CONTENTION error, never a corrupt state (reconcile runs after).
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected')
        expect((outcome.reason as ErrorsModule.AppError).code).toBe('CONTENTION');
    }
    expect(fulfilled).toBe(10);
  });

  it('TC-CONC-03: a ledger write whose balance write is refused leaves neither persisted', async () => {
    await alloc(10);
    const { db } = firebase.getFirebase();
    const before = await readEverything();
    const rogueId = ledger.newTransactionId();
    let error: string | null = null;
    try {
      await runTransaction(db, (transaction) => {
        // A valid-looking ledger entry …
        transaction.set(doc(db, 'leaveTransactions', rogueId), {
          employeeId: juanId,
          employeeNumberSnapshot: 'EMP-0042',
          employeeNameSnapshot: 'Juan Dela Cruz',
          positionSnapshot: 'Accounting Staff',
          departmentSnapshot: 'Finance',
          leaveTypeId: vacId,
          leaveTypeNameSnapshot: 'Vacation Leave',
          leaveYear: 2026,
          balanceId: balanceId(),
          transactionType: 'ALLOCATION',
          days: 1,
          creditsDelta: 1,
          usedDelta: 0,
          dateFrom: null,
          dateTo: null,
          remarks: null,
          reversesTransactionId: null,
          reversesType: null,
          reversedByTransactionId: null,
          resultingTotalCredits: 11,
          resultingTotalUsed: 0,
          createdBy: actor.uid,
          createdByName: 'Maria Santos',
          createdAt: serverTimestamp(),
        });
        // … paired with a balance write the rules must refuse (the total jumps by 100).
        transaction.update(doc(db, 'leaveBalances', balanceId()), {
          totalCredits: 110,
          totalUsed: 0,
          availableCredits: 110,
          lastTransactionId: rogueId,
          updatedAt: serverTimestamp(),
        });
        return Promise.resolve();
      });
    } catch (failure) {
      error = mapFirebaseError(failure).code;
    }
    expect(error).toBe('PERMISSION_DENIED');
    expect(await readEverything()).toEqual(before);
  });
});

describe('queries and aggregates', () => {
  async function juan2026() {
    await alloc(10);
    await alloc(5, { leaveTypeId: sickId });
    await alloc(3, {
      leaveTypeId: await leaveTypes.createLeaveType(
        { name: 'Emergency Leave', description: null },
        actor.uid,
      ),
    });
    await spend(2, '2026-02-10', '2026-02-11');
    await spend(1, '2026-04-20', '2026-04-20');
    await spend(1, '2026-03-15', '2026-03-15', { leaveTypeId: sickId });
    await spend(1, '2026-05-05', '2026-05-05', { leaveTypeId: sickId });
  }

  it('TC-SUM-01 / TC-DASH-01: the reference dataset is 18 / 5 / 13 for the employee and for the whole year', async () => {
    await juan2026();
    const rows = await balances.getBalancesForEmployeeYear(juanId, 2026);
    const types = await leaveTypes.listLeaveTypes();
    const summary = summarizeBalances(rows, types);
    expect(summary.totals).toEqual({ totalCredits: 18, totalUsed: 5, totalUnused: 13 });
    // The dashboard sums the year's balances in the browser (no aggregation query / index needed).
    const year = await balances.getYearBalances(2026);
    expect(sumTotals(year)).toEqual({ totalCredits: 18, totalUsed: 5, totalUnused: 13 });
    expect(sumTotals(year.filter((b) => b.leaveTypeId === vacId))).toEqual({
      totalCredits: 10,
      totalUsed: 3,
      totalUnused: 7,
    });
    expect(sumTotals(await balances.getYearBalances(2025))).toEqual({
      totalCredits: 0,
      totalUsed: 0,
      totalUnused: 0,
    });
  });

  it('balance reads: one, per employee-year, per employee set, per year', async () => {
    await juan2026();
    await alloc(4, { employeeId: anaId });
    expect((await balances.getBalance(juanId, 2026, vacId))?.availableCredits).toBe(7);
    expect(await balances.getBalance(juanId, 2026, 'nope')).toBeNull();
    expect(await balances.getBalancesForEmployeeYear(juanId, 2026)).toHaveLength(3);
    expect(await balances.getBalancesForEmployees([juanId, anaId], 2026)).toHaveLength(4);
    expect(await balances.getBalancesForEmployees([], 2026)).toHaveLength(0);
    expect(await balances.getYearBalances(2026)).toHaveLength(4);
    expect(await balances.getYearBalances(2027)).toHaveLength(0);
  });

  it('getBalancesForEmployees handles more than 30 ids by chunking', async () => {
    await alloc(1);
    const ids = [juanId, ...Array.from({ length: 40 }, (_, i) => `ghost${String(i)}`)];
    expect(await balances.getBalancesForEmployees(ids, 2026)).toHaveLength(1);
  });

  it('listLedgerPage: newest first, server filters, and cursor paging with an exact end', async () => {
    await alloc(100);
    for (let day = 1; day <= 27; day += 1) {
      await spend(
        0.5,
        `2026-02-${String(day).padStart(2, '0')}`,
        `2026-02-${String(day).padStart(2, '0')}`,
      );
    }
    const first = await ledger.listLedgerPage({ year: 2026, pageSize: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    const second = await ledger.listLedgerPage({
      year: 2026,
      pageSize: 10,
      cursor: first.nextCursor,
    });
    const third = await ledger.listLedgerPage({
      year: 2026,
      pageSize: 10,
      cursor: second.nextCursor,
    });
    expect(second.items).toHaveLength(10);
    expect(third.items).toHaveLength(8); // 28 entries in total
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items, ...third.items].map((e) => e.id);
    expect(new Set(ids).size).toBe(28);
    // exactly 25 → no phantom next page (EC-17)
    const exact = await ledger.listLedgerPage({ year: 2026, pageSize: 28 });
    expect(exact.hasMore).toBe(false);
    // filters
    expect(
      (await ledger.listLedgerPage({ year: 2026, transactionType: 'ALLOCATION' })).items,
    ).toHaveLength(1);
    expect((await ledger.listLedgerPage({ year: 2026, leaveTypeId: sickId })).items).toHaveLength(
      0,
    );
    expect((await ledger.listLedgerPage({ year: 2025 })).items).toHaveLength(0);
  });

  it('getLedgerYear returns the whole year (optionally one employee) and findUsageForOverlap only USAGE', async () => {
    await alloc(10);
    await alloc(5, { employeeId: anaId });
    await spend(2, '2026-02-10', '2026-02-11');
    expect(await ledger.getLedgerYear(2026)).toHaveLength(3);
    expect(await ledger.getLedgerYear(2026, anaId)).toHaveLength(1);
    const overlap = await ledger.findUsageForOverlap(juanId, 2026);
    expect(overlap).toHaveLength(1);
    expect(overlap[0]?.transactionType).toBe('USAGE');
    expect(await ledger.findUsageForOverlap(anaId, 2026)).toHaveLength(0);
  });
});

describe('authorization', () => {
  it('a deactivated user can neither record nor read ledger data', async () => {
    await alloc(10);
    await seedUserProfile(rulesEnv, actor.uid, { email: 'hr@example.test', isActive: false });
    expect(await errorCodeOf(alloc(1))).toBe('PERMISSION_DENIED');
    expect(await errorCodeOf(ledger.getLedgerYear(2026))).toBe('PERMISSION_DENIED');
    expect(await errorCodeOf(balances.getYearBalances(2026))).toBe('PERMISSION_DENIED');
    await seedUserProfile(rulesEnv, actor.uid, { email: 'hr@example.test' }); // restore for the reconcile hook
  });
});
