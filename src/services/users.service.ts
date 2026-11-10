import { Timestamp, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { AppError } from '@/domain/errors';
import { getFirebase } from '@/lib/firebase';
import { mapFirebaseError } from '@/services/firestore/errors';
import { COLLECTIONS } from '@/services/firestore/paths';
import type { UserProfileDoc } from '@/types/firestore';
import type { UserProfile } from '@/types/models';

const toDate = (value: unknown): Date | null =>
  value instanceof Timestamp ? value.toDate() : null;

/**
 * Converts a stored profile to the domain model CONSERVATIVELY: anything missing or malformed
 * resolves to "no access" (`isActive` is true only for a real boolean `true`), never to access.
 */
function toUserProfile(uid: string, data: Partial<UserProfileDoc>): UserProfile {
  return {
    uid,
    fullName: typeof data.fullName === 'string' ? data.fullName : '',
    email: typeof data.email === 'string' ? data.email : '',
    role: typeof data.role === 'string' ? data.role : '',
    isActive: data.isActive === true,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Reads the caller's OWN authorization profile (`users/{uid}`), once, with no listener.
 * Returns `null` when no profile document exists. Security Rules allow this read for any
 * signed-in user — even an inactive one — so the app can say why access is denied.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(getFirebase().db, COLLECTIONS.users, uid));
  if (!snapshot.exists()) return null;
  return toUserProfile(uid, snapshot.data());
}

/**
 * Updates the caller's OWN display name — the only field the Security Rules let a user change
 * (BR-AUTH-03). `role`, `isActive` and `email` are never sent, so nothing can be escalated.
 */
export async function updateOwnName(uid: string, fullName: string): Promise<void> {
  if (uid === '') throw new AppError('PERMISSION_DENIED');
  try {
    await updateDoc(doc(getFirebase().db, COLLECTIONS.users, uid), {
      fullName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw mapFirebaseError(error);
  }
}
