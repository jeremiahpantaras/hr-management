import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';

import {
  buildAdjustmentEntry,
  buildAllocationEntry,
  buildReversalEntry,
  buildUsageEntry,
  makeBalanceId,
} from '@/domain/ledger';
import type { Actor, BalanceTotals, Employee, LeaveTransaction } from '@/types/models';

/**
 * Shared fixtures for the ledger rules + integration suites. Valid documents are produced by the
 * REAL domain builders, so a passing "valid commit" proves the client and the Security Rules agree;
 * the attack tests then tamper with those documents.
 */
/** The Firestore handle that rules-unit-testing hands out. */
export type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

export const SEED_TIME = Timestamp.fromDate(new Date('2026-01-05T01:30:00Z'));
export const HR_UID = 'hr1';
export const HR_NAME = 'Maria Santos';
export const ACTOR: Actor = { uid: HR_UID, name: HR_NAME };

export const EMP_ID = 'empA';
export const EMP_ARCHIVED = 'empArch';

export const employee: Employee = {
  id: EMP_ID,
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
  createdBy: HR_UID,
  updatedAt: null,
  updatedBy: HR_UID,
};
export const archivedEmployee: Employee = { ...employee, id: EMP_ARCHIVED, isArchived: true };

/** Deterministic 20-character alphanumeric ids (the shape of a Firestore auto-id). */
export function txnId(n: number): string {
  return `Tx${String(n).padStart(18, '0')}`;
}

/** Seeds employees with security rules disabled (what earlier phases create). */
export async function seedMasterData(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const e of [employee, archivedEmployee]) {
      await setDoc(doc(db, 'employees', e.id), {
        employeeNumber: e.employeeNumber,
        employeeNumberKey: e.employeeNumberKey,
        fullName: e.fullName,
        position: e.position,
        department: e.department,
        employmentStatus: e.employmentStatus,
        isArchived: e.isArchived,
        archivedAt: e.isArchived ? SEED_TIME : null,
        archivedBy: e.isArchived ? HR_UID : null,
        createdAt: SEED_TIME,
        createdBy: HR_UID,
        updatedAt: SEED_TIME,
        updatedBy: HR_UID,
      });
    }
  });
}

type Plain = Record<string, unknown>;

/** What the client writes for one ledger operation (before any tampering). */
export interface Pair {
  readonly id: string;
  readonly ledger: Plain;
  readonly balanceId: string;
  readonly balance: Plain;
  /** True when the balance document does not exist yet (a `set` create). */
  readonly isNewBalance: boolean;
  /** The entry as the domain sees it (what a later reversal is built from). */
  readonly domain: LeaveTransaction;
  /** For a reversal: the original to link (`reversedByTransactionId`). */
  readonly linkOriginalId?: string;
}

function balanceData(
  entry: { employeeId: string; leaveYear: number },
  totals: BalanceTotals,
  lastTransactionId: string,
  isNew: boolean,
): Plain {
  // An update sends only the fields that change; the immutable ones stay as stored (as the
  // ledger service does). A create sends the whole document.
  const changing = {
    totalCredits: totals.totalCredits,
    totalUsed: totals.totalUsed,
    availableCredits: totals.totalCredits - totals.totalUsed,
    lastTransactionId,
    updatedAt: serverTimestamp(),
  };
  return isNew
    ? {
        employeeId: entry.employeeId,
        year: entry.leaveYear,
        ...changing,
        createdAt: serverTimestamp(),
      }
    : changing;
}

export function allocationPair(opts: {
  id: string;
  days: number;
  year?: number;
  emp?: Employee;
  balance?: BalanceTotals | null;
  remarks?: string | null;
}): Pair {
  const year = opts.year ?? 2026;
  const emp = opts.emp ?? employee;
  const balance = opts.balance ?? null;
  const built = buildAllocationEntry({
    employee: emp,
    year,
    days: opts.days,
    balance,
    actor: ACTOR,
    remarks: opts.remarks ?? null,
  });
  return {
    id: opts.id,
    ledger: { ...built.entry, createdAt: serverTimestamp() },
    balanceId: built.entry.balanceId,
    balance: balanceData(built.entry, built.balance, opts.id, balance === null),
    isNewBalance: balance === null,
    domain: { ...built.entry, id: opts.id, createdAt: null },
  };
}

