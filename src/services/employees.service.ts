import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
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
