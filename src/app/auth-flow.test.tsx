import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';
import { ACTIVE_ADMIN, FakeAuthBackend } from '@/features/auth/fakeAuthBackend';
import type { EnvResult } from '@/lib/env';
import * as authService from '@/services/auth.service';
import * as employeesService from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';
import * as typesService from '@/services/leaveTypes.service';

vi.mock('@/services/auth.service');
vi.mock('@/services/users.service');
vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');
vi.mock('@/services/leaveTypes.service');

/**
 * End-to-end authentication flows (TC-AUTH-01…11) through the REAL AuthProvider, guards, router,
 * pages and shell. Only the Firebase-facing services are faked (FakeAuthBackend); those are tested
 * for real against the emulators in tests/integration.
 */
const env: EnvResult = {
  ok: true,
  env: {
    firebase: { apiKey: 'k', authDomain: 'd', projectId: 'demo-hr-leave', appId: 'a' },
    useEmulators: true,
  },
};

let backend: FakeAuthBackend;

function openApp(path: string) {
  window.history.pushState({}, '', path);
  return render(<App env={env} />);
}

const pathname = () => window.location.pathname;

function getSidebar(): HTMLElement {
  const aside = screen.getByRole('navigation', { name: 'Primary' }).closest('aside');
  if (!aside) throw new Error('Desktop sidebar (<aside>) not found');
  return aside;
}
const h1 = (name: string) => screen.findByRole('heading', { level: 1, name });

