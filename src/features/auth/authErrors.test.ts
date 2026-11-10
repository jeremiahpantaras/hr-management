import { describe, expect, it } from 'vitest';

import { authErrorMessage } from '@/features/auth/authErrors';
import { AuthServiceError, mapAuthError } from '@/services/auth.errors';

const firebaseError = (code: string) =>
  Object.assign(new Error(`Firebase: Error (${code}).`), { code });

describe('mapAuthError → message', () => {
  it('wrong password, unknown email and invalid-credential are indistinguishable (FR-AUTH-11)', () => {
    const messages = ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential'].map(
      (code) => authErrorMessage(mapAuthError(firebaseError(code))),
    );
    expect(new Set(messages)).toEqual(new Set(['Incorrect email or password.']));
  });
});

describe('Google sign-in errors map to dedicated codes', () => {
  it.each([
    ['auth/popup-closed-by-user', 'POPUP_CLOSED'],
    ['auth/cancelled-popup-request', 'POPUP_CLOSED'],
    ['auth/popup-blocked', 'POPUP_BLOCKED'],
    ['auth/admin-restricted-operation', 'NOT_PERMITTED'],
    ['auth/operation-not-allowed', 'NOT_PERMITTED'],
    ['auth/account-exists-with-different-credential', 'DIFFERENT_SIGN_IN_METHOD'],
    ['auth/unauthorized-domain', 'UNAUTHORIZED_DOMAIN'],
  ] as const)('%s → %s', (code, expected) => {
    expect(mapAuthError(firebaseError(code)).code).toBe(expected);
  });
});

describe('authErrorMessage', () => {
  it.each([
    ['INVALID_CREDENTIALS', 'Incorrect email or password.'],
    ['INVALID_EMAIL', 'Enter a valid email address.'],
    ['USER_DISABLED', 'This account has been disabled. Contact your administrator.'],
    ['TOO_MANY_REQUESTS', 'Too many attempts. Wait a few minutes or reset your password.'],
    ['NETWORK', "Can't reach the server. Check your connection."],
    ['UNKNOWN', 'Something went wrong. Try again.'],
    ['POPUP_CLOSED', ''],
    [
      'POPUP_BLOCKED',
      'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    ],
    ['NOT_PERMITTED', "This Google account isn't set up for access. Contact your administrator."],
    [
      'DIFFERENT_SIGN_IN_METHOD',
      'This email already uses a different sign-in method. Sign in with your email and password.',
    ],
    [
      'UNAUTHORIZED_DOMAIN',
      "Google sign-in isn't enabled for this address. Contact your administrator.",
    ],
  ] as const)('%s', (code, text) => {
    expect(authErrorMessage(new AuthServiceError(code))).toBe(text);
  });

  it('never leaks raw error text for unexpected failures', () => {
    expect(authErrorMessage(new Error('Firebase: secret internal detail'))).toBe(
      'Something went wrong. Try again.',
    );
    expect(authErrorMessage('x')).toBe('Something went wrong. Try again.');
  });
});
