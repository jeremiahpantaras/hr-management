import { deleteApp } from 'firebase/app';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppEnv } from '@/lib/env';
import {
  AUTH_EMULATOR_URL,
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_EMULATOR_PORT,
  createFirebaseServices,
  type FirebaseServices,
} from '@/lib/firebase';

const demoFirebase = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-hr-leave.firebaseapp.com',
  projectId: 'demo-hr-leave',
  appId: '1:000000000000:web:demo',
} as const;

const created: FirebaseServices[] = [];

function create(env: AppEnv, name: string): FirebaseServices {
  const services = createFirebaseServices(env, name);
  created.push(services);
  return services;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(created.splice(0).map((services) => deleteApp(services.app)));
});

describe('createFirebaseServices', () => {
  it('initializes the app with the public web config', () => {
    const { app } = create({ firebase: demoFirebase, useEmulators: true }, 'test-config');
    expect(app.name).toBe('test-config');
    expect(app.options).toMatchObject(demoFirebase);
  });

  it('points Auth at the Auth emulator when emulators are enabled', () => {
    const { auth } = create({ firebase: demoFirebase, useEmulators: true }, 'test-auth-emu');
    expect(auth.emulatorConfig).toMatchObject({ host: '127.0.0.1', port: 9099 });
    expect(AUTH_EMULATOR_URL).toBe('http://127.0.0.1:9099');
  });

  it('points Firestore at the Firestore emulator when emulators are enabled', () => {
    const { db } = create({ firebase: demoFirebase, useEmulators: true }, 'test-fs-emu');
    expect(db.toJSON()).toMatchObject({
      settings: { host: `${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}` },
    });
  });

  it('does not touch the emulators when they are disabled', () => {
    const { auth, db } = create({ firebase: demoFirebase, useEmulators: false }, 'test-no-emu');
    expect(auth.emulatorConfig).toBeNull();
    expect(JSON.stringify(db.toJSON())).not.toContain('127.0.0.1');
  });
});

describe('getFirebase', () => {
  function stubValidEnv(): void {
    vi.stubEnv('VITE_FIREBASE_API_KEY', demoFirebase.apiKey);
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', demoFirebase.authDomain);
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', demoFirebase.projectId);
    vi.stubEnv('VITE_FIREBASE_APP_ID', demoFirebase.appId);
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
  }

  it('throws a descriptive error naming (not echoing) invalid variables', async () => {
    vi.resetModules();
    stubValidEnv();
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    const { getFirebase } = await import('@/lib/firebase');
    expect(() => getFirebase()).toThrow(/invalid environment \(VITE_FIREBASE_PROJECT_ID\)/);
  });

  it('returns one memoized instance when the environment is valid', async () => {
    vi.resetModules();
    stubValidEnv();
    const { getFirebase } = await import('@/lib/firebase');
    const first = getFirebase();
    created.push(first);
    expect(getFirebase()).toBe(first);
    expect(first.app.options.projectId).toBe('demo-hr-leave');
  });
});
