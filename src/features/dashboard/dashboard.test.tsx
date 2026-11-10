import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import * as employeesService from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';
import type { Employee, LeaveBalance, LeaveTransaction } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');

const YEAR = new Date().getFullYear();
const NOW = new Date('2026-02-10T08:00:00Z');

function employee(id: string, name: string, isArchived = false): Employee {
  return {
    id,
    employeeNumber: `EMP-${id}`,
    employeeNumberKey: `EMP-${id}`,
    fullName: name,
    position: 'Staff',
    department: null,
    employmentStatus: 'Regular',
    isArchived,
    archivedAt: null,
    archivedBy: null,
    createdAt: NOW,
    createdBy: 'hr1',
    updatedAt: NOW,
    updatedBy: 'hr1',
  };
}
const juan = employee('juan', 'Juan Dela Cruz');
const ana = employee('ana', 'Ana Reyes');
const bea = employee('bea', 'Bea Cruz');
const zed = employee('zed', 'Zed Zero');
const mario = employee('mario', 'Mario Santos', true);

const bal = (employeeId: string, credits: number, used: number): LeaveBalance => ({
  id: `${employeeId}_${String(YEAR)}`,
  employeeId,
  year: YEAR,
  totalCredits: credits,
  totalUsed: used,
  availableCredits: credits - used,
  lastTransactionId: 'T'.repeat(20),
  createdAt: null,
  updatedAt: null,
});
function entry(id: string, over: Partial<LeaveTransaction> = {}): LeaveTransaction {
  return {
    id,
    employeeId: 'juan',
    employeeNumberSnapshot: 'EMP-juan',
    employeeNameSnapshot: 'Juan Dela Cruz',
    positionSnapshot: 'Staff',
    departmentSnapshot: null,
    leaveYear: YEAR,
    balanceId: `juan_${String(YEAR)}`,
    transactionType: 'ALLOCATION',
    days: 10,
    creditsDelta: 10,
    usedDelta: 0,
    dateFrom: null,
    dateTo: null,
    remarks: null,
    reversesTransactionId: null,
    reversesType: null,
    reversedByTransactionId: null,
    resultingTotalCredits: 10,
    resultingTotalUsed: 0,
    createdBy: 'hr1',
    createdByName: 'Maria Santos',
    createdAt: NOW,
    ...over,
  };
}

function renderDashboard(path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const card = (title: string) => screen.getByText(title).closest<HTMLElement>('[aria-busy]')!;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(employeesService.listEmployees).mockResolvedValue([juan, ana, bea, zed, mario]);
  // One dataset drives the totals and the low balances (both computed from the year's balances):
  //   credits 22 · used 13.5 · unused 8.5.
  vi.mocked(balancesService.getYearBalances).mockResolvedValue([
    bal('juan', 10, 3),
    bal('ana', 4, 4), // depleted
    bal('bea', 4, 2.5), // low: 1.5 left
    bal('mario', 4, 4), // archived → excluded from low balances
    bal('zed', 0, 0), // no credits → excluded from low balances
  ]);
  vi.mocked(balancesService.getBalancesForEmployees).mockResolvedValue([
    bal('juan', 10, 3),
    bal('ana', 4, 4),
    bal('bea', 4, 2.5),
  ]);
  vi.mocked(ledgerService.listLedgerPage).mockImplementation((params) =>
    Promise.resolve({
      items:
        params.transactionType === 'ALLOCATION'
          ? [entry('A'.repeat(20))]
          : [
              entry('B'.repeat(20), {
                transactionType: 'USAGE',
                days: 2,
                creditsDelta: 0,
                usedDelta: 2,
                dateFrom: `${String(YEAR)}-02-10`,
                dateTo: `${String(YEAR)}-02-11`,
              }),
              entry('A'.repeat(20)),
            ],
      nextCursor: null,
      hasMore: false,
    }),
  );
  vi.mocked(ledgerService.newTransactionId).mockReturnValue('Tx000000000000000001');
});

describe('Dashboard figures (TC-DASH-01/03, BR-CALC-03, BR-EMP-08)', () => {
  it('shows the five stat cards: total vs active employees and the year totals 22 / 13.5 / 8.5', async () => {
    renderDashboard();
    const value = async (label: string) => {
      const node = (await screen.findByText(label)).closest<HTMLElement>('div.flex-col')!;
      await waitFor(() => {
        expect(within(node).queryByRole('status')).not.toBeInTheDocument();
      });
      return node.textContent;
    };
    expect(await value('Total Employees')).toContain('5');
    expect(await value('Active Employees')).toMatch(/4.*of 5 total/);
    expect(await value('Total Credits')).toContain('22');
    expect(await value('Total Used')).toMatch(/13\.5.*61% of credits/);
    expect(await value('Total Unused')).toContain('8.5');
    expect(balancesService.getYearBalances).toHaveBeenCalledWith(YEAR);
  });

  it('TC-DASH-02: the year caption is shown and a different ?year= changes every query', async () => {
    renderDashboard(`/?year=${String(YEAR - 1)}`);
    expect(
      await screen.findByText(new RegExp(`Leave figures for ${String(YEAR - 1)}`)),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(balancesService.getYearBalances).toHaveBeenCalledWith(YEAR - 1);
    });
    expect(ledgerService.listLedgerPage).toHaveBeenCalledWith(
      expect.objectContaining({ year: YEAR - 1, pageSize: 8 }),
    );
    expect(screen.getByRole('combobox', { name: 'Leave year' })).toHaveTextContent(
      String(YEAR - 1),
    );
  });
});

