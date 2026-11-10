import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { STARTER_LEAVE_TYPES } from '@/domain/constants';
import { AppError } from '@/domain/errors';
import { isDuplicateLeaveTypeName, type LeaveTypeInput } from '@/domain/schemas/leaveType';
import { getFirebase } from '@/lib/firebase';
import { toLeaveType } from '@/services/firestore/converters';
import { mapFirebaseError } from '@/services/firestore/errors';
import { COLLECTIONS } from '@/services/firestore/paths';
import type { LeaveType } from '@/types/models';

/**
 * Leave type data access (FR-LT-*, DB design §6.6). Leave types are never deleted; they are
 * deactivated. Name uniqueness (case-insensitive, A-05) is checked by the caller against the
 * cached list and re-checked here against the list as read now, so a stale cache cannot create a
 * duplicate through this code path.
 */

/** All leave types sorted by name (the cache holds them all; filtering is client-side). */
export async function listLeaveTypes(): Promise<LeaveType[]> {
  try {
    const snapshot = await getDocs(collection(getFirebase().db, COLLECTIONS.leaveTypes));
    return snapshot.docs
      .flatMap((document) => {
        const type = toLeaveType(document.id, document.data());
        return type ? [type] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

async function assertNameFree(name: string, ignoreId?: string): Promise<void> {
  const current = await listLeaveTypes();
  if (isDuplicateLeaveTypeName(name, current, ignoreId)) {
    throw new AppError('DUPLICATE_LEAVE_TYPE_NAME');
  }
}

export async function createLeaveType(input: LeaveTypeInput, actorUid: string): Promise<string> {
  try {
    await assertNameFree(input.name);
    const reference = await addDoc(collection(getFirebase().db, COLLECTIONS.leaveTypes), {
      name: input.name,
      description: input.description,
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: actorUid,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
    return reference.id;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Renames / re-describes a type. History keeps its name snapshots (BR-LT-04). */
export async function updateLeaveType(
  leaveTypeId: string,
  input: LeaveTypeInput,
  actorUid: string,
): Promise<void> {
  try {
    await assertNameFree(input.name, leaveTypeId);
    await updateDoc(doc(getFirebase().db, COLLECTIONS.leaveTypes, leaveTypeId), {
      name: input.name,
      description: input.description,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Deactivate (`false`) or reactivate (`true`). Balances and history are untouched (BR-LT-02). */
export async function setLeaveTypeActive(
  leaveTypeId: string,
  isActive: boolean,
  actorUid: string,
): Promise<void> {
  try {
    await updateDoc(doc(getFirebase().db, COLLECTIONS.leaveTypes, leaveTypeId), {
      isActive,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}

/** Adds the starter types that do not exist yet, as ordinary documents in one batch (FR-LT-07). */
export async function addStarterLeaveTypes(actorUid: string): Promise<number> {
  try {
    const { db } = getFirebase();
    const current = await listLeaveTypes();
    const missing = STARTER_LEAVE_TYPES.filter((name) => !isDuplicateLeaveTypeName(name, current));
    if (missing.length === 0) return 0;
    const batch = writeBatch(db);
    for (const name of missing) {
      batch.set(doc(collection(db, COLLECTIONS.leaveTypes)), {
        name,
        description: null,
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      });
    }
    await batch.commit();
    return missing.length;
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
