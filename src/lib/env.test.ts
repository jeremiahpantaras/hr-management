import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/lib/env';

const validRaw = {
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-hr-leave.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-hr-leave',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:demo',
  VITE_USE_FIREBASE_EMULATORS: 'true',
};

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

describe('parseEnv', () => {
  it('accepts a complete environment and maps it to typed config', () => {
    expect(parseEnv(validRaw)).toEqual({
      ok: true,
      env: {
        firebase: {
          apiKey: 'demo-api-key',
          authDomain: 'demo-hr-leave.firebaseapp.com',
          projectId: 'demo-hr-leave',
          appId: '1:000000000000:web:demo',
        },
        useEmulators: true,
      },
    });
  });

  it('ignores unrelated variables such as MODE and BASE_URL', () => {
    const result = parseEnv({ ...validRaw, MODE: 'development', BASE_URL: '/', DEV: true });
    expect(result.ok).toBe(true);
  });

  it('trims surrounding whitespace from values', () => {
    const result = parseEnv({ ...validRaw, VITE_FIREBASE_PROJECT_ID: '  demo-hr-leave  ' });
    expect(result.ok && result.env.firebase.projectId).toBe('demo-hr-leave');
  });

  describe('emulator flag', () => {
    it('is false when set to "false"', () => {
      const result = parseEnv({ ...validRaw, VITE_USE_FIREBASE_EMULATORS: 'false' });
      expect(result.ok && result.env.useEmulators).toBe(false);
    });

    it('defaults to false when omitted', () => {
      const { VITE_USE_FIREBASE_EMULATORS: _omitted, ...withoutFlag } = validRaw;
      const result = parseEnv(withoutFlag);
      expect(result.ok && result.env.useEmulators).toBe(false);
    });

    it.each(['yes', '1', 'TRUE', ''])('rejects the non-boolean value %j', (value) => {
      const result = parseEnv({ ...validRaw, VITE_USE_FIREBASE_EMULATORS: value });
      expect(result).toEqual({ ok: false, invalidKeys: ['VITE_USE_FIREBASE_EMULATORS'] });
    });
  });

  describe.each(requiredKeys)('required variable %s', (key) => {
    it('is reported when missing', () => {
      const { [key]: _removed, ...rest } = validRaw;
      expect(parseEnv(rest)).toEqual({ ok: false, invalidKeys: [key] });
    });

    it.each(['', '   '])('is reported when blank (%j)', (blank) => {
      expect(parseEnv({ ...validRaw, [key]: blank })).toEqual({ ok: false, invalidKeys: [key] });
    });

    it('is reported when not a string', () => {
      expect(parseEnv({ ...validRaw, [key]: 42 })).toEqual({ ok: false, invalidKeys: [key] });
    });
  });

  it('reports every invalid variable exactly once', () => {
    const result = parseEnv({ VITE_USE_FIREBASE_EMULATORS: 'maybe' });
    expect(result).toEqual({
      ok: false,
      invalidKeys: [...requiredKeys, 'VITE_USE_FIREBASE_EMULATORS'],
    });
  });

  it('never echoes variable values in a failed result', () => {
    const secret = 'super-secret-value-123';
    const result = parseEnv({
      ...validRaw,
      VITE_FIREBASE_API_KEY: secret,
      VITE_FIREBASE_APP_ID: '',
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
