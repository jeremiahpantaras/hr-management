import {
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
} from 'firebase/auth';

import { getFirebase } from '@/lib/firebase';
import { mapAuthError } from '@/services/auth.errors';
import type { AuthUser } from '@/types/models';

/**
 * Firebase Authentication — the only module that talks to the Auth SDK (Architecture §2).
 * There is deliberately NO sign-up function: accounts are provisioned in the Firebase console
 * (FR-AUTH-06/07, BR-AUTH-02).
 *
 * Session persistence is the Firebase default (browserLocalPersistence), so a signed-in user
 * stays signed in across refreshes and browser restarts (FR-AUTH-04).
 */

/** Signs in with email + password. Throws an `AuthServiceError` on failure. */
export async function signIn(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(getFirebase().auth, email, password);
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Signs in with a Google account in a pop-up. This is only a way to PROVE who someone is: access is
 * still decided by their `users/{uid}` profile (role + isActive), so a Google account without a
 * provisioned profile lands on "Access not available" and can read nothing. Keep Firebase's
 * self sign-up DISABLED so unknown Google accounts cannot even create an Auth user.
 * A closed window throws `POPUP_CLOSED`, which callers treat as "do nothing".
 */
export async function signInWithGoogle(): Promise<void> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(getFirebase().auth, provider);
  } catch (error) {
    throw mapAuthError(error);
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut(getFirebase().auth);
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Sends a password-reset email. An unknown address is reported as SUCCESS: the response must
 * never reveal whether an account exists (BR-AUTH-04). Invalid-email and network failures are
 * still surfaced.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebase().auth, email);
  } catch (error) {
    const mapped = mapAuthError(error);
    const cause: unknown = mapped.cause;
    const unknownAccount =
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === 'auth/user-not-found';
    if (unknownAccount) return;
    throw mapped;
  }
}

/**
 * Changes the signed-in user's own password (FR-AUTH-10). The current password is verified first
 * by re-authenticating; a wrong one is reported as `INVALID_CREDENTIALS`.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = getFirebase().auth.currentUser;
  if (user?.email == null) throw mapAuthError({ code: 'auth/requires-recent-login' });
  try {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, currentPassword),
    );
    await updatePassword(user, newPassword);
  } catch (error) {
    throw mapAuthError(error);
  }
}

/**
 * Subscribes to the signed-in identity (null when signed out). Fires once with the restored
 * session on startup, then on every sign-in / sign-out. Returns the unsubscribe function.
 */
export function subscribeToAuth(listener: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(getFirebase().auth, (user) => {
    listener(
      user
        ? {
            uid: user.uid,
            email: user.email,
            hasPassword: user.providerData.some((info) => info.providerId === 'password'),
          }
        : null,
    );
  });
}
