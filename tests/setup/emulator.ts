import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc } from 'firebase/firestore';

/**
 * Helpers for emulator-backed suites (rules + integration). Everything here talks to the LOCAL
 * Firebase emulators for the demo project only; there is no way to reach a real project.
 */
export const PROJECT_ID = 'demo-hr-leave';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

export function requireFirestoreEmulator(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run this suite through `npm run test:rules` or ' +
        '`npm run test:integration` so the emulators are started for you.',
    );
  }
}

export function requireAuthEmulator(): void {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      'FIREBASE_AUTH_EMULATOR_HOST is not set. Run this suite through `npm run test:integration` ' +
        '(it starts the Auth and Firestore emulators).',
    );
  }
}

const RULES_PATH = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

/** A rules test environment loaded with the repository's real `firestore.rules`. */
export async function createRulesEnv(): Promise<RulesTestEnvironment> {
  requireFirestoreEmulator();
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
}

export interface UserProfileSeed {
  readonly fullName?: string;
  readonly email?: string;
  readonly role?: string;
  readonly isActive?: boolean;
}

const SEED_TIME = Timestamp.fromDate(new Date('2026-01-05T01:30:00Z'));

/** Writes `users/{uid}` with security rules disabled (what the console does at provisioning). */
export async function seedUserProfile(
  env: RulesTestEnvironment,
  uid: string,
  seed: UserProfileSeed = {},
): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      uid,
      fullName: seed.fullName ?? 'Maria Santos',
      email: seed.email ?? `${uid}@example.test`,
      role: seed.role ?? 'hr_admin',
      isActive: seed.isActive ?? true,
      createdAt: SEED_TIME,
      updatedAt: SEED_TIME,
    });
  });
}

/** Creates an Auth-emulator account and returns its uid. */
export async function createAuthUser(email: string, password: string): Promise<string> {
  requireAuthEmulator();
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    },
  );
  const body = (await response.json()) as { localId?: string; error?: { message: string } };
  if (!response.ok || !body.localId) {
    throw new Error(
      `Auth emulator sign-up failed: ${body.error?.message ?? String(response.status)}`,
    );
  }
  return body.localId;
}

/** Removes every account from the Auth emulator (test isolation). */
export async function clearAuthUsers(): Promise<void> {
  requireAuthEmulator();
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
}
