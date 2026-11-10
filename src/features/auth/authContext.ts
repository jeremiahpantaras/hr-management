import { createContext } from 'react';

import type { DeniedReason } from '@/domain/authorization';
import type { AuthUser, UserProfile } from '@/types/models';

/**
 * - `loading`   — restoring the session or checking the profile; render nothing sensitive.
 * - `signedOut` — no session.
 * - `signedIn`  — session AND an active `hr_admin` profile.
 * - `denied`    — session, but no/inactive/wrong-role profile (or the profile could not be read).
 */
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'denied';

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  readonly profile: UserProfile | null;
  readonly deniedReason: DeniedReason | null;
  /** True when signed out AFTER having been signed in during this page session (logout / expiry). */
  readonly sessionEnded: boolean;
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signInWithGoogle: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly sendReset: (email: string) => Promise<void>;
  /** Re-reads the profile and re-evaluates authorization (e.g. after a `permission-denied`). */
  readonly refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
