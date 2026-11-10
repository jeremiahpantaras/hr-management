import type { AuthContextValue } from '@/features/auth/authContext';

/** Builds an `AuthContextValue` for component tests; every action is a no-op unless overridden. */
export function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'signedOut',
    user: null,
    profile: null,
    deniedReason: null,
    sessionEnded: false,
    signIn: () => Promise.resolve(),
    signInWithGoogle: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    sendReset: () => Promise.resolve(),
    refreshProfile: () => Promise.resolve(),
    ...overrides,
  };
}

export const SIGNED_IN_VALUE: Partial<AuthContextValue> = {
  status: 'signedIn',
  user: { uid: 'hr1', email: 'maria@example.test' },
  profile: {
    uid: 'hr1',
    fullName: 'Maria Santos',
    email: 'maria@example.test',
    role: 'hr_admin',
    isActive: true,
    createdAt: null,
    updatedAt: null,
  },
};
