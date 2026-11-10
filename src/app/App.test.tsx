import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';
import { ACTIVE_ADMIN, FakeAuthBackend } from '@/features/auth/fakeAuthBackend';
import type { EnvResult } from '@/lib/env';
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

/** A signed-in admin, so the shell can render (the Firebase services are replaced by a fake). */
function signInFakeAdmin(): void {
  vi.resetAllMocks();
  const backend = new FakeAuthBackend();
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
  backend.addAccount({ email: 'maria@example.test', password: 'pw', profile: ACTIVE_ADMIN });
  backend.restoreSession('maria@example.test');
}

const validEnv: EnvResult = {
  ok: true,
  env: {
    firebase: {
      apiKey: 'demo-api-key',
      authDomain: 'demo-hr-leave.firebaseapp.com',
      projectId: 'demo-hr-leave',
      appId: '1:000000000000:web:demo',
    },
    useEmulators: true,
  },
};

const envKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

beforeEach(() => {
  signInFakeAdmin();
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.pushState({}, '', '/');
});

describe('App', () => {
  it('renders the application shell with the Dashboard when the environment is valid', async () => {
    render(<App env={validEnv} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.title).toBe('Dashboard · HR Leave Monitor');
  });

  it('shows the Configuration error screen listing invalid variable names (no shell)', () => {
    render(
      <App env={{ ok: false, invalidKeys: ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID'] }} />,
    );

    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Configuration error' })).toBeInTheDocument();
    expect(within(alert).getByText('VITE_FIREBASE_API_KEY')).toBeInTheDocument();
    expect(within(alert).getByText('VITE_FIREBASE_APP_ID')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  describe('wired to the real environment parser', () => {
    it('renders the Configuration error screen when the VITE_ variables are missing', async () => {
      // Real parser, empty values. (No `vi.resetModules()`: it would give lazily loaded pages
      // different module instances than the rest of this file for every later test.)
      const { parseEnv } = await import('@/lib/env');
      const env = parseEnv(Object.fromEntries(envKeys.map((key) => [key, ''])));

      render(<App env={env} />);

      const alert = screen.getByRole('alert');
      for (const key of envKeys) expect(alert).toHaveTextContent(key);
    });

    it('renders the application when the VITE_ variables are valid', async () => {
      // No `vi.resetModules()` here: the lazily loaded pages must share this test's module
      // instances (auth context, mocked services). The real parser is run on valid values.
      const { parseEnv } = await import('@/lib/env');
      const env = parseEnv({
        VITE_FIREBASE_API_KEY: 'demo-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'demo-hr-leave.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'demo-hr-leave',
        VITE_FIREBASE_APP_ID: '1:000000000000:web:demo',
        VITE_USE_FIREBASE_EMULATORS: 'true',
      });

      render(<App env={env} />);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Dashboard' }),
      ).toBeInTheDocument();
    });
  });
});
