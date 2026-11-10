import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createRulesEnv, seedUserProfile } from '../setup/emulator';

/**
 * TC-RULES-USR-01…06 (planning/BUSINESS_RULES_AND_TEST_CASES.md §B.12) against the REAL
 * `firestore.rules` in the Firestore emulator. Each test seeds fresh data via the privileged
 * (rules-disabled) path, then attacks through client contexts.
 *
 * Actors: anonymous · noProfile (signed in, no users doc) · inactiveHr · wrongRole · hr (active).
 */
let env: RulesTestEnvironment;

const COLLECTIONS = [
  'users',
  'employees',
  'employeeNumbers',
  'leaveTypes',
  'leaveBalances',
  'leaveTransactions',
] as const;

beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedUserProfile(env, 'hr1', { fullName: 'Maria Santos' });
  await seedUserProfile(env, 'hr2', { fullName: 'Another Admin' });
  await seedUserProfile(env, 'inactive1', { isActive: false });
  await seedUserProfile(env, 'wrongrole1', { role: 'employee' });
  // `noProfile1` is deliberately NOT seeded.
});

const anonymous = () => env.unauthenticatedContext().firestore();
const noProfile = () => env.authenticatedContext('noProfile1').firestore();
const inactiveHr = () => env.authenticatedContext('inactive1').firestore();
const wrongRole = () => env.authenticatedContext('wrongrole1').firestore();
const hr = () => env.authenticatedContext('hr1').firestore();

type Db = ReturnType<typeof anonymous>;

/** Every operation a client can attempt on one collection/document path. */
async function expectAllDenied(db: Db, collectionName: string): Promise<void> {
  const ref = doc(db, collectionName, 'someDoc');
  await assertFails(getDoc(ref));
  await assertFails(getDocs(collection(db, collectionName)));
  await assertFails(setDoc(ref, { x: 1 }));
  await assertFails(updateDoc(ref, { x: 2 }));
  await assertFails(deleteDoc(ref));
}

describe('TC-RULES-USR-01: anonymous', () => {
  it.each(COLLECTIONS)('is denied every operation on %s', async (name) => {
    await expectAllDenied(anonymous(), name);
  });

  it('cannot read a real profile either', async () => {
    await assertFails(getDoc(doc(anonymous(), 'users', 'hr1')));
  });
});

describe('TC-RULES-USR-02: signed in but not an active HR admin', () => {
  const actors = [
    ['noProfile', noProfile],
    ['inactiveHr', inactiveHr],
    ['wrongRole', wrongRole],
  ] as const;

  describe.each(actors)('%s', (_name, actor) => {
    it.each(COLLECTIONS.filter((c) => c !== 'users'))(
      'is denied every operation on %s',
      async (name) => {
        await expectAllDenied(actor(), name);
      },
    );

    it("is denied list / create / delete on users, and any other user's profile", async () => {
      const db = actor();
      await assertFails(getDocs(collection(db, 'users')));
      await assertFails(getDoc(doc(db, 'users', 'hr1')));
      await assertFails(setDoc(doc(db, 'users', 'hr1'), { role: 'hr_admin' }));
      await assertFails(deleteDoc(doc(db, 'users', 'hr1')));
    });
  });

  it('can read ONLY its own profile (so the app can explain why access is denied)', async () => {
    await assertSucceeds(getDoc(doc(inactiveHr(), 'users', 'inactive1')));
    await assertSucceeds(getDoc(doc(wrongRole(), 'users', 'wrongrole1')));
    const missing = await assertSucceeds(getDoc(doc(noProfile(), 'users', 'noProfile1')));
    expect(missing.exists()).toBe(false);
  });

  it('cannot edit even its own profile (updates need an ACTIVE hr_admin)', async () => {
    const patch = { fullName: 'Renamed', updatedAt: serverTimestamp() };
    await assertFails(updateDoc(doc(inactiveHr(), 'users', 'inactive1'), patch));
    await assertFails(updateDoc(doc(wrongRole(), 'users', 'wrongrole1'), patch));
  });

  it('cannot self-promote: a non-admin writing role/isActive on their own doc is denied', async () => {
    await assertFails(
      updateDoc(doc(wrongRole(), 'users', 'wrongrole1'), {
        role: 'hr_admin',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(inactiveHr(), 'users', 'inactive1'), {
        isActive: true,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a profile that lacks role/isActive fields grants nothing', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'broken1'), {
        uid: 'broken1',
        fullName: 'Broken',
      });
    });
    const db = env.authenticatedContext('broken1').firestore();
    await assertFails(getDocs(collection(db, 'employees')));
    await assertFails(
      updateDoc(doc(db, 'users', 'broken1'), { fullName: 'X', updatedAt: serverTimestamp() }),
    );
  });
});

