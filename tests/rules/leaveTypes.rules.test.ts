import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { createRulesEnv, seedUserProfile } from '../setup/emulator';

/** TC-RULES-LT-01…05 (+ adversarial extras) against the real `firestore.rules`. */
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createRulesEnv();
});
afterAll(async () => {
  await env.cleanup();
});

const SEED_TIME = Timestamp.fromDate(new Date('2026-01-04T08:00:00Z'));

function storedType(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Vacation Leave',
    description: null,
    isActive: true,
    createdAt: SEED_TIME,
    createdBy: 'hr1',
    updatedAt: SEED_TIME,
    updatedBy: 'hr1',
    ...overrides,
  };
}

beforeEach(async () => {
  await env.clearFirestore();
  await seedUserProfile(env, 'hr1');
  await seedUserProfile(env, 'inactive1', { isActive: false });
  await seedUserProfile(env, 'wrongrole1', { role: 'employee' });
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'leaveTypes', 'vac'), storedType());
  });
});

const hr = () => env.authenticatedContext('hr1').firestore();

function newType(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Sick Leave',
    description: 'Illness',
    isActive: true,
    createdAt: serverTimestamp(),
    createdBy: 'hr1',
    updatedAt: serverTimestamp(),
    updatedBy: 'hr1',
    ...overrides,
  };
}
function typeUpdate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Vacation Leave',
    description: null,
    isActive: true,
    createdAt: SEED_TIME,
    createdBy: 'hr1',
    updatedAt: serverTimestamp(),
    updatedBy: 'hr1',
    ...overrides,
  };
}

describe('access (TC-RULES-USR-01/02 for leaveTypes)', () => {
  it('denies everything to anonymous, profile-less, inactive and wrong-role users', async () => {
    const contexts = [
      env.unauthenticatedContext(),
      env.authenticatedContext('nobody'),
      env.authenticatedContext('inactive1'),
      env.authenticatedContext('wrongrole1'),
    ];
    for (const context of contexts) {
      const db = context.firestore();
      await assertFails(getDoc(doc(db, 'leaveTypes', 'vac')));
      await assertFails(getDocs(collection(db, 'leaveTypes')));
      await assertFails(
        setDoc(doc(db, 'leaveTypes', 'new'), newType({ createdBy: 'x', updatedBy: 'x' })),
      );
      await assertFails(updateDoc(doc(db, 'leaveTypes', 'vac'), typeUpdate()));
    }
  });
  it('lets an active HR admin read one and list all', async () => {
    await assertSucceeds(getDoc(doc(hr(), 'leaveTypes', 'vac')));
    await assertSucceeds(getDocs(collection(hr(), 'leaveTypes')));
  });
});

describe('create (TC-RULES-LT-01/03)', () => {
  it('allows a valid type, with or without a description', async () => {
    await assertSucceeds(setDoc(doc(hr(), 'leaveTypes', 'a'), newType()));
    await assertSucceeds(
      setDoc(doc(hr(), 'leaveTypes', 'b'), newType({ name: 'Emergency Leave', description: null })),
    );
  });
  it('allows the starter batch (three documents in one commit)', async () => {
    const db = hr();
    const batch = writeBatch(db);
    for (const name of ['Vacation Leave 2', 'Sick Leave', 'Emergency Leave']) {
      batch.set(doc(collection(db, 'leaveTypes')), newType({ name }));
    }
    await assertSucceeds(batch.commit());
  });
  it.each([
    ['an extra field', { extra: 1 }],
    ['an empty name', { name: '' }],
    ['a 61-character name', { name: 'x'.repeat(61) }],
    ['an untrimmed name', { name: ' Sick ' }],
    ['a non-string name', { name: 5 }],
    ['an empty description', { description: '' }],
    ['a 201-character description', { description: 'x'.repeat(201) }],
    ['a non-boolean isActive', { isActive: 'yes' }],
    ['a client-supplied createdAt', { createdAt: Timestamp.fromDate(new Date('2020-01-01')) }],
    ['a spoofed createdBy', { createdBy: 'someone-else' }],
    ['a spoofed updatedBy', { updatedBy: 'someone-else' }],
    ['a stale updatedAt', { updatedAt: Timestamp.fromDate(new Date('2020-01-01')) }],
  ])('denies %s', async (_label, overrides) => {
    await assertFails(setDoc(doc(hr(), 'leaveTypes', 'bad'), newType(overrides)));
  });
  it('denies a missing field', async () => {
    const { description: _omitted, ...withoutDescription } = newType();
    await assertFails(setDoc(doc(hr(), 'leaveTypes', 'bad'), withoutDescription));
  });
  it('accepts exactly 60-character names and 200-character descriptions', async () => {
    await assertSucceeds(
      setDoc(
        doc(hr(), 'leaveTypes', 'max'),
        newType({ name: 'x'.repeat(60), description: 'y'.repeat(200) }),
      ),
    );
  });
});

describe('update (TC-RULES-LT-01/04/05)', () => {
  it('allows renaming and re-describing', async () => {
    await assertSucceeds(
      updateDoc(
        doc(hr(), 'leaveTypes', 'vac'),
        typeUpdate({ name: 'Annual Leave', description: 'Yearly' }),
      ),
    );
  });
  it('allows deactivating and reactivating (TC-RULES-LT-04)', async () => {
    await assertSucceeds(
      updateDoc(doc(hr(), 'leaveTypes', 'vac'), typeUpdate({ isActive: false })),
    );
    await assertSucceeds(updateDoc(doc(hr(), 'leaveTypes', 'vac'), typeUpdate({ isActive: true })));
  });
  it('denies changing createdAt or createdBy (TC-RULES-LT-05)', async () => {
    await assertFails(
      updateDoc(
        doc(hr(), 'leaveTypes', 'vac'),
        typeUpdate({ createdAt: Timestamp.fromDate(new Date('2020-01-01')) }),
      ),
    );
    await assertFails(
      updateDoc(doc(hr(), 'leaveTypes', 'vac'), typeUpdate({ createdBy: 'someone-else' })),
    );
  });
  it('denies a spoofed updatedBy or a bad shape', async () => {
    await assertFails(updateDoc(doc(hr(), 'leaveTypes', 'vac'), typeUpdate({ updatedBy: 'x' })));
    await assertFails(updateDoc(doc(hr(), 'leaveTypes', 'vac'), typeUpdate({ name: '' })));
    await assertFails(updateDoc(doc(hr(), 'leaveTypes', 'vac'), typeUpdate({ extra: true })));
  });
});

describe('delete (TC-RULES-LT-02)', () => {
  it('denies deleting a leave type', async () => {
    await assertFails(deleteDoc(doc(hr(), 'leaveTypes', 'vac')));
  });
});

describe('deactivation takes effect on the next request (TC-RULES-USR-06)', () => {
  it('denies the same user once their profile is deactivated', async () => {
    const db = hr();
    await assertSucceeds(getDoc(doc(db, 'leaveTypes', 'vac')));
    await seedUserProfile(env, 'hr1', { isActive: false });
    await assertFails(getDoc(doc(db, 'leaveTypes', 'vac')));
  });
});
