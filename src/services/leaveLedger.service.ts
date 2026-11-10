import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase/firestore';

import { LEDGER_PAGE_SIZE, type TransactionType } from '@/domain/constants';
import { AppError } from '@/domain/errors';
import {
  buildAdjustmentEntry,
  buildAllocationEntry,
  buildReversalEntry,
  buildUsageEntry,
  makeBalanceId,
  type BuiltEntry,
} from '@/domain/ledger';
import { getFirebase } from '@/lib/firebase';
import { toEmployee, toLeaveBalance, toLeaveTransaction } from '@/services/firestore/converters';
import { mapFirebaseError } from '@/services/firestore/errors';
import { COLLECTIONS } from '@/services/firestore/paths';
import type { Actor, BalanceTotals, LeaveTransaction } from '@/types/models';

/**
 * The atomic ledger operations (DB design §6). Every write is ONE `runTransaction`: all reads
 * first, the domain builder does every check and all arithmetic, then the ledger entry and the
 * balance are written together (the Security Rules refuse either one alone). Nothing here ever
 * writes a ledger entry or balance outside a transaction, and every function throws an `AppError`.
 *
 * Idempotency (D-05): the caller generates `transactionId` once per dialog session; a retry with
 * the same id finds the earlier entry and reports `duplicate` instead of recording twice.
 */

/**
 * A ledger transaction is retried by the SDK when another write touches the same balance. The
 * default of 5 attempts is too tight when several tabs/clients write one balance at once, so allow
 * more before surfacing a CONTENTION error.
 */
const TRANSACTION_OPTIONS = { maxAttempts: 10 } as const;

/**
 * The Security Rules bind every balance write to the balance AS STORED at commit time. When two
 * writers race for the same balance, the loser's commit was computed from a now-stale read, so the
 * rules reject it as `permission-denied` — Firestore never reports it as the retryable "aborted"
 * the SDK would retry by itself (proved by the concurrency integration tests). A denial can
 * therefore mean "you lost a race", not only "you may not do this".
 *
 * So after a denial the whole operation is run again from fresh reads, a few times with a short
 * random pause. That is safe: every operation is idempotent (client-generated transaction id, or
 * the deterministic `rev_` id), and the rules still check every attempt. A genuine denial (for
 * example a deactivated account) fails every attempt and is reported as PERMISSION_DENIED.
 */
const DENIAL_RETRIES = 6;

async function retryOnDenial<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const denied = error instanceof AppError && error.code === 'PERMISSION_DENIED';
      if (!denied || attempt >= DENIAL_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 60 * attempt));
    }
  }
}

export interface LedgerResult {
  readonly status: 'created' | 'duplicate';
  readonly transactionId: string;
  /** The balance right after this entry (read from the entry itself when it was a duplicate). */
  readonly balance: BalanceTotals;
}

export interface AllocationRequest {
  /** Client-generated Firestore auto-id: the idempotency key. */
  readonly transactionId: string;
  readonly employeeId: string;
  readonly year: number;
  readonly days: number;
  readonly remarks: string | null;
  readonly actor: Actor;
}

export interface UsageRequest extends AllocationRequest {
  readonly dateFrom: string;
  readonly dateTo: string;
}

export interface AdjustmentRequest {
  /** Client-generated Firestore auto-id: the idempotency key. */
  readonly transactionId: string;
  readonly employeeId: string;
  readonly year: number;
  /** The employee's new TOTAL allocated days for the year. */
  readonly newTotal: number;
  readonly reason: string;
  readonly actor: Actor;
}

export interface ReversalRequest {
  readonly originalTransactionId: string;
  readonly reason: string;
  readonly actor: Actor;
}

/** Fresh auto-id for a dialog session (an idempotency key). */
export function newTransactionId(): string {
  return doc(collection(getFirebase().db, COLLECTIONS.leaveTransactions)).id;
}

function balanceChange(built: BuiltEntry, lastTransactionId: string) {
  return {
    totalCredits: built.balance.totalCredits,
    totalUsed: built.balance.totalUsed,
    availableCredits: built.balance.totalCredits - built.balance.totalUsed,
    lastTransactionId,
    updatedAt: serverTimestamp(),
  };
}

/** Runs one attempt and converts SDK errors, so `retryOnDenial` can recognise a denial. */
async function mapped<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

function duplicateResult(transactionId: string, data: DocumentData): LedgerResult {
  const entry = toLeaveTransaction(transactionId, data);
  return {
    status: 'duplicate',
    transactionId,
    balance: {
      totalCredits: entry?.resultingTotalCredits ?? 0,
      totalUsed: entry?.resultingTotalUsed ?? 0,
    },
  };
}