async function signInAs(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  backend = new FakeAuthBackend();
  backend.install();
  vi.mocked(employeesService.listEmployees).mockResolvedValue([]);
  vi.mocked(typesService.listLeaveTypes).mockResolvedValue([]);
  vi.mocked(balancesService.getBalancesForEmployees).mockResolvedValue([]);
  vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.mocked(ledgerService.newTransactionId).mockReturnValue('Tx000000000000000001');
  vi.mocked(employeesService.getEmployee).mockResolvedValue(null);
  backend.addAccount({ email: 'maria@example.test', password: 'pw-12345', profile: ACTIVE_ADMIN });
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('unauthenticated access (TC-AUTH-01)', () => {
  it.each([
    '/',
    '/employees',
    '/employees/abc123',
    '/leave-credits',
    '/leave-usage',
    '/leave-history',
    '/reports',
    '/settings/leave-types',
    '/settings/account',
  ])('%s redirects to /login and shows no protected content', async (path) => {
    openApp(path);
    expect(await h1('Sign in')).toBeInTheDocument();
    expect(pathname()).toBe('/login');
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });

  it('shows a loading state — not the login form, not the app — while the session is restored', () => {
    openApp('/employees');
    expect(screen.getByRole('status')).toHaveTextContent('Loading application');
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });
});

describe('sign in (TC-AUTH-02, 03)', () => {
  it('lands on the page the user was heading for', async () => {
    openApp('/employees?q=juan');
    await signInAs('maria@example.test', 'pw-12345');
    expect(await h1('Employees')).toBeInTheDocument();
    expect(pathname()).toBe('/employees');
    expect(window.location.search).toBe('?q=juan');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('direct visit to /login then sign in lands on the dashboard', async () => {
    openApp('/login');
    await signInAs('maria@example.test', 'pw-12345');
    expect(await h1('Dashboard')).toBeInTheDocument();
    expect(pathname()).toBe('/');
  });

  it('wrong password and unknown email show the same message and stay on /login', async () => {
    openApp('/login');
    await signInAs('maria@example.test', 'wrong');
    const first = (await screen.findByRole('alert')).textContent;

    await userEvent.clear(screen.getByLabelText('Email'));
    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.');
    });

    expect(first).toBe('Incorrect email or password.');
    expect(pathname()).toBe('/login');
    expect(authService.signIn).toHaveBeenCalledTimes(2);
  });

  it("shows the signed-in user's name and role in the shell", async () => {
    openApp('/login');
    await signInAs('maria@example.test', 'pw-12345');
    await h1('Dashboard');
    const sidebar = getSidebar();
    expect(within(sidebar).getByText('Maria Santos')).toBeInTheDocument();
    expect(within(sidebar).getByText('HR Administrator')).toBeInTheDocument();
  });
});

describe('session persistence (TC-AUTH-05)', () => {
  it('a refresh with a stored session goes straight to the page — no login screen', async () => {
    backend.restoreSession('maria@example.test');
    openApp('/leave-credits');
    expect(await h1('Leave Credits')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('a signed-in user opening /login is redirected to the dashboard (TC-AUTH-11)', async () => {
    backend.restoreSession('maria@example.test');
    openApp('/login');
    expect(await h1('Dashboard')).toBeInTheDocument();
    expect(pathname()).toBe('/');
  });
});

describe('logout (TC-AUTH-06)', () => {
  it('returns to /login; the next sign-in does NOT resume the previous page; caches are cleared', async () => {
    backend.restoreSession('maria@example.test');
    openApp('/reports');
    await h1('Reports');

    const sidebar = getSidebar();
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Log out' }));

    expect(await h1('Sign in')).toBeInTheDocument();
    expect(pathname()).toBe('/login');
    expect(authService.signOutUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();

    // Someone else signs in on the same browser: they must land on the dashboard.
    await signInAs('maria@example.test', 'pw-12345');
    expect(await h1('Dashboard')).toBeInTheDocument();
    expect(pathname()).toBe('/');
  });

  it('works from the header user menu too', async () => {
    backend.restoreSession('maria@example.test');
    openApp('/');
    await h1('Dashboard');
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Maria Santos' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));
    expect(await h1('Sign in')).toBeInTheDocument();
  });

  it('after logout, protected URLs are blocked again', async () => {
    backend.restoreSession('maria@example.test');
    openApp('/employees');
    await h1('Employees');
    await authService.signOutUser();
    expect(await h1('Sign in')).toBeInTheDocument();
    // The browser's Back button / a typed URL tries to return to the protected page.
    act(() => {
      window.history.pushState({}, '', '/employees');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => {
      expect(pathname()).toBe('/login');
    });
    expect(await h1('Sign in')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Employees' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
  });
});

describe('authorization failures (TC-AUTH-04)', () => {
  it.each([
    ['no profile', null, "Your account hasn't been set up for this application."],
    ['inactive', { ...ACTIVE_ADMIN, isActive: false }, 'Your account has been deactivated.'],
    [
      'wrong role',
      { ...ACTIVE_ADMIN, role: 'employee' },
      "You don't have permission to use this application.",
    ],
  ] as const)(
    'signing in as a user with %s → Access not available, never the app',
    async (_label, profile, message) => {
      backend.addAccount({ email: 'x@example.test', password: 'pw-12345', profile });
      openApp('/employees');
      await signInAs('x@example.test', 'pw-12345');

      expect(await h1('Access not available')).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(pathname()).toBe('/access-denied');
      expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    },
  );

  it('a denied user cannot reach protected URLs, and Sign out returns to /login', async () => {
    backend.addAccount({
      email: 'x@example.test',
      password: 'pw-12345',
      profile: { ...ACTIVE_ADMIN, isActive: false },
    });
    backend.restoreSession('x@example.test');
    openApp('/leave-history');
    expect(await h1('Access not available')).toBeInTheDocument();
    expect(pathname()).toBe('/access-denied');

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await h1('Sign in')).toBeInTheDocument();
  });

  it('a profile-read failure fails closed, and "Try again" recovers once it works', async () => {
    backend.restoreSession('maria@example.test');
    backend.profileError = new Error('network');
    openApp('/');
    expect(await h1('Access not available')).toBeInTheDocument();

    backend.profileError = null;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await h1('Dashboard')).toBeInTheDocument();
  });
});

describe('password reset (TC-AUTH-07)', () => {
  it('is reachable from the login page and always confirms generically', async () => {
    openApp('/login');
    await userEvent.click(await screen.findByRole('link', { name: 'Forgot password?' }));
    expect(await h1('Reset your password')).toBeInTheDocument();
    expect(pathname()).toBe('/forgot-password');

    await userEvent.type(screen.getByLabelText('Email'), 'ghost@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If an account exists for that email, a reset link has been sent.',
    );
    expect(backend.resetRequests).toEqual(['ghost@example.test']);

    await userEvent.click(screen.getByRole('link', { name: 'Back to sign in' }));
    expect(await h1('Sign in')).toBeInTheDocument();
  });
});

describe('Google sign-in (an extra way to prove identity; access still needs a profile)', () => {
  const googleButton = () => screen.findByRole('button', { name: 'Continue with Google' });

  it('a Google account that has an active HR profile signs in and lands on the requested page', async () => {
    backend.googleEmail = 'maria@example.test';
    openApp('/employees');
    await userEvent.click(await googleButton());
    expect(await h1('Employees')).toBeInTheDocument();
    expect(pathname()).toBe('/employees');
    expect(vi.mocked(authService.signInWithGoogle)).toHaveBeenCalledTimes(1);
  });

  it('closing the Google window is not an error: no message, still on /login', async () => {
    backend.googleEmail = null;
    openApp('/login');
    await userEvent.click(await googleButton());
    await waitFor(() => {
      expect(backend.googleCalls).toHaveLength(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(pathname()).toBe('/login');
  });

  it('an unknown Google account (self sign-up is disabled) is refused with a clear message', async () => {
    backend.googleEmail = 'stranger@example.test';
    openApp('/login');
    await userEvent.click(await googleButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This Google account isn't set up for access. Contact your administrator.",
    );
    expect(pathname()).toBe('/login');
  });

  it('a Google sign-in without an HR profile reaches "Access not available" and nothing else', async () => {
    backend.addAccount({ email: 'noprofile@example.test', password: 'x', profile: null });
    backend.googleEmail = 'noprofile@example.test';
    openApp('/employees');
    await userEvent.click(await googleButton());
    expect(await h1('Access not available')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('a deactivated profile signing in with Google is denied too', async () => {
    backend.addAccount({
      email: 'off@example.test',
      password: 'x',
      profile: { ...ACTIVE_ADMIN, isActive: false },
    });
    backend.googleEmail = 'off@example.test';
    openApp('/login');
    await userEvent.click(await googleButton());
    expect(await h1('Access not available')).toBeInTheDocument();
  });

  it('a double click opens one Google window', async () => {
    backend.googleEmail = 'maria@example.test';
    openApp('/login');
    await userEvent.dblClick(await googleButton());
    await h1('Dashboard');
    expect(vi.mocked(authService.signInWithGoogle)).toHaveBeenCalledTimes(1);
  });

  it('a Google-only user sees no password form on Account settings', async () => {
    backend.googleEmail = 'maria@example.test';
    openApp('/settings/account');
    await userEvent.click(await googleButton());
    expect(await h1('Account')).toBeInTheDocument();
    expect(
      screen.getByText(/You signed in with Google, so there is no password to change/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
  });

  it('an email/password user still gets the password form', async () => {
    openApp('/settings/account');
    await signInAs('maria@example.test', 'pw-12345');
    expect(await screen.findByRole('button', { name: 'Update password' })).toBeInTheDocument();
  });
});

describe('no registration (TC-AUTH-08)', () => {
  it.each(['/register', '/signup', '/sign-up', '/create-account'])(
    '%s is just Page not found',
    async (path) => {
      openApp(path);
      expect(await h1('Page not found')).toBeInTheDocument();
    },
  );
});
