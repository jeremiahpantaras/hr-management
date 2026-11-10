import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { AccessDeniedPage } from '@/features/auth/AccessDeniedPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { AuthServiceError } from '@/services/auth.errors';

function renderPage(element: React.ReactNode, value: Partial<AuthContextValue>, path = '/page') {
  render(
    <AuthContext.Provider value={makeAuthValue(value)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/page" element={element} />
          <Route path="/login" element={<p>LOGIN ROUTE</p>} />
          <Route path="/" element={<p>DASHBOARD ROUTE</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const email = () => screen.getByLabelText('Email');
const password = () => screen.getByLabelText('Password');

describe('LoginPage (UI spec §6.1)', () => {
  it('has the specified structure and NO sign-up path (FR-AUTH-06)', () => {
    renderPage(<LoginPage />, {});
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(email()).toHaveAttribute('autocomplete', 'email');
    expect(email()).toHaveAttribute('type', 'email');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
    expect(password()).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByText('Access is limited to authorized HR personnel.')).toBeInTheDocument();
    expect(screen.queryByText(/sign up|register|create (an )?account|new account/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /sign up|register|create/i })).toBeNull();
    expect(document.title).toBe('Sign in · HR Leave Monitor');
  });

  it('the password toggle reveals and hides it, exposing its state (aria-pressed)', async () => {
    renderPage(<LoginPage />, {});
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(password()).toHaveAttribute('type', 'text');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    expect(password()).toHaveAttribute('type', 'password');
  });

  it('validates with the exact copy and does not call the service', async () => {
    const signIn = vi.fn();
    renderPage(<LoginPage />, { signIn });
    await userEvent.type(email(), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('submits the trimmed email and the password as typed (Enter works)', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    renderPage(<LoginPage />, { signIn });
    await userEvent.type(email(), '  maria@example.test ');
    await userEvent.type(password(), '  pw with spaces  {Enter}');
    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('maria@example.test', '  pw with spaces  ');
    });
  });

  it.each([
    ['INVALID_CREDENTIALS', 'Incorrect email or password.'],
    ['USER_DISABLED', 'This account has been disabled. Contact your administrator.'],
    ['TOO_MANY_REQUESTS', 'Too many attempts. Wait a few minutes or reset your password.'],
    ['NETWORK', "Can't reach the server. Check your connection."],
    ['UNKNOWN', 'Something went wrong. Try again.'],
  ] as const)('shows the %s failure as an alert (TC-AUTH-03)', async (code, message) => {
    renderPage(<LoginPage />, { signIn: () => Promise.reject(new AuthServiceError(code)) });
    await userEvent.type(email(), 'maria@example.test');
    await userEvent.type(password(), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('an unexpected non-service error shows the generic message, never raw text', async () => {
    renderPage(<LoginPage />, {
      signIn: () => Promise.reject(new Error('Firebase: internal detail 0xDEAD')),
    });
    await userEvent.type(email(), 'maria@example.test');
    await userEvent.type(password(), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).not.toHaveTextContent('0xDEAD');
  });

  it('while signing in: shows progress, disables the form, and ignores a double submit', async () => {
    let finish: () => void = () => undefined;
    const signIn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderPage(<LoginPage />, { signIn });
    await userEvent.type(email(), 'maria@example.test');
    await userEvent.type(password(), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const busy = await screen.findByRole('button', { name: 'Signing in…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(email()).toBeDisabled();
    await userEvent.click(busy);
    expect(signIn).toHaveBeenCalledTimes(1);
    finish();
  });

  it('clears the previous error when the user tries again', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValueOnce(new AuthServiceError('INVALID_CREDENTIALS'))
      .mockResolvedValueOnce(undefined);
    renderPage(<LoginPage />, { signIn });
    await userEvent.type(email(), 'maria@example.test');
    await userEvent.type(password(), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

describe('ForgotPasswordPage (UI spec §6.2, TC-AUTH-07)', () => {
  const GENERIC = 'If an account exists for that email, a reset link has been sent.';

  it('validates the email with the exact copy', async () => {
    const sendReset = vi.fn();
    renderPage(<ForgotPasswordPage />, { sendReset });
    await userEvent.type(email(), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(sendReset).not.toHaveBeenCalled();
  });

  it('shows the SAME generic confirmation whatever the service reports for the account', async () => {
    const sendReset = vi.fn().mockResolvedValue(undefined);
    renderPage(<ForgotPasswordPage />, { sendReset });
    await userEvent.type(email(), 'someone@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(GENERIC);
    expect(sendReset).toHaveBeenCalledWith('someone@example.test');
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('surfaces a network failure instead of a false confirmation', async () => {
    renderPage(<ForgotPasswordPage />, {
      sendReset: () => Promise.reject(new AuthServiceError('NETWORK')),
    });
    await userEvent.type(email(), 'someone@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server.");
    expect(screen.queryByText(GENERIC)).toBeNull();
  });
});

describe('AccessDeniedPage (UI spec §6.3, TC-AUTH-04)', () => {
  it.each([
    ['no-profile', "Your account hasn't been set up for this application."],
    ['inactive', 'Your account has been deactivated.'],
    ['wrong-role', "You don't have permission to use this application."],
    ['profile-error', "We couldn't verify your account. Check your connection and try again."],
  ] as const)('%s → matching message + "Contact your administrator."', (reason, message) => {
    renderPage(<AccessDeniedPage />, { status: 'denied', deniedReason: reason });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Access not available' }),
    ).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText('Contact your administrator.')).toBeInTheDocument();
  });

  it('Sign out calls the service', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderPage(<AccessDeniedPage />, { status: 'denied', deniedReason: 'inactive', signOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('offers "Try again" ONLY when the profile could not be read', async () => {
    const refreshProfile = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <AuthContext.Provider
        value={makeAuthValue({ status: 'denied', deniedReason: 'profile-error', refreshProfile })}
      >
        <MemoryRouter>
          <AccessDeniedPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    unmount();

    renderPage(<AccessDeniedPage />, { status: 'denied', deniedReason: 'inactive' });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('sends everyone else where they belong: signed out → login, authorized → dashboard, loading → spinner', () => {
    const { unmount } = render(
      <AuthContext.Provider value={makeAuthValue({ status: 'signedOut' })}>
        <MemoryRouter initialEntries={['/page']}>
          <Routes>
            <Route path="/page" element={<AccessDeniedPage />} />
            <Route path="/login" element={<p>LOGIN ROUTE</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByText('LOGIN ROUTE')).toBeInTheDocument();
    unmount();

    const second = render(
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={['/page']}>
          <Routes>
            <Route path="/page" element={<AccessDeniedPage />} />
            <Route path="/" element={<p>DASHBOARD ROUTE</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByText('DASHBOARD ROUTE')).toBeInTheDocument();
    second.unmount();

    renderPage(<AccessDeniedPage />, { status: 'loading' });
    expect(within(document.body).getByRole('status')).toBeInTheDocument();
  });
});