/** Reads everything an allocation / usage needs, inside the transaction. */
async function readContext(
  transaction: Transaction,
  request: Pick<AllocationRequest, 'employeeId' | 'year'>,
) {
  const { db } = getFirebase();
  const [employeeSnap, balanceSnap] = [
    await transaction.get(doc(db, COLLECTIONS.employees, request.employeeId)),
    await transaction.get(
      doc(db, COLLECTIONS.leaveBalances, makeBalanceId(request.employeeId, request.year)),
    ),
  ];
  const employee = employeeSnap.exists() ? toEmployee(employeeSnap.id, employeeSnap.data()) : null;
  if (employee === null) throw new AppError('NOT_FOUND');
  const stored = balanceSnap.exists() ? toLeaveBalance(balanceSnap.id, balanceSnap.data()) : null;
  if (balanceSnap.exists() && stored === null) throw new AppError('UNKNOWN');
  return {
    employee,
    balanceExists: balanceSnap.exists(),
    balance: stored ? { totalCredits: stored.totalCredits, totalUsed: stored.totalUsed } : null,
  };
}

function writeEntryAndBalance(
  transaction: Transaction,
  transactionId: string,
  built: BuiltEntry,
  balanceExists: boolean,
): void {
  const { db } = getFirebase();
  transaction.set(doc(db, COLLECTIONS.leaveTransactions, transactionId), {
    ...built.entry,
    createdAt: serverTimestamp(),
  });
  const balanceRef = doc(db, COLLECTIONS.leaveBalances, built.entry.balanceId);
  if (balanceExists) {
    transaction.update(balanceRef, balanceChange(built, transactionId));
  } else {
    transaction.set(balanceRef, {
      employeeId: built.entry.employeeId,
      year: built.entry.leaveYear,
      ...balanceChange(built, transactionId),
      createdAt: serverTimestamp(),
    });
  }
}