describe('Low & depleted balances (TC-DASH-04)', () => {
  it('flags ≤ 2 as Low and 0 as Depleted, lowest first, excluding archived employees and zero-credit balances', async () => {
    renderDashboard();
    const widget = await screen.findByText('Low & depleted balances');
    const list = widget.closest<HTMLElement>('[aria-busy]')!;
    await within(list).findByText('Depleted');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Ana Reyes');
    expect(items[0]).toHaveTextContent('Depleted');
    expect(items[1]).toHaveTextContent('Bea Cruz');
    expect(items[1]).toHaveTextContent('1.5 left');
    expect(items[1]).toHaveTextContent('Low');
    expect(within(list).queryByText(/Mario Santos/)).not.toBeInTheDocument();
    expect(within(list).queryByText(/Juan Dela Cruz/)).not.toBeInTheDocument();
    expect(within(list).queryByText(/Zed Zero/)).not.toBeInTheDocument();
    expect(within(list).getAllByRole('link', { name: /Ana Reyes/ })[0]).toHaveAttribute(
      'href',
      `/employees/ana?year=${String(YEAR)}`,
    );
  });

  it('says so when nobody is low', async () => {
    vi.mocked(balancesService.getYearBalances).mockResolvedValue([bal('juan', 10, 3)]);
    renderDashboard();
    expect(
      await screen.findByText('No low balances. Everyone has more than 2 days available.'),
    ).toBeInTheDocument();
  });
});

describe('Recent lists (TC-DASH-06)', () => {
  it('shows the newest transactions and allocations for the year with View all links', async () => {
    renderDashboard();
    const recent = (await screen.findByText('Recent leave transactions')).closest<HTMLElement>(
      '[aria-busy]',
    )!;
    await within(recent).findByText('−2 days');
    expect(within(recent).getByText('+10 credits')).toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      `/leave-history?year=${String(YEAR)}`,
    );
    const alloc = (await screen.findByText('Recent credit allocations')).closest<HTMLElement>(
      '[aria-busy]',
    )!;
    await within(alloc).findByText('+10 credits');
    expect(within(alloc).getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      `/leave-credits?tab=history&year=${String(YEAR)}`,
    );
    expect(ledgerService.listLedgerPage).toHaveBeenCalledWith({ year: YEAR, pageSize: 8 });
    expect(ledgerService.listLedgerPage).toHaveBeenCalledWith({
      year: YEAR,
      pageSize: 8,
      transactionType: 'ALLOCATION',
    });
  });
});

describe('Balance overview', () => {
  it('lists active employees (archived excluded) with year totals and a link to each', async () => {
    renderDashboard();
    const table = await screen.findByRole('table', {
      name: `Employee leave balances for ${String(YEAR)}`,
    });
    await within(table).findByText('Juan Dela Cruz');
    expect(within(table).queryByText('Mario Santos')).not.toBeInTheDocument();
    const row = within(table).getByText('Juan Dela Cruz').closest<HTMLElement>('tr')!;
    expect(row).toHaveTextContent(/10.*3.*7/);
    expect(within(table).getByRole('link', { name: 'Open Juan Dela Cruz' })).toHaveAttribute(
      'href',
      `/employees/juan?year=${String(YEAR)}`,
    );
    expect(balancesService.getBalancesForEmployees).toHaveBeenCalledWith(
      ['ana', 'bea', 'juan', 'zed'],
      YEAR,
    );
  });
});

describe('States (TC-DASH-07/08)', () => {
  it('TC-DASH-07: a year with no credits shows the empty card with an Allocate credits action', async () => {
    vi.mocked(balancesService.getYearBalances).mockResolvedValue([]);
    renderDashboard();
    expect(
      await screen.findByText(`No leave credits have been allocated for ${String(YEAR)}.`),
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Allocate credits' });
    await userEvent.click(buttons[0]!);
    expect(await screen.findByRole('dialog', { name: 'Allocate credits' })).toBeInTheDocument();
  });

  it('TC-DASH-08: when one widget fails the others still render, and its Retry works', async () => {
    vi.mocked(balancesService.getYearBalances).mockRejectedValueOnce(new AppError('UNKNOWN'));
    renderDashboard();
    const low = (await screen.findByText('Low & depleted balances')).closest<HTMLElement>(
      '[aria-busy]',
    )!;
    expect(await within(low).findByText('Something went wrong. Try again.')).toBeInTheDocument();
    // the rest of the page is fine
    expect(await screen.findByText('Recent leave transactions')).toBeInTheDocument();
    expect(
      await screen.findByRole('table', { name: /Employee leave balances/ }),
    ).toBeInTheDocument();
    await userEvent.click(within(low).getByRole('button', { name: /retry/i }));
    expect(await within(low).findByText('Depleted')).toBeInTheDocument();
  });

  it('shows a skeleton while a widget loads', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockReturnValue(new Promise(() => undefined));
    renderDashboard();
    expect(
      await screen.findByRole('status', { name: 'Loading Recent leave transactions' }),
    ).toBeInTheDocument();
    expect(card('Recent credit allocations')).toHaveAttribute('aria-busy', 'true');
  });

  it('Refresh refetches the figures', async () => {
    renderDashboard();
    await screen.findByText('Depleted');
    const calls = vi.mocked(balancesService.getYearBalances).mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(vi.mocked(balancesService.getYearBalances).mock.calls.length).toBeGreaterThan(calls);
    });
  });

  it('an error on the employee list shows one error card, not a blank page', async () => {
    vi.mocked(employeesService.listEmployees).mockRejectedValue(new AppError('OFFLINE'));
    renderDashboard();
    expect(
      (await screen.findAllByText("You're offline. Reconnect and try again.")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });
});
