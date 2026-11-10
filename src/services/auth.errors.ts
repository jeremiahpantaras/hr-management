/**
 * Stable, Firebase-free error codes for authentication. Features map these to user-facing copy
 * (src/features/auth/authErrors.ts); they never see Firebase's raw error codes or messages.
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_EMAIL'
  | 'USER_DISABLED'
  | 'WEAK_PASSWORD'
  | 'REQUIRES_RECENT_LOGIN'
  | 'POPUP_CLOSED'
  | 'POPUP_BLOCKED'
  | 'NOT_PERMITTED'
  | 'DIFFERENT_SIGN_IN_METHOD'
  | 'UNAUTHORIZED_DOMAIN'
  | 'TOO_MANY_REQUESTS'
  | 'NETWORK'
  | 'UNKNOWN';

export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, options?: ErrorOptions) {
    super(code, options);
    this.name = 'AuthServiceError';
    this.code = code;
  }
}

function readCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/**
 * Maps a Firebase Auth error to an `AuthServiceError`. Wrong password, unknown email and the
 * generic invalid-credential error all become the SAME code, so the UI cannot reveal whether an
 * account exists (FR-AUTH-11, Security §4.4).
 */
export function mapAuthError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;

  switch (readCode(error)) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return new AuthServiceError('INVALID_CREDENTIALS', { cause: error });
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return new AuthServiceError('INVALID_EMAIL', { cause: error });
    case 'auth/user-disabled':
      return new AuthServiceError('USER_DISABLED', { cause: error });
    case 'auth/weak-password':
      return new AuthServiceError('WEAK_PASSWORD', { cause: error });
    case 'auth/requires-recent-login':
      return new AuthServiceError('REQUIRES_RECENT_LOGIN', { cause: error });
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return new AuthServiceError('POPUP_CLOSED', { cause: error });
    case 'auth/popup-blocked':
      return new AuthServiceError('POPUP_BLOCKED', { cause: error });
    case 'auth/admin-restricted-operation':
    case 'auth/operation-not-allowed':
      return new AuthServiceError('NOT_PERMITTED', { cause: error });
    case 'auth/account-exists-with-different-credential':
      return new AuthServiceError('DIFFERENT_SIGN_IN_METHOD', { cause: error });
    case 'auth/unauthorized-domain':
      return new AuthServiceError('UNAUTHORIZED_DOMAIN', { cause: error });
    case 'auth/too-many-requests':
      return new AuthServiceError('TOO_MANY_REQUESTS', { cause: error });
    case 'auth/network-request-failed':
      return new AuthServiceError('NETWORK', { cause: error });
    default:
      return new AuthServiceError('UNKNOWN', { cause: error });
  }
}