export function usagePair(opts: {
  id: string;
  days: number;
  dateFrom: string;
  dateTo: string;
  year?: number;
  balance: BalanceTotals;
}): Pair {
  const year = opts.year ?? 2026;
  const built = buildUsageEntry({
    employee,
    year,
    days: opts.days,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    balance: opts.balance,
    actor: ACTOR,
  });
  return {
    id: opts.id,
    ledger: { ...built.entry, createdAt: serverTimestamp() },
    balanceId: built.entry.balanceId,
    balance: balanceData(built.entry, built.balance, opts.id, false),
    isNewBalance: false,
    domain: { ...built.entry, id: opts.id, createdAt: null },
  };
}

/** Editing an employee's allocated days: the new TOTAL replaces the old one. */
export function adjustmentPair(opts: {
  id: string;
  newTotal: number;
  balance: BalanceTotals;
  year?: number;
  emp?: Employee;
  reason?: string;
}): Pair {
  const built = buildAdjustmentEntry({
    employee: opts.emp ?? employee,
    year: opts.year ?? 2026,
    newTotal: opts.newTotal,
    balance: opts.balance,
    reason: opts.reason ?? 'Corrected after review',
    actor: ACTOR,
  });
  return {
    id: opts.id,
    ledger: { ...built.entry, createdAt: serverTimestamp() },
    balanceId: built.entry.balanceId,
    balance: balanceData(built.entry, built.balance, opts.id, false),
    isNewBalance: false,
    domain: { ...built.entry, id: opts.id, createdAt: null },
  };
}

export function reversalPair(opts: {
  original: LeaveTransaction;
  balance: BalanceTotals;
  reason?: string;
}): Pair {
  const built = buildReversalEntry({
    original: opts.original,
    balance: opts.balance,
    reason: opts.reason ?? 'Entered by mistake',
    actor: ACTOR,
  });
  return {
    id: built.reversalId,
    ledger: { ...built.entry, createdAt: serverTimestamp() },
    balanceId: built.entry.balanceId,
    balance: balanceData(built.entry, built.balance, built.reversalId, false),
    isNewBalance: false,
    domain: { ...built.entry, id: built.reversalId, createdAt: null },
    linkOriginalId: opts.original.id,
  };
}

/** Adds the writes of a pair to a batch (ledger, balance, and the original's link for reversals). */
export function addPair(db: Db, batch: WriteBatch, pair: Pair): void {
  batch.set(doc(db, 'leaveTransactions', pair.id), pair.ledger);
  if (pair.isNewBalance) batch.set(doc(db, 'leaveBalances', pair.balanceId), pair.balance);
  else batch.update(doc(db, 'leaveBalances', pair.balanceId), pair.balance);
  if (pair.linkOriginalId !== undefined) {
    batch.update(doc(db, 'leaveTransactions', pair.linkOriginalId), {
      reversedByTransactionId: pair.id,
    });
  }
}

/** Commits a pair as one atomic batch from a single Firestore instance. */
export function commitPair(db: Db, pair: Pair): Promise<void> {
  const batch = writeBatch(db);
  addPair(db, batch, pair);
  return batch.commit();
}

/** Writes a pair's final documents directly (rules disabled) to establish prior state. */
export async function seedPair(
  env: RulesTestEnvironment,
  entry: { id: string; data: Plain },
  balance: { id: string; data: Plain },
): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'leaveTransactions', entry.id), entry.data);
    await setDoc(doc(db, 'leaveBalances', balance.id), balance.data);
  });
}

export { makeBalanceId };
