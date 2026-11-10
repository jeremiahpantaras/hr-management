import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '@/app/router';
import { AuthContext, type AuthContextValue } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import * as employeesService from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';

vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(employeesService.listEmployees).mockResolvedValue([]);
  vi.mocked(employeesService.getEmployee).mockResolvedValue(null);
  vi.mocked(balancesService.getBalancesForEmployees).mockResolvedValue([]);
  vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.mocked(ledgerService.newTransactionId).mockReturnValue('Tx000000000000000001');
});

function renderAt(path: string, auth: Partial<AuthContextValue> = SIGNED_IN_VALUE) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider value={makeAuthValue(auth)}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return router;
}

/** [path, h1 text, document.title or null, nav item expected active or null] */
const shellRoutes = [
  ['/', 'Dashboard', 'Dashboard', 'Dashboard'],
  ['/employees', 'Employees', 'Employees', 'Employees'],
  ['/employees/abc123', 'Employee details', 'Employee details', 'Employees'],
  ['/leave-credits', 'Leave Days', 'Leave Days', 'Leave Days'],
  ['/leave-usage', 'Leave Usage', 'Leave Usage', 'Leave Usage'],
  ['/leave-history', 'Leave History', 'Leave History', 'Leave History'],
  ['/reports', 'Reports', 'Reports', 'Reports'],
  ['/settings/account', 'Account', 'Account', 'Settings'],
] as const;

describe('route table (Architecture §4.2)', () => {
  it.each(shellRoutes)(
    '%s renders inside the shell with the right heading and active nav',
    async (path, heading, title, active) => {
      renderAt(path);
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      expect(document.title).toBe(`${title} · HR Leave Monitor`);

      const nav = screen.getByRole('navigation', { name: 'Primary' });
      expect(within(nav).getByRole('link', { name: active })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(within(nav).getAllByRole('link', { current: 'page' })).toHaveLength(1);
    },
  );

  it('/settings redirects to /settings/account', async () => {
    const router = renderAt('/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/account');
  });

  it.each([
    ['/login', 'Sign in'],
    ['/forgot-password', 'Reset your password'],
    ['/access-denied', 'Access not available'],
  ])('%s renders outside the shell (no sidebar)', async (path, heading) => {
    renderAt(
      path,
      path === '/access-denied'
        ? { status: 'denied', deniedReason: 'inactive' }
        : { status: 'signedOut' },
    );
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(document.title).toBe(`${heading} · HR Leave Monitor`);
  });

  it('there is no registration route (BR-AUTH-02)', async () => {
    for (const path of ['/register', '/signup', '/sign-up']) {
      const { unmount } = render(
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />,
      );
      expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
      unmount();
    }
  });

  it('unknown URLs show Page not found with a way back', async () => {
    renderAt('/definitely/not/here');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });

  it('no route is a placeholder any more: every shell page renders real content', async () => {
    for (const path of [
      '/',
      '/employees',
      '/leave-credits',
      '/leave-usage',
      '/leave-history',
      '/reports',
      '/settings/account',
    ]) {
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('Under development')).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('the dev gallery route exists only in development builds', () => {
    const hasGallery = JSON.stringify(routes, (_key, value: unknown) =>
      typeof value === 'function' ? 'fn' : value,
    ).includes('dev/ui');
    expect(hasGallery).toBe(import.meta.env.DEV);
  });
});
