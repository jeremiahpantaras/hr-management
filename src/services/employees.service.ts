import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentReference,
} from 'firebase/firestore';

import { normalizeEmployeeNumber } from '@/domain/employee';
import { AppError } from '@/domain/errors';
import type { EmployeeInput } from '@/domain/schemas/employee';
import { getFirebase } from '@/lib/firebase';
import { toEmployee } from '@/services/firestore/converters';
import { mapFirebaseError } from '@/services/firestore/errors';
import { COLLECTIONS } from '@/services/firestore/paths';
import type { Employee } from '@/types/models';

/**
 * Employee data access (FR-EMP-*, DB design §6.5). Employee IDs are unique case-insensitively via
 * a reservation document (`employeeNumbers/{UPPER-ID}`) written in the SAME transaction as the
 * employee; the Security Rules independently verify that pairing. Employees are never deleted.
 * Every function throws an `AppError` (never a raw Firebase error).
 */

/**
 * Under a genuine race (two admins reserving the same Employee ID at once) the loser's transaction
 * reads "free" but, by commit time, the Security Rules see the ID already reserved and reject the
 * write as `permission-denied`. That is a duplicate, not an authorization failure, so after a
 * denial we look at who holds the ID: held by someone else → duplicate. If this re-read is itself
 * denied, the user genuinely lacks access and the original denial stands.
 */
async function explainDenial(
  error: AppError,
  reservationRef: DocumentReference,
  ownEmployeeId: string | null,
): Promise<AppError> {
  if (error.code !== 'PERMISSION_DENIED') return error;
  try {
    const holder = await getDoc(reservationRef);
    if (holder.exists() && holder.get('employeeId') !== ownEmployeeId) {
      return new AppError('DUPLICATE_EMPLOYEE_NUMBER', { cause: error });
    }
  } catch {
    // Still unauthorized: keep the original error.
  }
  return error;
}

