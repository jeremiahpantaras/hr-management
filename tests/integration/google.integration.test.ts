import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AuthorizationModule from '@/domain/authorization';
import type * as FirebaseLibModule from '@/lib/firebase';
import type * as AuthServiceModule from '@/services/auth.service';
import type * as EmployeesServiceModule from '@/services/employees.service';
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
 * Google sign-in against the Auth emulator. The emulator accepts a fabricated Google credential
 * (a JSON id token), which is exactly what the Google pop-up would hand the SDK — so this exercises
 * the real SDK, the real auth/users services and the real Security Rules, without a pop-up.
 * The point: Google only proves WHO someone is; the provisioned `users/{uid}` profile still decides
 * what they may do.
 */
let rulesEnv: RulesTestEnvironment;
let auth: typeof AuthServiceModule;
let users: typeof UsersServiceModule;
let employees: typeof EmployeesServiceModule;
let firebase: typeof FirebaseLibModule;
let authorization: typeof AuthorizationModule;

beforeAll(async () => {
  requireAuthEmulator();
  rulesEnv = await createRulesEnv();
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:000000000000:web:demo');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.resetModules();
  [auth, users, employees, firebase, authorization] = await Promise.all([
    import('@/services/auth.service'),
    import('@/services/users.service'),
    import('@/services/employees.service'),
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

/** What the Google pop-up would return for this Google account. */
async function googleSignIn(email: string, sub = `google-${email}`): Promise<string> {
  const credential = GoogleAuthProvider.credential(
    JSON.stringify({ sub, email, email_verified: true, providerId: 'google.com' }),
  );
  const result = await signInWithCredential(firebase.getFirebase().auth, credential);
  return result.user.uid;
}

/** The first signed-in identity the app's own subscription reports. */
function currentAppUser(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const stop = auth.subscribeToAuth((user) => {
      stop();
      resolve(user);
    });
  });
}

describe('Google identity + the profile gate', () => {
  it('a Google user with NO profile is denied and can read nothing', async () => {
    const uid = await googleSignIn('stranger@example.test');
    const verdict = authorization.evaluateProfile(await users.getUserProfile(uid));
    expect(verdict).toMatchObject({ authorized: false, reason: 'no-profile' });
    await expect(employees.listEmployees()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('a Google user whose profile is active hr_admin is authorized and can read', async () => {
    const uid = await googleSignIn('maria@example.test');
    await seedUserProfile(rulesEnv, uid, { email: 'maria@example.test' });
    expect(authorization.evaluateProfile(await users.getUserProfile(uid))).toEqual({
      authorized: true,
    });
    await expect(employees.listEmployees()).resolves.toEqual([]);
  });

  it('a deactivated profile is refused even though Google signed them in', async () => {
    const uid = await googleSignIn('off@example.test');
    await seedUserProfile(rulesEnv, uid, { email: 'off@example.test', isActive: false });
    expect(authorization.evaluateProfile(await users.getUserProfile(uid))).toMatchObject({
      authorized: false,
      reason: 'inactive',
    });
    await expect(employees.listEmployees()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('the identity sent to the app flags a Google-only account as having no password', async () => {
    await googleSignIn('maria@example.test');
    expect(await currentAppUser()).toMatchObject({
      email: 'maria@example.test',
      hasPassword: false,
    });
  });

  it('an email/password user is reported as having a password', async () => {
    await createAuthUser('pw@example.test', 'Password123!');
    await auth.signIn('pw@example.test', 'Password123!');
    expect(await currentAppUser()).toMatchObject({ email: 'pw@example.test', hasPassword: true });
  });

  it('a user created with email/password who then signs in with the same Google email is the SAME uid (accounts link), so the existing profile applies', async () => {
    const passwordUid = await createAuthUser('maria@example.test', 'Password123!');
    await seedUserProfile(rulesEnv, passwordUid, { email: 'maria@example.test' });
    const googleUid = await googleSignIn('maria@example.test');
    expect(googleUid).toBe(passwordUid);
    expect(authorization.evaluateProfile(await users.getUserProfile(googleUid))).toEqual({
      authorized: true,
    });
  });

  it('changePassword is not possible for a Google-only account (no password credential)', async () => {
    await googleSignIn('maria@example.test');
    await expect(auth.changePassword('x', 'NewPassword456!')).rejects.toBeDefined();
  });
});
