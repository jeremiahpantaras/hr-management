import { vi } from 'vitest';

import * as authService from '@/services/auth.service';
import { AuthServiceError } from '@/services/auth.errors';
import * as usersService from '@/services/users.service';
import type { AuthUser, UserProfile } from '@/types/models';

/**
 * TEST HELPER (imported only by tests). An in-memory stand-in for the two Firebase-facing
 * services, so component tests can drive the REAL `AuthProvider`, guards and router through
 * whole sign-in / sign-out / denied flows. The calling test file must
 * `vi.mock('@/services/auth.service')` and `vi.mock('@/services/users.service')` first.
 *
 * The real services are exercised against the real emulators in tests/integration.
 */
export interface FakeAccount {
  readonly email: string;
  readonly password: string;
  readonly profile: Pick<UserProfile, 'fullName' | 'role' | 'isActive'> | null;
}

export class FakeAuthBackend {
  readonly accounts = new Map<string, FakeAccount & { uid: string }>();
  current: AuthUser | null = null;
  /** When set, `getUserProfile` rejects with this error (e.g. a network or permission failure). */
  profileError: unknown = null;
  /** Emails a password reset was requested for (whether or not the account exists). */
  readonly resetRequests: string[] = [];
  /** The Google account the next pop-up "signs in" (null = the user closes the window). */
  googleEmail: string | null = null;
  readonly googleCalls: number[] = [];
  private listener: ((user: AuthUser | null) => void) | null = null;

  addAccount(account: FakeAccount): string {
    const uid = `uid-${account.email.split('@')[0] ?? 'user'}`;
    this.accounts.set(account.email, { ...account, uid });
    return uid;
  }

  /** Starts the "browser" already signed in, as after a page refresh with a stored session. */
  restoreSession(email: string): void {
    const account = this.accounts.get(email);
    if (!account) throw new Error(`No fake account ${email}`);
    this.current = { uid: account.uid, email };
  }

  /** Simulates the console changing a profile mid-session. */
  updateProfile(email: string, profile: FakeAccount['profile']): void {
    const account = this.accounts.get(email);
    if (account) this.accounts.set(email, { ...account, profile });
  }

  install(): void {
    vi.mocked(authService.subscribeToAuth).mockImplementation((callback) => {
      this.listener = callback;
      queueMicrotask(() => {
        callback(this.current);
      });
      return () => {
        this.listener = null;
      };
    });

    vi.mocked(authService.signIn).mockImplementation((email, password) => {
      const account = this.accounts.get(email);
      if (account?.password !== password) {
        return Promise.reject(new AuthServiceError('INVALID_CREDENTIALS'));
      }
      this.current = { uid: account.uid, email };
      this.listener?.(this.current);
      return Promise.resolve();
    });

    vi.mocked(authService.signInWithGoogle).mockImplementation(() => {
      this.googleCalls.push(Date.now());
      if (this.googleEmail === null) return Promise.reject(new AuthServiceError('POPUP_CLOSED'));
      const account = this.accounts.get(this.googleEmail);
      // Firebase self sign-up is disabled, so an unknown Google account cannot sign in at all.
      if (!account) return Promise.reject(new AuthServiceError('NOT_PERMITTED'));
      this.current = { uid: account.uid, email: account.email, hasPassword: false };
      this.listener?.(this.current);
      return Promise.resolve();
    });

    vi.mocked(authService.signOutUser).mockImplementation(() => {
      this.current = null;
      this.listener?.(null);
      return Promise.resolve();
    });

    vi.mocked(authService.sendPasswordReset).mockImplementation((email) => {
      this.resetRequests.push(email);
      return Promise.resolve(); // always succeeds, exactly like the real service (BR-AUTH-04)
    });

    vi.mocked(usersService.getUserProfile).mockImplementation((uid) => {
      if (this.profileError !== null) {
        return Promise.reject(
          this.profileError instanceof Error ? this.profileError : new Error('profile read failed'),
        );
      }
      const account = [...this.accounts.values()].find((a) => a.uid === uid);
      if (!account?.profile) return Promise.resolve(null);
      return Promise.resolve({
        uid,
        email: account.email,
        createdAt: null,
        updatedAt: null,
        ...account.profile,
      });
    });
  }
}

export const ACTIVE_ADMIN = { fullName: 'Maria Santos', role: 'hr_admin', isActive: true } as const;