/** All employees (archived included), unsorted. Cached by the caller (D-09). */
export async function listEmployees(): Promise<Employee[]> {
  try {
    const snapshot = await getDocs(collection(getFirebase().db, COLLECTIONS.employees));
    return snapshot.docs.flatMap((document) => {
      const employee = toEmployee(document.id, document.data());
      return employee ? [employee] : [];
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** One employee, or `null` if no such record exists. */
export async function getEmployee(employeeId: string): Promise<Employee | null> {
  try {
    const snapshot = await getDoc(doc(getFirebase().db, COLLECTIONS.employees, employeeId));
    return snapshot.exists() ? toEmployee(snapshot.id, snapshot.data()) : null;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Creates the employee and reserves its Employee ID atomically. Returns the new employee's id. */
export async function createEmployee(input: EmployeeInput, actorUid: string): Promise<string> {
  const { db } = getFirebase();
  const key = normalizeEmployeeNumber(input.employeeNumber);
  const employeeRef = doc(collection(db, COLLECTIONS.employees));
  const reservationRef = doc(db, COLLECTIONS.employeeNumbers, key);

  try {
    await runTransaction(db, async (transaction) => {
      // All reads before any write (Firestore requirement). The callback may run again on
      // contention, so it is free of side effects.
      if ((await transaction.get(reservationRef)).exists()) {
        throw new AppError('DUPLICATE_EMPLOYEE_NUMBER');
      }

      transaction.set(employeeRef, {
        employeeNumber: input.employeeNumber,
        employeeNumberKey: key,
        fullName: input.fullName,
        position: input.position,
        department: input.department,
        employmentStatus: input.employmentStatus,
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      });
      transaction.set(reservationRef, { employeeId: employeeRef.id, createdAt: serverTimestamp() });
    });
    return employeeRef.id;
  } catch (error) {
    throw await explainDenial(mapFirebaseError(error), reservationRef, employeeRef.id);
  }
}

/**
 * Edits an employee. If the Employee ID changed, the new ID is reserved and the old one released in
 * the same transaction (R-04) — an ID already in use rejects the whole edit with nothing written.
 */
export async function updateEmployee(
  employeeId: string,
  input: EmployeeInput,
  actorUid: string,
): Promise<void> {
  const { db } = getFirebase();
  const employeeRef = doc(db, COLLECTIONS.employees, employeeId);
  const newKey = normalizeEmployeeNumber(input.employeeNumber);
  const newReservationRef = doc(db, COLLECTIONS.employeeNumbers, newKey);

  try {
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(employeeRef);
      if (!current.exists()) throw new AppError('NOT_FOUND');

      const oldKey: unknown = current.get('employeeNumberKey');
      const idChanged = typeof oldKey === 'string' && oldKey !== newKey;

      if (idChanged && (await transaction.get(newReservationRef)).exists()) {
        throw new AppError('DUPLICATE_EMPLOYEE_NUMBER');
      }

      transaction.update(employeeRef, {
        employeeNumber: input.employeeNumber,
        employeeNumberKey: newKey,
        fullName: input.fullName,
        position: input.position,
        department: input.department,
        employmentStatus: input.employmentStatus,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      });

      if (idChanged) {
        transaction.set(newReservationRef, { employeeId, createdAt: serverTimestamp() });
        transaction.delete(doc(db, COLLECTIONS.employeeNumbers, oldKey));
      }
    });
  } catch (error) {
    throw await explainDenial(mapFirebaseError(error), newReservationRef, employeeId);
  }
}

/** Archives (`true`) or restores (`false`). Never touches balances or history. A no-op if already so. */
async function setArchived(employeeId: string, archived: boolean, actorUid: string): Promise<void> {
  const { db } = getFirebase();
  const employeeRef = doc(db, COLLECTIONS.employees, employeeId);

  try {
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(employeeRef);
      if (!current.exists()) throw new AppError('NOT_FOUND');
      if (current.get('isArchived') === archived) return;

      transaction.update(employeeRef, {
        isArchived: archived,
        archivedAt: archived ? serverTimestamp() : null,
        archivedBy: archived ? actorUid : null,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      });
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export function archiveEmployee(employeeId: string, actorUid: string): Promise<void> {
  return setArchived(employeeId, true, actorUid);
}

export function restoreEmployee(employeeId: string, actorUid: string): Promise<void> {
  return setArchived(employeeId, false, actorUid);
}

export interface BulkCreateItem {
  /** The spreadsheet row, so a failure can be reported against the row the user sees. */
  readonly rowNumber: number;
  readonly input: EmployeeInput;
}

export interface BulkCreateResult {
  readonly rowNumber: number;
  readonly ok: boolean;
  /** Why it failed (e.g. DUPLICATE_EMPLOYEE_NUMBER when someone else took the ID meanwhile). */
  readonly code: AppError['code'] | null;
}

/**
 * Creates employees one transaction each (so the Employee-ID reservation stays atomic and the rules
 * keep verifying every pair), a few at a time. A failure never stops the others, and nothing here
 * can overwrite an existing employee: an ID that is already reserved is reported as a duplicate.
 */
export async function createEmployeesBulk(
  items: readonly BulkCreateItem[],
  actorUid: string,
  options: {
    readonly concurrency?: number;
    readonly onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<BulkCreateResult[]> {
  const results: BulkCreateResult[] = new Array<BulkCreateResult>(items.length);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      try {
        await createEmployee(item.input, actorUid);
        results[index] = { rowNumber: item.rowNumber, ok: true, code: null };
      } catch (error) {
        results[index] = {
          rowNumber: item.rowNumber,
          ok: false,
          code: error instanceof AppError ? error.code : 'UNKNOWN',
        };
      }
      done += 1;
      options.onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ───────────────────────── bulk actions (select + archive / restore / delete) ─────────────────────────

export interface BulkActionResult {
  readonly employeeId: string;
  readonly ok: boolean;
  readonly code: AppError['code'] | null;
}

/** Runs `action` for every id a few at a time. One failure never stops the others. */
async function runForEach(
  ids: readonly string[],
  action: (employeeId: string) => Promise<void>,
  options: {
    readonly concurrency?: number;
    readonly onProgress?: (done: number, total: number) => void;
  },
): Promise<BulkActionResult[]> {
  const results = new Array<BulkActionResult>(ids.length);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      const employeeId = ids[index];
      if (employeeId === undefined) return;
      try {
        await action(employeeId);
        results[index] = { employeeId, ok: true, code: null };
      } catch (error) {
        results[index] = {
          employeeId,
          ok: false,
          code: error instanceof AppError ? error.code : 'UNKNOWN',
        };
      }
      done += 1;
      options.onProgress?.(done, ids.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
  return results;
}

interface BulkOptions {
  readonly onProgress?: (done: number, total: number) => void;
}

export function archiveEmployeesBulk(
  ids: readonly string[],
  actorUid: string,
  options: BulkOptions = {},
): Promise<BulkActionResult[]> {
  return runForEach(ids, (id) => archiveEmployee(id, actorUid), options);
}

export function restoreEmployeesBulk(
  ids: readonly string[],
  actorUid: string,
  options: BulkOptions = {},
): Promise<BulkActionResult[]> {
  return runForEach(ids, (id) => restoreEmployee(id, actorUid), options);
}

/** True if the employee has any balance or ledger entry (in any year). */
async function hasLeaveRecords(employeeId: string): Promise<boolean> {
  const { db } = getFirebase();
  const [balance, entry] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTIONS.leaveBalances),
        where('employeeId', '==', employeeId),
        limit(1),
      ),
    ),
    getDocs(
      query(
        collection(db, COLLECTIONS.leaveTransactions),
        where('employeeId', '==', employeeId),
        limit(1),
      ),
    ),
  ]);
  return !balance.empty || !entry.empty;
}

/**
 * Which of these employees have leave records and therefore cannot be deleted. Used to tell the user
 * BEFORE they confirm; `deleteEmployee` checks again at deletion time.
 */
export async function findEmployeesWithLeaveRecords(
  ids: readonly string[],
  options: BulkOptions = {},
): Promise<Set<string>> {
  const blocked = new Set<string>();
  try {
    const results = await runForEach(
      ids,
      async (id) => {
        if (await hasLeaveRecords(id)) blocked.add(id);
      },
      { concurrency: 6, onProgress: options.onProgress },
    );
    const failed = results.find((r) => !r.ok);
    if (failed) throw new AppError(failed.code ?? 'UNKNOWN');
    return blocked;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/**
 * Permanently deletes an employee and frees their Employee ID (the reservation is deleted in the
 * same commit; the Security Rules require that). The leave history is the audit trail, so an
 * employee WITH any balance or ledger entry is refused — archive them instead. (The rules cannot
 * query, so this guard lives here; a concurrent allocation between this check and the commit is
 * the one gap, see DEV-043.) Deleting an employee that is already gone counts as done.
 */
export async function deleteEmployee(employeeId: string): Promise<void> {
  const { db } = getFirebase();
  try {
    if (await hasLeaveRecords(employeeId)) throw new AppError('EMPLOYEE_HAS_RECORDS');
    const employeeRef = doc(db, COLLECTIONS.employees, employeeId);
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(employeeRef);
      if (!current.exists()) return;
      const key: unknown = current.get('employeeNumberKey');
      transaction.delete(employeeRef);
      if (typeof key === 'string') transaction.delete(doc(db, COLLECTIONS.employeeNumbers, key));
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

export function deleteEmployeesBulk(
  ids: readonly string[],
  options: BulkOptions = {},
): Promise<BulkActionResult[]> {
  return runForEach(ids, deleteEmployee, options);
}
