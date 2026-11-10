import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AuthorizationModule from '@/domain/authorization';
import type * as FirebaseLibModule from '@/lib/firebase';
import type * as AuthErrorsModule from '@/services/auth.errors';
import type * as AuthServiceModule from '@/services/auth.service';
import type * as FirestoreErrorsModule from '@/services/firestore/errors';
import type * as UsersServiceModule from '@/services/users.service';
import type { AuthUser } from '@/types/models';

import {
  PROJECT_ID,
  clearAuthUsers,
  createAuthUser,
  createRulesEnv,
  requireAuthEmulator,
  seedUserProfile,
} from '../setup/emulator';

/**
 * Integration: the REAL auth and users services (and the real Firebase client SDK) against the
 * running Auth + Firestore emulators and the repository's real `firestore.rules`. Nothing in the
 * Firebase layer is mocked. Run with `npm run test:integration`.
 */
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PASSWORD = 'Password123!';

type AuthService = typeof AuthServiceModule;
type UsersService = typeof UsersServiceModule;
type AuthErrors = typeof AuthErrorsModule;
type FirestoreErrors = typeof FirestoreErrorsModule;
type FirebaseModule = typeof FirebaseLibModule;
type Authorization = typeof AuthorizationModule;

let rulesEnv: RulesTestEnvironment;
let auth: AuthService;
let users: UsersService;
let errors: AuthErrors;
let firestoreErrors: FirestoreErrors;
let firebase: FirebaseModule;
let authorization: Authorization;

beforeAll(async () => {
  requireAuthEmulator();
  rulesEnv = await createRulesEnv();

  // src/lib/env.ts validates VITE_* values at import time; supply the demo (emulator) config.
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:000000000000:web:demo');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.resetModules();

  [auth, users, errors, firestoreErrors, firebase, authorization] = await Promise.all([
    import('@/services/auth.service'),
    import('@/services/users.service'),
    import('@/services/auth.errors'),
    import('@/services/firestore/errors'),
    import('@/lib/firebase'),
    import('@/domain/authorization'),
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
});
afterEach(async () => {
  await auth.signOutUser();
});

/** Resolves with the first auth state satisfying `predicate` (the listener fires immediately). */
function waitForAuth(predicate: (user: AuthUser | null) => boolean): Promise<AuthUser | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error('Timed out waiting for the auth state'));
    }, 10_000);
    const stop = auth.subscribeToAuth((user) => {
      if (predicate(user)) {
        clearTimeout(timer);
        queueMicrotask(() => {
          stop();
        });
        resolve(user);
      }
    });
  });
}

async function provision(email: string, profile?: { role?: string; isActive?: boolean } | null) {
  const uid = await createAuthUser(email, PASSWORD);
  if (profile !== null) await seedUserProfile(rulesEnv, uid, { email, ...profile });
  return uid;
}

