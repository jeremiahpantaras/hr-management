import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { getFirebase } from '@/lib/firebase';
import { toLeaveBalance } from '@/services/firestore/converters';
import { mapFirebaseError } from '@/services/firestore/errors';
import { COLLECTIONS } from '@/services/firestore/paths';
import { makeBalanceId } from '@/domain/ledger';
import type { LeaveBalance } from '@/types/models';

/** Balance reads (DB design §8.3, §8.4, §8.8). Balances are written only by the ledger service. */

/** Firestore's `in` operator takes at most 30 values. */
const IN_LIMIT = 30;

function toBalances(docs: readonly QueryDocumentSnapshot<DocumentData>[]): LeaveBalance[] {
  return docs.flatMap((snapshot) => {
    const balance = toLeaveBalance(snapshot.id, snapshot.data());
    return balance ? [balance] : [];
  });
}

const balances = () => collection(getFirebase().db, COLLECTIONS.leaveBalances);

/** One balance, or `null` when no credits were ever allocated for that employee × year × type. */
export async function getBalance(
  employeeId: string,
  year: number,
  leaveTypeId: string,
): Promise<LeaveBalance | null> {
  try {
    const snapshot = await getDoc(
      doc(
        getFirebase().db,
        COLLECTIONS.leaveBalances,
        makeBalanceId(employeeId, year, leaveTypeId),
      ),
    );
    return snapshot.exists() ? toLeaveBalance(snapshot.id, snapshot.data()) : null;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Every balance of one employee for a year (at most one per leave type). */
export async function getBalancesForEmployeeYear(
  employeeId: string,
  year: number,
): Promise<LeaveBalance[]> {
  try {
    const snapshot = await getDocs(
      query(balances(), where('employeeId', '==', employeeId), where('year', '==', year)),
    );
    return toBalances(snapshot.docs);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Balances for a set of employees in a year, in chunks of 30 (the `in` limit). */
export async function getBalancesForEmployees(
  employeeIds: readonly string[],
  year: number,
): Promise<LeaveBalance[]> {
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < employeeIds.length; i += IN_LIMIT) {
      chunks.push(employeeIds.slice(i, i + IN_LIMIT));
    }
    const results = await Promise.all(
      chunks.map((ids) =>
        getDocs(query(balances(), where('year', '==', year), where('employeeId', 'in', ids))),
      ),
    );
    return results.flatMap((snapshot) => toBalances(snapshot.docs));
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Every balance of a year — reports and the dashboard fallback (DB §8.8). */
export async function getYearBalances(year: number): Promise<LeaveBalance[]> {
  try {
    const snapshot = await getDocs(query(balances(), where('year', '==', year)));
    return toBalances(snapshot.docs);
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
