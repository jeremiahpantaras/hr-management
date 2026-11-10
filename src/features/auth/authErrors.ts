import type { AuthErrorCode } from '@/services/auth.errors';
import { AuthServiceError } from '@/services/auth.errors';

/** User-facing copy — planning/FIREBASE_SECURITY_PLAN.md §4.4. */
const MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  INVALID_EMAIL: 'Enter a valid email address.',
  USER_DISABLED: 'This account has been disabled. Contact your administrator.',
  WEAK_PASSWORD: 'Choose a stronger password (at least 8 characters).',
  REQUIRES_RECENT_LOGIN: 'For security, sign in again before changing your password.',
  POPUP_CLOSED: '', // the user closed the Google window: not an error worth showing
  POPUP_BLOCKED:
    'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  NOT_PERMITTED: "This Google account isn't set up for access. Contact your administrator.",
  DIFFERENT_SIGN_IN_METHOD:
    'This email already uses a different sign-in method. Sign in with your email and password.',
  UNAUTHORIZED_DOMAIN: "Google sign-in isn't enabled for this address. Contact your administrator.",
  TOO_MANY_REQUESTS: 'Too many attempts. Wait a few minutes or reset your password.',
  NETWORK: "Can't reach the server. Check your connection.",
  UNKNOWN: 'Something went wrong. Try again.',
};

/** Never returns raw Firebase text. Unknown failures get the generic message. */
export function authErrorMessage(error: unknown): string {
  return error instanceof AuthServiceError ? MESSAGES[error.code] : MESSAGES.UNKNOWN;
}