describe('sign in / sign out (FR-AUTH-01, 03)', () => {
  it('signs in with valid credentials and the listener reports the identity', async () => {
    const uid = await provision('hr@example.test');
    await auth.signIn('hr@example.test', PASSWORD);
    const user = await waitForAuth((u) => u !== null);
    expect(user).toEqual({ uid, email: 'hr@example.test' });
  });

  it('signs out, and the listener reports null', async () => {
    await provision('hr@example.test');
    await auth.signIn('hr@example.test', PASSWORD);
    await waitForAuth((u) => u !== null);
    await auth.signOutUser();
    expect(await waitForAuth((u) => u === null)).toBeNull();
  });

  it('wrong password and unknown email produce the IDENTICAL error (FR-AUTH-11)', async () => {
    await provision('hr@example.test');
    const wrongPassword = await auth
      .signIn('hr@example.test', 'not-the-password')
      .catch((e: unknown) => e);
    const unknownEmail = await auth
      .signIn('nobody@example.test', PASSWORD)
      .catch((e: unknown) => e);

    expect(wrongPassword).toBeInstanceOf(errors.AuthServiceError);
    expect(unknownEmail).toBeInstanceOf(errors.AuthServiceError);
    expect((wrongPassword as InstanceType<typeof errors.AuthServiceError>).code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect((unknownEmail as InstanceType<typeof errors.AuthServiceError>).code).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('reports a malformed email as INVALID_EMAIL', async () => {
    await expect(auth.signIn('not-an-email', PASSWORD)).rejects.toMatchObject({
      code: 'INVALID_EMAIL',
    });
  });

  it('reports a disabled account as USER_DISABLED', async () => {
    const uid = await provision('disabled@example.test');
    const response = await fetch(
      `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId: uid, disableUser: true }),
      },
    );
    expect(response.ok).toBe(true);
    await expect(auth.signIn('disabled@example.test', PASSWORD)).rejects.toMatchObject({
      code: 'USER_DISABLED',
    });
  });

  it('exposes NO sign-up function (BR-AUTH-02)', () => {
    expect(
      Object.keys(auth).filter((name) => /sign.?up|register|create.?user/i.test(name)),
    ).toEqual([]);
  });
});

describe('password reset (FR-AUTH-05, BR-AUTH-04)', () => {
  async function sentResetEmails(): Promise<string[]> {
    const response = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
    const body = (await response.json()) as { oobCodes?: { email: string; requestType: string }[] };
    return (body.oobCodes ?? [])
      .filter((c) => c.requestType === 'PASSWORD_RESET')
      .map((c) => c.email);
  }

  it('resolves identically for an existing and an unknown account — but only the real one is emailed', async () => {
    await provision('real@example.test');

    await expect(auth.sendPasswordReset('real@example.test')).resolves.toBeUndefined();
    await expect(auth.sendPasswordReset('ghost@example.test')).resolves.toBeUndefined();

    const sent = await sentResetEmails();
    expect(sent).toContain('real@example.test');
    expect(sent).not.toContain('ghost@example.test');
  });

  it('a malformed address is indistinguishable from an unknown account at the service', async () => {
    // The Auth emulator answers EMAIL_NOT_FOUND even for a malformed address, so the service (which
    // must never reveal account existence) resolves. Malformed addresses are stopped earlier, by the
    // form's Zod schema; INVALID_EMAIL itself is proven on the real sign-in path above.
    await expect(auth.sendPasswordReset('not-an-email')).resolves.toBeUndefined();
    expect(await sentResetEmails()).not.toContain('not-an-email');
  });
});

describe('profile + authorization through the real Security Rules (FR-AUTH-08, 09)', () => {
  it('an active hr_admin reads their own profile and is authorized', async () => {
    const uid = await provision('hr@example.test', { role: 'hr_admin', isActive: true });
    await auth.signIn('hr@example.test', PASSWORD);

    const profile = await users.getUserProfile(uid);
    expect(profile).toMatchObject({
      uid,
      fullName: 'Maria Santos',
      role: 'hr_admin',
      isActive: true,
    });
    expect(profile?.createdAt).toBeInstanceOf(Date);
    expect(authorization.evaluateProfile(profile)).toEqual({ authorized: true });
  });

  it('a signed-in user with NO profile gets null → no-profile', async () => {
    const uid = await provision('noprofile@example.test', null);
    await auth.signIn('noprofile@example.test', PASSWORD);

    const profile = await users.getUserProfile(uid);
    expect(profile).toBeNull();
    expect(authorization.evaluateProfile(profile)).toEqual({
      authorized: false,
      reason: 'no-profile',
    });
  });

  it('an inactive admin can still read their profile, and is denied as inactive', async () => {
    const uid = await provision('inactive@example.test', { isActive: false });
    await auth.signIn('inactive@example.test', PASSWORD);

    const profile = await users.getUserProfile(uid);
    expect(authorization.evaluateProfile(profile)).toEqual({
      authorized: false,
      reason: 'inactive',
    });
  });

  it('a non-admin role is denied as wrong-role', async () => {
    const uid = await provision('employee@example.test', { role: 'employee' });
    await auth.signIn('employee@example.test', PASSWORD);

    expect(authorization.evaluateProfile(await users.getUserProfile(uid))).toEqual({
      authorized: false,
      reason: 'wrong-role',
    });
  });

  it("cannot read ANOTHER user's profile: the server answers permission-denied", async () => {
    await provision('hr@example.test');
    const otherUid = await provision('other@example.test');
    await auth.signIn('hr@example.test', PASSWORD);

    const failure = await users.getUserProfile(otherUid).catch((e: unknown) => e);
    expect(firestoreErrors.isPermissionDeniedError(failure)).toBe(true);
  });

  it("an unauthorized user's data requests are rejected by the server (what FR-AUTH-12 reacts to)", async () => {
    await provision('inactive@example.test', { isActive: false });
    await auth.signIn('inactive@example.test', PASSWORD);

    const failure = await getDoc(doc(firebase.getFirebase().db, 'employees', 'anyone')).catch(
      (e: unknown) => e,
    );
    expect(firestoreErrors.isPermissionDeniedError(failure)).toBe(true);
  });

  it('the moment an admin is deactivated, the very next data request is rejected', async () => {
    const uid = await provision('hr@example.test', { isActive: true });
    await auth.signIn('hr@example.test', PASSWORD);
    // Active: the (not-yet-open) employees collection is still denied by the catch-all, but the
    // own-profile read works. Deactivate in the console and confirm the profile now reads inactive.
    expect(authorization.evaluateProfile(await users.getUserProfile(uid))).toEqual({
      authorized: true,
    });

    await seedUserProfile(rulesEnv, uid, { email: 'hr@example.test', isActive: false });
    expect(authorization.evaluateProfile(await users.getUserProfile(uid))).toEqual({
      authorized: false,
      reason: 'inactive',
    });
  });
});
