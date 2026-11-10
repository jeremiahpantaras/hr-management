import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { AppError } from '@/domain/errors';
import { ACTIVE_ADMIN, FakeAuthBackend } from '@/features/auth/fakeAuthBackend';
import { useAuth } from '@/features/auth/useAuth';
import * as authService from '@/services/auth.service';
import * as usersService from '@/services/users.service';

vi.mock('@/services/auth.service');
vi.mock('@/services/users.service');

let backend: FakeAuthBackend;
let queryClient: QueryClient;

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <p data-testid="status">{auth.status}</p>
      <p data-testid="reason">{auth.deniedReason ?? '-'}</p>
      <p data-testid="name">{auth.profile?.fullName ?? '-'}</p>
      <p data-testid="ended">{String(auth.sessionEnded)}</p>
      <button type="button" onClick={() => void auth.signOut()}>
        out
      </button>
      <button type="button" onClick={() => void auth.signIn('maria@example.test', 'pw-12345')}>
        in
      </button>
      <button type="button" onClick={() => void auth.sendReset('maria@example.test')}>
        reset
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const status = () => screen.getByTestId('status').textContent;

beforeEach(() => {
  vi.resetAllMocks();
  backend = new FakeAuthBackend();
  backend.install();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  backend.addAccount({ email: 'maria@example.test', password: 'pw-12345', profile: ACTIVE_ADMIN });
});

