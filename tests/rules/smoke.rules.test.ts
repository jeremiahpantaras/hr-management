import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Smoke test: proves the Firestore emulator, Java, and the rules wiring all work, and that the
 * catch-all deny (everything except the `users` block, see users.rules.test.ts) really denies. Must run through `npm run test:rules`
 * (`firebase emulators:exec`), which provides FIRESTORE_EMULATOR_HOST.
 */
const PROJECT_ID = 'demo-hr-leave';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run this suite with `npm run test:rules` so the ' +
        'Firestore emulator is started for you.',
    );
  }

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Final catch-all: everything without a tested rules block stays denied', () => {
  it('deny an unauthenticated read and write', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'employees/anyone')));
    await assertFails(setDoc(doc(db, 'employees/anyone'), { fullName: 'Nobody' }));
  });

  it('deny an authenticated user on every collection that has no rules block yet', async () => {
    const db = testEnv.authenticatedContext('some-uid').firestore();
    for (const path of [
      'employees/x',
      'leaveTypes/x',
      'leaveBalances/x',
      'leaveTransactions/x',
      'unknown/x',
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { role: 'hr_admin' }));
    }
  });

  it('let the privileged test setup seed data that rules still hide from clients', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'employees/seeded'), { fullName: 'Seeded' });
      const seeded = await getDoc(doc(context.firestore(), 'employees/seeded'));
      expect(seeded.exists()).toBe(true);
    });

    const db = testEnv.authenticatedContext('some-uid').firestore();
    await assertFails(getDoc(doc(db, 'employees/seeded')));
  });
});
