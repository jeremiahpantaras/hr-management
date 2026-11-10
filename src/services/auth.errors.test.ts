import { describe, expect, it } from 'vitest';

import { AuthServiceError, mapAuthError } from '@/services/auth.errors';
import { isPermissionDeniedError } from '@/services/firestore/errors';

const firebaseError = (code: string) =>
  Object.assign(new Error(`Firebase: Error (${code}).`), { code });

describe('mapAuthError (Security §4.4)', () => {
  it.each([
    ['auth/invalid-credential', 'INVALID_CREDENTIALS'],
    ['auth/wrong-password', 'INVALID_CREDENTIALS'],
    ['auth/user-not-found', 'INVALID_CREDENTIALS'],
    ['auth/invalid-login-credentials', 'INVALID_CREDENTIALS'],
    ['auth/invalid-email', 'INVALID_EMAIL'],
    ['auth/missing-email', 'INVALID_EMAIL'],
    ['auth/user-disabled', 'USER_DISABLED'],
    ['auth/too-many-requests', 'TOO_MANY_REQUESTS'],
    ['auth/network-request-failed', 'NETWORK'],
    ['auth/something-new', 'UNKNOWN'],
    ['auth/internal-error', 'UNKNOWN'],
  ])('%s → %s', (code, expected) => {
    expect(mapAuthError(firebaseError(code)).code).toBe(expected);
  });

  it('keeps the original error as `cause` for debugging', () => {
    const original = firebaseError('auth/user-disabled');
    expect(mapAuthError(original).cause).toBe(original);
  });

  it('is idempotent and tolerates non-Error values', () => {
    const mapped = new AuthServiceError('NETWORK');
    expect(mapAuthError(mapped)).toBe(mapped);
    expect(mapAuthError(undefined).code).toBe('UNKNOWN');
    expect(mapAuthError('boom').code).toBe('UNKNOWN');
    expect(mapAuthError({ code: 42 }).code).toBe('UNKNOWN');
  });
});

describe('isPermissionDeniedError', () => {
  it('recognises Firestore permission-denied errors only', () => {
    expect(isPermissionDeniedError(firebaseError('permission-denied'))).toBe(true);
    expect(isPermissionDeniedError(firebaseError('firestore/permission-denied'))).toBe(true);
    expect(isPermissionDeniedError(firebaseError('unavailable'))).toBe(false);
    expect(isPermissionDeniedError(new Error('permission-denied'))).toBe(false);
    expect(isPermissionDeniedError(null)).toBe(false);
    expect(isPermissionDeniedError('permission-denied')).toBe(false);
  });
});
