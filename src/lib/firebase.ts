import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

import { envResult, type AppEnv } from '@/lib/env';

/** Emulator endpoints — must match firebase.json. */
export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1';
export const FIRESTORE_EMULATOR_PORT = 8080;

export interface FirebaseServices {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
}

/**
 * Initializes the Firebase app, Auth and Firestore from validated config. When
 * `env.useEmulators` is true, Auth and Firestore are pointed at the local emulators.
 *
 * Firestore offline persistence is deliberately NOT enabled (planning assumption A-06):
 * leave transactions need connectivity, and a memory cache avoids stale multi-tab data.
 */
export function createFirebaseServices(env: AppEnv, appName?: string): FirebaseServices {
  const app = initializeApp({ ...env.firebase }, appName);
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (env.useEmulators) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
    connectFirestoreEmulator(db, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  }

  return { app, auth, db };
}

let services: FirebaseServices | undefined;

/**
 * Lazily initialized, memoized Firebase services for the running app. A function (rather than
 * module-level singletons) lets an invalid environment render the Configuration error screen
 * instead of crashing at import time.
 */
export function getFirebase(): FirebaseServices {
  if (services) return services;

  if (!envResult.ok) {
    throw new Error(
      `Firebase cannot initialize: invalid environment (${envResult.invalidKeys.join(', ')})`,
    );
  }

  services = createFirebaseServices(envResult.env);
  return services;
}