export async function recordAllocation(request: AllocationRequest): Promise<LedgerResult> {
  const { db } = getFirebase();
  const entryRef = doc(db, COLLECTIONS.leaveTransactions, request.transactionId);
  try {
    return await retryOnDenial(() =>
      mapped(() =>
        runTransaction(
          db,
          async (transaction) => {
            const existing = await transaction.get(entryRef);
            if (existing.exists()) return duplicateResult(request.transactionId, existing.data());
            const context = await readContext(transaction, request);
            const built = buildAllocationEntry({
              employee: context.employee,
              year: request.year,
              days: request.days,
              remarks: request.remarks,
              balance: context.balance,
              actor: request.actor,
            });
            writeEntryAndBalance(transaction, request.transactionId, built, context.balanceExists);
            return {
              status: 'created',
              transactionId: request.transactionId,
              balance: built.balance,
            };
          },
          TRANSACTION_OPTIONS,
        ),
      ),
    );
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export async function recordUsage(request: UsageRequest): Promise<LedgerResult> {
  const { db } = getFirebase();
  const entryRef = doc(db, COLLECTIONS.leaveTransactions, request.transactionId);
  try {
    return await retryOnDenial(() =>
      mapped(() =>
        runTransaction(
          db,
          async (transaction) => {
            const existing = await transaction.get(entryRef);
            if (existing.exists()) return duplicateResult(request.transactionId, existing.data());
            const context = await readContext(transaction, request);
            const built = buildUsageEntry({
              employee: context.employee,
              year: request.year,
              days: request.days,
              dateFrom: request.dateFrom,
              dateTo: request.dateTo,
              remarks: request.remarks,
              balance: context.balance,
              actor: request.actor,
            });
            writeEntryAndBalance(transaction, request.transactionId, built, context.balanceExists);
            return {
              status: 'created',
              transactionId: request.transactionId,
              balance: built.balance,
            };
          },
          TRANSACTION_OPTIONS,
        ),
      ),
    );
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Edits an employee's allocated days for a year (an ADJUSTMENT entry): the new total replaces the
 * old one, and the entry keeps who changed it, when, and the reason. Needs an existing balance and
 * can never go below the days already used.
 */
export async function recordAdjustment(request: AdjustmentRequest): Promise<LedgerResult> {
  const { db } = getFirebase();
  const entryRef = doc(db, COLLECTIONS.leaveTransactions, request.transactionId);
  try {
    return await retryOnDenial(() =>
      mapped(() =>
        runTransaction(
          db,
          async (transaction) => {
            const existing = await transaction.get(entryRef);
            if (existing.exists()) return duplicateResult(request.transactionId, existing.data());
            const context = await readContext(transaction, request);
            const built = buildAdjustmentEntry({
              employee: context.employee,
              year: request.year,
              newTotal: request.newTotal,
              reason: request.reason,
              balance: context.balance,
              actor: request.actor,
            });
            writeEntryAndBalance(transaction, request.transactionId, built, context.balanceExists);
            return {
              status: 'created',
              transactionId: request.transactionId,
              balance: built.balance,
            };
          },
          TRANSACTION_OPTIONS,
        ),
      ),
    );
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Reverses an ALLOCATION or USAGE (D-04). The reversal id is deterministic (`rev_{id}`, R-02). */
export async function reverseEntry(request: ReversalRequest): Promise<LedgerResult> {
  const { db } = getFirebase();
  const originalRef = doc(db, COLLECTIONS.leaveTransactions, request.originalTransactionId);
  const reversalRef = doc(
    db,
    COLLECTIONS.leaveTransactions,
    `rev_${request.originalTransactionId}`,
  );
  try {
    return await retryOnDenial(() =>
      mapped(() =>
        runTransaction(
          db,
          async (transaction) => {
            const existingReversal = await transaction.get(reversalRef);
            if (existingReversal.exists())
              return duplicateResult(reversalRef.id, existingReversal.data());

            const originalSnap = await transaction.get(originalRef);
            const original = originalSnap.exists()
              ? toLeaveTransaction(originalSnap.id, originalSnap.data())
              : null;
            if (original === null) throw new AppError('NOT_FOUND');

            const balanceRef = doc(db, COLLECTIONS.leaveBalances, original.balanceId);
            const balanceSnap = await transaction.get(balanceRef);
            const stored = balanceSnap.exists()
              ? toLeaveBalance(balanceSnap.id, balanceSnap.data())
              : null;

            const built = buildReversalEntry({
              original,
              balance: stored
                ? { totalCredits: stored.totalCredits, totalUsed: stored.totalUsed }
                : null,
              reason: request.reason,
              actor: request.actor,
            });

            transaction.set(reversalRef, { ...built.entry, createdAt: serverTimestamp() });
            transaction.update(balanceRef, balanceChange(built, built.reversalId));
            transaction.update(originalRef, { reversedByTransactionId: built.reversalId });
            return { status: 'created', transactionId: built.reversalId, balance: built.balance };
          },
          TRANSACTION_OPTIONS,
        ),
      ),
    );
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

// ─────────────────────────────── queries ───────────────────────────────

/** Opaque cursor for "Load more" (the last document of the previous page). */
export type LedgerCursor = QueryDocumentSnapshot<DocumentData>;

export interface LedgerQuery {
  readonly year: number;
  readonly employeeId?: string;
  /** One type, or several (the allocation history shows ALLOCATION and ADJUSTMENT together). */
  readonly transactionType?: TransactionType | readonly TransactionType[];
  readonly pageSize?: number;
  readonly cursor?: LedgerCursor | null;
}

export interface LedgerPage {
  readonly items: readonly LeaveTransaction[];
  readonly nextCursor: LedgerCursor | null;
  readonly hasMore: boolean;
}

function toTransactions(docs: readonly QueryDocumentSnapshot<DocumentData>[]): LeaveTransaction[] {
  return docs.flatMap((snapshot) => {
    const entry = toLeaveTransaction(snapshot.id, snapshot.data());
    return entry ? [entry] : [];
  });
}

/** One page of the year's ledger, newest first, filtered on the server (DB §8.5). */
export async function listLedgerPage(params: LedgerQuery): Promise<LedgerPage> {
  const pageSize = params.pageSize ?? LEDGER_PAGE_SIZE;
  try {
    const constraints: QueryConstraint[] = [where('leaveYear', '==', params.year)];
    if (params.employeeId) constraints.push(where('employeeId', '==', params.employeeId));
    if (Array.isArray(params.transactionType)) {
      constraints.push(where('transactionType', 'in', params.transactionType));
    } else if (params.transactionType) {
      constraints.push(where('transactionType', '==', params.transactionType));
    }
    constraints.push(orderBy('createdAt', 'desc'));
    if (params.cursor) constraints.push(startAfter(params.cursor));
    // One extra row tells us whether another page exists, without a second query.
    constraints.push(limit(pageSize + 1));

    const snapshot = await getDocs(
      query(collection(getFirebase().db, COLLECTIONS.leaveTransactions), ...constraints),
    );
    const hasMore = snapshot.docs.length > pageSize;
    const pageDocs = snapshot.docs.slice(0, pageSize);
    return {
      items: toTransactions(pageDocs),
      nextCursor: hasMore ? (pageDocs[pageDocs.length - 1] ?? null) : null,
      hasMore,
    };
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Every ledger entry of a year (optionally one employee), UNSORTED — reports sort in memory
 * (R-06) and use only single-field indexes (DB §8.8).
 */
export async function getLedgerYear(
  year: number,
  employeeId?: string,
): Promise<LeaveTransaction[]> {
  try {
    const constraints: QueryConstraint[] = [where('leaveYear', '==', year)];
    if (employeeId) constraints.push(where('employeeId', '==', employeeId));
    const snapshot = await getDocs(
      query(collection(getFirebase().db, COLLECTIONS.leaveTransactions), ...constraints),
    );
    return toTransactions(snapshot.docs);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** The employee's USAGE entries for a year, for the overlap warning (DB §8.6; index 6). */
export async function findUsageForOverlap(
  employeeId: string,
  year: number,
): Promise<LeaveTransaction[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(getFirebase().db, COLLECTIONS.leaveTransactions),
        where('leaveYear', '==', year),
        where('employeeId', '==', employeeId),
        where('transactionType', '==', 'USAGE'),
        orderBy('createdAt', 'desc'),
      ),
    );
    return toTransactions(snapshot.docs);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