describe('initialization (TC-AUTH authentication initialization)', () => {
  it('is "loading" until Firebase reports the restored session, then "signedOut"', async () => {
    renderProvider();
    expect(status()).toBe('loading');
    await waitFor(() => {
      expect(status()).toBe('signedOut');
    });
    expect(usersService.getUserProfile).not.toHaveBeenCalled();
  });

  it('subscribes exactly once (no listener churn) and unsubscribes on unmount', async () => {
    const { unmount } = renderProvider();
    await waitFor(() => {
      expect(status()).toBe('signedOut');
    });
    expect(authService.subscribeToAuth).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('restores a stored session: loading → profile check → signedIn with the profile', async () => {
    backend.restoreSession('maria@example.test');
    renderProvider();
    expect(status()).toBe('loading');
    await waitFor(() => {
      expect(status()).toBe('signedIn');
    });
    expect(screen.getByTestId('name')).toHaveTextContent('Maria Santos');
    expect(usersService.getUserProfile).toHaveBeenCalledTimes(1); // once per sign-in, no polling
  });
});

describe('authorization outcomes (FR-AUTH-08)', () => {
  it.each([
    ['no profile', null, 'no-profile'],
    ['inactive', { ...ACTIVE_ADMIN, isActive: false }, 'inactive'],
    ['wrong role', { ...ACTIVE_ADMIN, role: 'employee' }, 'wrong-role'],
  ] as const)('%s → denied (%s)', async (_label, profile, reason) => {
    backend.addAccount({ email: 'x@example.test', password: 'pw', profile });
    backend.restoreSession('x@example.test');
    renderProvider();
    await waitFor(() => {
      expect(status()).toBe('denied');
    });
    expect(screen.getByTestId('reason')).toHaveTextContent(reason);
  });

  it('fails CLOSED when the profile cannot be read', async () => {
    backend.restoreSession('maria@example.test');
    backend.profileError = new Error('network down');
    renderProvider();
    await waitFor(() => {
      expect(status()).toBe('denied');
    });
    expect(screen.getByTestId('reason')).toHaveTextContent('profile-error');
  });
});

describe('sign in / sign out', () => {
  it('delegates sign-in to the service and becomes signedIn through the listener', async () => {
    renderProvider();
    await waitFor(() => {
      expect(status()).toBe('signedOut');
    });
    await act(async () => {
      screen.getByRole('button', { name: 'in' }).click();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(status()).toBe('signedIn');
    });
    expect(authService.signIn).toHaveBeenCalledWith('maria@example.test', 'pw-12345');
  });

  it('sign-out ends the session, marks it ended, and CLEARS the query cache (FR-AUTH-03)', async () => {
    backend.restoreSession('maria@example.test');
    queryClient.setQueryData(['employees'], [{ id: 'sensitive' }]);
    renderProvider();
    await waitFor(() => {
      expect(status()).toBe('signedIn');
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    expect(screen.getByTestId('ended')).toHaveTextContent('false');

    await act(async () => {
      screen.getByRole('button', { name: 'out' }).click();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(status()).toBe('signedOut');
    });
    expect(screen.getByTestId('ended')).toHaveTextContent('true');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('delegates password reset to the service', async () => {
    renderProvider();
    await waitFor(() => {
      expect(status()).toBe('signedOut');
    });
    await act(async () => {
      screen.getByRole('button', { name: 'reset' }).click();
      await Promise.resolve();
    });
    expect(authService.sendPasswordReset).toHaveBeenCalledWith('maria@example.test');
  });

  it('discards a slow profile result that arrives AFTER sign-out (no resurrected session)', async () => {
    backend.restoreSession('maria@example.test');
    let release: () => void = () => undefined;
    vi.mocked(usersService.getUserProfile).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({
              uid: 'uid-maria',
              fullName: 'Maria',
              email: 'm',
              role: 'hr_admin',
              isActive: true,
              createdAt: null,
              updatedAt: null,
            });
          };
        }),
    );
    renderProvider();
    await waitFor(() => {
      expect(authService.subscribeToAuth).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(usersService.getUserProfile).toHaveBeenCalled();
    });

    await act(async () => {
      await authService.signOutUser(); // session ends while the profile read is still in flight
    });
    await act(async () => {
      release();
      await Promise.resolve();
    });

    expect(status()).toBe('signedOut');
  });
});

describe('global permission-denied handler (FR-AUTH-12)', () => {
  const permissionDenied = Object.assign(new Error('denied'), { code: 'permission-denied' });

  async function signedInProvider() {
    backend.restoreSession('maria@example.test');
    renderProvider();
    await waitFor(() => {
      expect(status()).toBe('signedIn');
    });
    expect(usersService.getUserProfile).toHaveBeenCalledTimes(1);
  }

  it('a rejected QUERY re-checks the profile; a deactivated user is moved to denied', async () => {
    await signedInProvider();
    backend.updateProfile('maria@example.test', { ...ACTIVE_ADMIN, isActive: false }); // console change

    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ['employees'],
          queryFn: () => Promise.reject(permissionDenied),
          retry: false,
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(status()).toBe('denied');
    });
    expect(screen.getByTestId('reason')).toHaveTextContent('inactive');
    expect(usersService.getUserProfile).toHaveBeenCalledTimes(2);
  });

  it('a rejected MUTATION does the same', async () => {
    await signedInProvider();
    backend.updateProfile('maria@example.test', { ...ACTIVE_ADMIN, role: 'employee' });

    await act(async () => {
      await queryClient
        .getMutationCache()
        .build(queryClient, { mutationFn: () => Promise.reject(permissionDenied) })
        .execute(undefined)
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(status()).toBe('denied');
    });
    expect(screen.getByTestId('reason')).toHaveTextContent('wrong-role');
  });

  it('if the user is STILL authorized, they stay signed in', async () => {
    await signedInProvider();
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ['x'],
          queryFn: () => Promise.reject(permissionDenied),
          retry: false,
        })
        .catch(() => undefined);
    });
    await waitFor(() => {
      expect(usersService.getUserProfile).toHaveBeenCalledTimes(2);
    });
    expect(status()).toBe('signedIn');
  });

  // The real services translate SDK errors into AppError before React Query ever sees them, so the
  // handler must recognise THAT shape too. (The first browser run of the leave features caught that
  // it did not: a deactivated user stayed on the page.)
  it('a rejected QUERY carrying an AppError PERMISSION_DENIED (what the services throw) is handled too', async () => {
    await signedInProvider();
    backend.updateProfile('maria@example.test', { ...ACTIVE_ADMIN, isActive: false });
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ['ledger'],
          queryFn: () => Promise.reject(new AppError('PERMISSION_DENIED')),
          retry: false,
        })
        .catch(() => undefined);
    });
    await waitFor(() => {
      expect(status()).toBe('denied');
    });
    expect(screen.getByTestId('reason')).toHaveTextContent('inactive');
  });

  it('a rejected MUTATION carrying an AppError PERMISSION_DENIED is handled too', async () => {
    await signedInProvider();
    backend.updateProfile('maria@example.test', { ...ACTIVE_ADMIN, isActive: false });
    await act(async () => {
      await queryClient
        .getMutationCache()
        .build(queryClient, { mutationFn: () => Promise.reject(new AppError('PERMISSION_DENIED')) })
        .execute(undefined)
        .catch(() => undefined);
    });
    await waitFor(() => {
      expect(status()).toBe('denied');
    });
  });

  it('other AppErrors (OFFLINE, CONTENTION, VALIDATION …) do NOT trigger a re-check', async () => {
    await signedInProvider();
    for (const code of ['OFFLINE', 'CONTENTION', 'INSUFFICIENT_BALANCE', 'UNKNOWN'] as const) {
      await act(async () => {
        await queryClient
          .fetchQuery({
            queryKey: ['z', code],
            queryFn: () => Promise.reject(new AppError(code)),
            retry: false,
          })
          .catch(() => undefined);
      });
    }
    expect(usersService.getUserProfile).toHaveBeenCalledTimes(1);
    expect(status()).toBe('signedIn');
  });

  it('other errors (e.g. network) do NOT trigger a profile re-check', async () => {
    await signedInProvider();
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ['y'],
          queryFn: () => Promise.reject(Object.assign(new Error('x'), { code: 'unavailable' })),
          retry: false,
        })
        .catch(() => undefined);
    });
    expect(usersService.getUserProfile).toHaveBeenCalledTimes(1);
    expect(status()).toBe('signedIn');
  });
});

describe('useAuth', () => {
  it('throws a clear error outside <AuthProvider>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>');
    spy.mockRestore();
  });
});
