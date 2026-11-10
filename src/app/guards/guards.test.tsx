import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { PublicOnly } from '@/app/guards/PublicOnly';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { AuthContext, type AuthContextValue } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';

/** Shows where the router ended up, including the `from` state `RequireAuth` attaches. */
function Where() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string; search: string } } | null)?.from;
  return (
    <p data-testid="where">
      {location.pathname}|{from ? `from:${from.pathname}${from.search}` : 'no-from'}
    </p>
  );
}

function renderAt(path: string, value: Partial<AuthContextValue>, state?: unknown) {
  render(
    <AuthContext.Provider value={makeAuthValue(value)}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: path.split('?')[0],
            search: path.includes('?') ? `?${path.split('?')[1]}` : '',
            state,
          },
        ]}
      >
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<p>DASHBOARD</p>} />
            <Route path="/employees" element={<p>EMPLOYEES</p>} />
          </Route>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<p>LOGIN FORM</p>} />
          </Route>
          <Route path="/access-denied" element={<Where />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const where = () => screen.getAllByTestId('where').at(-1)?.textContent;

describe('RequireAuth (FR-AUTH-02)', () => {
  it('while auth is initializing: shows a loading state and NEVER the protected page or the login form', () => {
    renderAt('/employees', { status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading application');
    expect(screen.queryByText('EMPLOYEES')).toBeNull();
    expect(screen.queryByText('LOGIN FORM')).toBeNull();
  });

  it('signed out: redirects to /login and remembers where the user was going (incl. query)', () => {
    renderAt('/employees?q=juan', { status: 'signedOut' });
    expect(screen.queryByText('EMPLOYEES')).toBeNull();
    expect(screen.getByText('LOGIN FORM')).toBeInTheDocument();
    expect(where()).toBe('/login|from:/employees?q=juan');
  });

  it('after a logout / expired session: redirects to /login WITHOUT remembering the page', () => {
    renderAt('/employees', { status: 'signedOut', sessionEnded: true });
    expect(screen.getByText('LOGIN FORM')).toBeInTheDocument();
    expect(where()).toBe('/login|no-from');
  });

  it('denied: redirects to /access-denied', () => {
    renderAt('/employees', { status: 'denied', deniedReason: 'inactive' });
    expect(screen.queryByText('EMPLOYEES')).toBeNull();
    expect(where()).toBe('/access-denied|no-from');
  });

  it('signed in: renders the protected page', () => {
    renderAt('/employees', SIGNED_IN_VALUE);
    expect(screen.getByText('EMPLOYEES')).toBeInTheDocument();
  });
});

describe('PublicOnly', () => {
  it('signed out: shows the public page', () => {
    renderAt('/login', { status: 'signedOut' });
    expect(screen.getByText('LOGIN FORM')).toBeInTheDocument();
  });

  it('loading: shows the loading state rather than flashing the login form', () => {
    renderAt('/login', { status: 'loading' });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('LOGIN FORM')).toBeNull();
  });

  it('signed in: redirects to the dashboard (TC-AUTH-11)', () => {
    renderAt('/login', SIGNED_IN_VALUE);
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it('signed in with a remembered page: redirects there', () => {
    renderAt('/login', SIGNED_IN_VALUE, {
      from: { pathname: '/employees', search: '?q=ana', hash: '' },
    });
    expect(screen.getByText('EMPLOYEES')).toBeInTheDocument();
  });

  it('signed in with a hostile remembered target: ignores it', () => {
    renderAt('/login', SIGNED_IN_VALUE, {
      from: { pathname: '//evil.test', search: '', hash: '' },
    });
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it('denied: redirects to /access-denied so the user can sign out', () => {
    renderAt('/login', { status: 'denied', deniedReason: 'no-profile' });
    expect(where()).toBe('/access-denied|no-from');
  });
});