describe('TC-RULES-USR-03: an active HR admin cannot escalate or alter privileges', () => {
  const own = () => doc(hr(), 'users', 'hr1');

  it.each([
    ['role', { role: 'super_admin' }],
    ['isActive', { isActive: false }],
    ['email', { email: 'attacker@example.test' }],
    ['uid', { uid: 'someone-else' }],
    ['createdAt', { createdAt: serverTimestamp() }],
  ])('cannot change %s', async (_field, change) => {
    await assertFails(updateDoc(own(), { ...change, updatedAt: serverTimestamp() }));
  });

  it('writing a forbidden field back to its EXISTING value changes nothing, so it is not an escalation', async () => {
    // `affectedKeys` only contains fields whose value actually changes (no-op writes are harmless).
    await assertSucceeds(
      updateDoc(own(), { fullName: 'Renamed', role: 'hr_admin', updatedAt: serverTimestamp() }),
    );
  });

  it('cannot smuggle a forbidden CHANGE in alongside a permitted one', async () => {
    await assertFails(
      updateDoc(own(), { fullName: 'Renamed', role: 'super_admin', updatedAt: serverTimestamp() }),
    );
  });

  it('cannot add an arbitrary new field', async () => {
    await assertFails(updateDoc(own(), { isSuperUser: true, updatedAt: serverTimestamp() }));
  });
});

describe('TC-RULES-USR-04: the one permitted write', () => {
  it('lets an active HR admin change their own fullName with updatedAt = request.time', async () => {
    await assertSucceeds(
      updateDoc(doc(hr(), 'users', 'hr1'), {
        fullName: 'Maria S. Santos',
        updatedAt: serverTimestamp(),
      }),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      const stored = await getDoc(doc(context.firestore(), 'users', 'hr1'));
      expect(stored.get('fullName')).toBe('Maria S. Santos');
      expect(stored.get('role')).toBe('hr_admin'); // untouched
      expect(stored.get('isActive')).toBe(true);
    });
  });

  it('rejects invalid names: empty, too long, untrimmed, wrong type', async () => {
    const ref = doc(hr(), 'users', 'hr1');
    await assertFails(updateDoc(ref, { fullName: '', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { fullName: 'x'.repeat(101), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { fullName: '  Padded  ', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { fullName: 42, updatedAt: serverTimestamp() }));
    await assertSucceeds(
      updateDoc(ref, { fullName: 'x'.repeat(100), updatedAt: serverTimestamp() }),
    );
  });

  it('rejects a client-supplied timestamp (updatedAt must equal request.time)', async () => {
    await assertFails(
      updateDoc(doc(hr(), 'users', 'hr1'), {
        fullName: 'Renamed',
        updatedAt: new Date('2000-01-01'),
      }),
    );
  });
});

describe('TC-RULES-USR-05: profiles are provisioned in the console only', () => {
  it("denies create and delete of any profile, including the admin's own", async () => {
    const db = hr();
    await assertFails(
      setDoc(doc(db, 'users', 'newUser'), {
        uid: 'newUser',
        fullName: 'New',
        email: 'n@example.test',
        role: 'hr_admin',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(deleteDoc(doc(db, 'users', 'hr1')));
    await assertFails(deleteDoc(doc(db, 'users', 'hr2')));
  });

  it("cannot read or edit ANOTHER user's profile, nor list users", async () => {
    const db = hr();
    await assertFails(getDoc(doc(db, 'users', 'hr2')));
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(
      updateDoc(doc(db, 'users', 'hr2'), { fullName: 'Hijacked', updatedAt: serverTimestamp() }),
    );
  });

  it('cannot overwrite its own profile with setDoc (replacement would change role/isActive)', async () => {
    await assertFails(
      setDoc(doc(hr(), 'users', 'hr1'), {
        uid: 'hr1',
        fullName: 'Maria',
        email: 'x@example.test',
        role: 'hr_admin',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('TC-RULES-USR-06: deactivation takes effect on the very next request', () => {
  it('an HR admin loses all access the moment isActive flips to false', async () => {
    const db = hr();
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'hr1'), {
        fullName: 'Still active',
        updatedAt: serverTimestamp(),
      }),
    );

    // The console flips the flag; the user's session and token are untouched.
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', 'hr1'), { isActive: false });
    });

    await assertFails(
      updateDoc(doc(db, 'users', 'hr1'), { fullName: 'Too late', updatedAt: serverTimestamp() }),
    );
    // They can still read their own profile, which is how the app learns why it is blocked.
    const profile = await assertSucceeds(getDoc(doc(db, 'users', 'hr1')));
    expect(profile.get('isActive')).toBe(false);
  });

  it('demoting the role has the same immediate effect', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', 'hr1'), { role: 'employee' });
    });
    await assertFails(
      updateDoc(doc(hr(), 'users', 'hr1'), { fullName: 'Nope', updatedAt: serverTimestamp() }),
    );
  });
});
