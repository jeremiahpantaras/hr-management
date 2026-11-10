import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { evaluateProfile, type DeniedReason } from '@/domain/authorization';
import { AuthContext, type AuthContextValue, type AuthStatus } from '@/features/auth/authContext';
import * as authService from '@/services/auth.service';
import { isPermissionDeniedError } from '@/services/firestore/errors';
import { getUserProfile } from '@/services/users.service';
import type { AuthUser, UserProfile } from '@/types/models';

interface AuthState {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  readonly profile: UserProfile | null;
  readonly deniedReason: DeniedReason | null;
  readonly sessionEnded: boolean;
}

const INITIAL_STATE: AuthState = {
  status: 'loading',
  user: null,
  profile: null,
  deniedReason: null,
  sessionEnded: false,
};

/**
 * The authentication state machine (Security §4.2). It subscribes to Firebase Auth ONCE, reads
 * `users/{uid}` once per sign-in (no listener), and derives `signedIn` / `denied` from the pure
 * `evaluateProfile`. On sign-out — user-initiated or not — the query cache is cleared so no data
 * survives on a shared machine (FR-AUTH-03). A `permission-denied` from any query or mutation
 * re-checks the profile, so a deactivation mid-session ends access promptly (FR-AUTH-12).
 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  const userRef = useRef<AuthUser | null>(null);
  const everSignedInRef = useRef(false);
  /** Incremented for every profile check; a result from an older check is discarded. */
  const ticketRef = useRef(0);
  const refreshingRef = useRef(false);

  const resolveProfile = useCallback(async (user: AuthUser): Promise<void> => {
    const ticket = ++ticketRef.current;
    let next: AuthState;
    try {
      const profile = await getUserProfile(user.uid);
      const verdict = evaluateProfile(profile);
      next = verdict.authorized
        ? { status: 'signedIn', user, profile, deniedReason: null, sessionEnded: false }
        : { status: 'denied', user, profile, deniedReason: verdict.reason, sessionEnded: false };
    } catch {
      // Includes a `permission-denied` on the profile read itself. Fail closed.
      next = {
        status: 'denied',
        user,
        profile: null,
        deniedReason: 'profile-error',
        sessionEnded: false,
      };
    }
    if (ticket !== ticketRef.current) return; // superseded by a newer sign-in / sign-out
    if (next.status === 'signedIn') everSignedInRef.current = true;
    setState(next);
  }, []);

  useEffect(() => {
    return authService.subscribeToAuth((user) => {
      userRef.current = user;
      if (user === null) {
        ticketRef.current += 1; // invalidate any in-flight profile check
        queryClient.clear();
        setState({
          status: 'signedOut',
          user: null,
          profile: null,
          deniedReason: null,
          sessionEnded: everSignedInRef.current,
        });
        return;
      }
      setState((previous) => ({ ...previous, status: 'loading', user }));
      void resolveProfile(user);
    });
  }, [queryClient, resolveProfile]);

  const refreshProfile = useCallback(async (): Promise<void> => {
    const user = userRef.current;
    if (!user || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      await resolveProfile(user);
    } finally {
      refreshingRef.current = false;
    }
  }, [resolveProfile]);

  // Global `permission-denied` handler (FR-AUTH-12): any query or mutation that the server
  // rejects makes us re-check whether this user is still authorized.
  useEffect(() => {
    const onCacheEvent = (event: { type: string; action?: { type: string; error?: unknown } }) => {
      if (
        event.type === 'updated' &&
        event.action?.type === 'error' &&
        isPermissionDeniedError(event.action.error)
      ) {
        void refreshProfile();
      }
    };
    const stopQueries = queryClient.getQueryCache().subscribe(onCacheEvent);
    const stopMutations = queryClient.getMutationCache().subscribe(onCacheEvent);
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [queryClient, refreshProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: authService.signIn,
      signInWithGoogle: authService.signInWithGoogle,
      signOut: authService.signOutUser,
      sendReset: authService.sendPasswordReset,
      refreshProfile,
    }),
    [state, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
