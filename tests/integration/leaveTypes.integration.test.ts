import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ErrorsModule from '@/domain/errors';
import type * as AuthErrorsModule from '@/services/auth.errors';
import type * as AuthServiceModule from '@/services/auth.service';
import type * as LeaveTypesServiceModule from '@/services/leaveTypes.service';
import type * as UsersServiceModule from '@/services/users.service';

import {
  PROJECT_ID,
  clearAuthUsers,
  createAuthUser,
  createRulesEnv,
  requireAuthEmulator,
  seedUserProfile,
} from '../setup/emulator';

/**
 * Integration (TC-LT-01/03/05/06 + TC-AUTH-10): the REAL leave type and account services against
 * the Firestore + Auth emulators and the repository's real `firestore.rules`.
 */
const PASSWORD = 'Password123!';

let rulesEnv: RulesTestEnvironment;
let leaveTypes: typeof LeaveTypesServiceModule;
let auth: typeof AuthServiceModule;
let users: typeof UsersServiceModule;
let errors: typeof ErrorsModule;
let authErrors: typeof AuthErrorsModule;
let hrUid: string;

beforeAll(async () => {
  requireAuthEmulator();
  rulesEnv = await createRulesEnv();
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'demo-api-key');
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', `${PROJECT_ID}.firebaseapp.com`);
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
  vi.stubEnv('VITE_FIREBASE_APP_ID', '1:000000000000:web:demo');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  vi.resetModules();
  [leaveTypes, auth, users, errors, authErrors] = await Promise.all([
    import('@/services/leaveTypes.service'),
    import('@/services/auth.service'),
    import('@/services/users.service'),
    import('@/domain/errors'),
    import('@/services/auth.errors'),
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
  hrUid = await createAuthUser('hr@example.test', PASSWORD);
  await seedUserProfile(rulesEnv, hrUid, { email: 'hr@example.test' });
  await auth.signIn('hr@example.test', PASSWORD);
});
afterEach(async () => {
  await auth.signOutUser();
});

let capture: Record<string, unknown> | null = null;
async function raw(path: string, id: string) {
  await rulesEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDoc(doc(context.firestore(), path, id));
    capture = snapshot.exists() ? snapshot.data() : null;
  });
  return capture;
}
async function count(path: string): Promise<number> {
  let size = 0;
  await rulesEnv.withSecurityRulesDisabled(async (context) => {
    size = (await getDocs(collection(context.firestore(), path))).size;
  });
  return size;
}
async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('TC-LT-01: create', () => {
  it('stores an active type with server metadata', async () => {
    const id = await leaveTypes.createLeaveType(
      { name: 'Vacation Leave', description: null },
      hrUid,
    );
    const stored = await raw('leaveTypes', id);
    expect(stored).toMatchObject({
      name: 'Vacation Leave',
      description: null,
      isActive: true,
      createdBy: hrUid,
      updatedBy: hrUid,
    });
    expect(stored?.createdAt).toBeDefined();
  });

  it('lists types sorted by name, as domain objects', async () => {
    await leaveTypes.createLeaveType({ name: 'Sick Leave', description: null }, hrUid);
    await leaveTypes.createLeaveType({ name: 'Emergency Leave', description: 'Urgent' }, hrUid);
    const list = await leaveTypes.listLeaveTypes();
    expect(list.map((type) => type.name)).toEqual(['Emergency Leave', 'Sick Leave']);
    expect(list[0]?.description).toBe('Urgent');
    expect(list[0]?.createdAt).toBeInstanceOf(Date);
  });
});

describe('BR-LT-03: duplicate names', () => {
  it('rejects a name that differs only by case or spacing, writing nothing', async () => {
    await leaveTypes.createLeaveType({ name: 'Vacation Leave', description: null }, hrUid);
    const error = await errorOf(
      leaveTypes.createLeaveType({ name: 'vacation leave', description: null }, hrUid),
    );
    expect(error).toBeInstanceOf(errors.AppError);
    expect((error as ErrorsModule.AppError).code).toBe('DUPLICATE_LEAVE_TYPE_NAME');
    expect(await count('leaveTypes')).toBe(1);
  });

  it('allows an edit that keeps its own name, and blocks renaming onto another type', async () => {
    const vacation = await leaveTypes.createLeaveType(
      { name: 'Vacation Leave', description: null },
      hrUid,
    );
    await leaveTypes.createLeaveType({ name: 'Sick Leave', description: null }, hrUid);
    await leaveTypes.updateLeaveType(vacation, { name: 'VACATION LEAVE', description: 'x' }, hrUid);
    const error = await errorOf(
      leaveTypes.updateLeaveType(vacation, { name: 'sick leave', description: null }, hrUid),
    );
    expect((error as ErrorsModule.AppError).code).toBe('DUPLICATE_LEAVE_TYPE_NAME');
  });
});

describe('TC-LT-03/05: rename, deactivate, reactivate', () => {
  it('renames and keeps createdAt/createdBy; updatedAt moves on', async () => {
    const id = await leaveTypes.createLeaveType(
      { name: 'Vacation Leave', description: null },
      hrUid,
    );
    const before = await raw('leaveTypes', id);
    await leaveTypes.updateLeaveType(id, { name: 'Annual Leave', description: 'Yearly' }, hrUid);
    const after = await raw('leaveTypes', id);
    expect(after).toMatchObject({ name: 'Annual Leave', description: 'Yearly', isActive: true });
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(after?.createdBy).toBe(hrUid);
  });

  it('deactivates and reactivates without touching anything else', async () => {
    const id = await leaveTypes.createLeaveType(
      { name: 'Vacation Leave', description: null },
      hrUid,
    );
    await leaveTypes.setLeaveTypeActive(id, false, hrUid);
    expect(await raw('leaveTypes', id)).toMatchObject({ isActive: false, name: 'Vacation Leave' });
    await leaveTypes.setLeaveTypeActive(id, true, hrUid);
    expect(await raw('leaveTypes', id)).toMatchObject({ isActive: true });
    expect(await count('leaveTypes')).toBe(1);
  });
});

describe('TC-LT-06: starter types', () => {
  it('creates three ordinary documents, and a re-run adds none', async () => {
    expect(await leaveTypes.addStarterLeaveTypes(hrUid)).toBe(3);
    const names = (await leaveTypes.listLeaveTypes()).map((type) => type.name);
    expect(names).toEqual(['Emergency Leave', 'Sick Leave', 'Vacation Leave']);
    expect(await leaveTypes.addStarterLeaveTypes(hrUid)).toBe(0);
    expect(await count('leaveTypes')).toBe(3);
  });

  it('only adds the missing ones', async () => {
    await leaveTypes.createLeaveType({ name: 'sick leave', description: null }, hrUid);
    expect(await leaveTypes.addStarterLeaveTypes(hrUid)).toBe(2);
    expect(await count('leaveTypes')).toBe(3);
  });
});

describe('authorization', () => {
  it('a signed-in user with an inactive profile cannot list or create', async () => {
    await auth.signOutUser();
    const uid = await createAuthUser('off@example.test', PASSWORD);
    await seedUserProfile(rulesEnv, uid, { email: 'off@example.test', isActive: false });
    await auth.signIn('off@example.test', PASSWORD);
    expect(((await errorOf(leaveTypes.listLeaveTypes())) as ErrorsModule.AppError).code).toBe(
      'PERMISSION_DENIED',
    );
    expect(
      (
        (await errorOf(
          leaveTypes.createLeaveType({ name: 'Nope', description: null }, uid),
        )) as ErrorsModule.AppError
      ).code,
    ).toBe('PERMISSION_DENIED');
  });
});

describe('TC-AUTH-10: account', () => {
  it('updateOwnName changes only the display name', async () => {
    const before = await raw('users', hrUid);
    await users.updateOwnName(hrUid, 'Maria S. Santos');
    const after = await raw('users', hrUid);
    expect(after).toMatchObject({
      fullName: 'Maria S. Santos',
      role: 'hr_admin',
      isActive: true,
      email: 'hr@example.test',
    });
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect((await users.getUserProfile(hrUid))?.fullName).toBe('Maria S. Santos');
  });

  it("cannot rename someone else's profile", async () => {
    const otherUid = await createAuthUser('other@example.test', PASSWORD);
    await seedUserProfile(rulesEnv, otherUid, { email: 'other@example.test' });
    expect(
      ((await errorOf(users.updateOwnName(otherUid, 'Hacked'))) as ErrorsModule.AppError).code,
    ).toBe('PERMISSION_DENIED');
  });

  it('changePassword with the right current password lets the user sign in with the new one', async () => {
    await auth.changePassword(PASSWORD, 'NewPassword456!');
    await auth.signOutUser();
    const stale = await errorOf(auth.signIn('hr@example.test', PASSWORD));
    expect((stale as AuthErrorsModule.AuthServiceError).code).toBe('INVALID_CREDENTIALS');
    await auth.signIn('hr@example.test', 'NewPassword456!');
  });

  it('a wrong current password is INVALID_CREDENTIALS and changes nothing', async () => {
    const error = await errorOf(auth.changePassword('not-the-password', 'NewPassword456!'));
    expect(error).toBeInstanceOf(authErrors.AuthServiceError);
    expect((error as AuthErrorsModule.AuthServiceError).code).toBe('INVALID_CREDENTIALS');
    await auth.signOutUser();
    await auth.signIn('hr@example.test', PASSWORD);
  });

  it('a too-weak new password is reported as WEAK_PASSWORD', async () => {
    const error = await errorOf(auth.changePassword(PASSWORD, '123'));
    expect((error as AuthErrorsModule.AuthServiceError).code).toBe('WEAK_PASSWORD');
  });
});
