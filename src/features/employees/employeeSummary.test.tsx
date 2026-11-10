import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { EmployeeDetailPage } from '@/features/employees/EmployeeDetailPage';
import * as employeesService from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';
import type { Employee, LeaveBalance, LeaveTransaction } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const YEAR = new Date().getFullYear();
const NOW = new Date('2026-02-10T08:00:00Z');

const juan: Employee = {
  id: 'juan',
  employeeNumber: 'EMP-0042',
  employeeNumberKey: 'EMP-0042',
  fullName: 'Juan Dela Cruz',
  position: 'Accounting Staff',
  department: 'Finance',
  employmentStatus: 'Regular',
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  createdAt: NOW,
  createdBy: 'hr1',
  updatedAt: NOW,
  updatedBy: 'hr1',
};
const archived: Employee = { ...juan, id: 'arch', fullName: 'Mario Santos', isArchived: true };

const bal = (credits: number, used: number, year = YEAR): LeaveBalance => ({
  id: `juan_${String(year)}`,
  employeeId: 'juan',
  year,
  totalCredits: credits,
  totalUsed: used,
  availableCredits: credits - used,
  lastTransactionId: 'T'.repeat(20),
  createdAt: null,
  updatedAt: null,
});
const juan2026 = [bal(10, 5)];

function entry(id: string, over: Partial<LeaveTransaction> = {}): LeaveTransaction {
  return {
    id,
    employeeId: 'juan',
    employeeNumberSnapshot: 'EMP-0042',
    employeeNameSnapshot: 'Juan Dela Cruz',
    positionSnapshot: 'Accounting Staff',
    departmentSnapshot: 'Finance',
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

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/employees/:employeeId" element={<EmployeeDetailPage />} />
            <Route path="/reports" element={<p>reports page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(employeesService.listEmployees).mockResolvedValue([juan, archived]);
  vi.mocked(employeesService.getEmployee).mockImplementation((id) =>
    Promise.resolve([juan, archived].find((e) => e.id === id) ?? null),
  );
  vi.mocked(employeesService.archiveEmployee).mockResolvedValue(undefined);
  vi.mocked(employeesService.restoreEmployee).mockResolvedValue(undefined);
  vi.mocked(balancesService.getBalancesForEmployeeYear).mockImplementation((_id, year) =>
    Promise.resolve(year === YEAR ? juan2026 : []),
  );
  vi.mocked(balancesService.getBalance).mockResolvedValue(null);
  vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.mocked(ledgerService.newTransactionId).mockReturnValue('Tx000000000000000001');
});

describe('Juan-2026 summary (TC-SUM-02, FR-SUM-02/03)', () => {
  it('shows the three tiles 10 / 5 / 5 and a progress bar of the credits used', async () => {
    renderAt('/employees/juan');
    const tiles = (
      await screen.findByRole('heading', { name: `Leave summary for ${String(YEAR)}` })
    ).closest('section')!;
    await within(tiles).findByRole('progressbar', {
      name: `Juan Dela Cruz — ${String(YEAR)} days used`,
    });
    expect(within(tiles).getByText('Total Days').closest('div.flex-col')).toHaveTextContent('10');
    expect(within(tiles).getByText('Total Used').closest('div.flex-col')).toHaveTextContent('5');
    expect(within(tiles).getByText('Total Unused').closest('div.flex-col')).toHaveTextContent('5');
    expect(within(tiles).getByText('5 used of 10')).toBeInTheDocument();
    // there is no per-leave-type breakdown any more
    expect(screen.queryByRole('table', { name: /leave breakdown/ })).not.toBeInTheDocument();
    expect(balancesService.getBalancesForEmployeeYear).toHaveBeenCalledWith('juan', YEAR);
  });

  it('shows the identity block and a year selector bound to ?year=', async () => {
    renderAt(`/employees/juan?year=${String(YEAR - 1)}`);
    expect(await screen.findByRole('heading', { name: 'Juan Dela Cruz' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Leave year' })).toHaveTextContent(
      String(YEAR - 1),
    );
    // TC-SUM-03: another year has no data → zeros and the empty message; this year's figures are not shown
    expect(
      await screen.findByText(
        `No days have been allocated to this employee for ${String(YEAR - 1)}.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(balancesService.getBalancesForEmployeeYear).toHaveBeenCalledWith('juan', YEAR - 1);
  });

  it('shows an error with Retry when the summary cannot load', async () => {
    vi.mocked(balancesService.getBalancesForEmployeeYear).mockRejectedValueOnce(
      new AppError('OFFLINE'),
    );
    renderAt('/employees/juan');
    expect(await screen.findByText("You're offline. Reconnect and try again.")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /retry/i })[0]!);
    expect(await screen.findByText('5 used of 10')).toBeInTheDocument();
  });
});

describe('Transaction history (TC-SUM-06/07)', () => {
  const rows = [
    entry('B'.repeat(20), {
      transactionType: 'USAGE',
      days: 2,
      creditsDelta: 0,
      usedDelta: 2,
      dateFrom: `${String(YEAR)}-02-10`,
      dateTo: `${String(YEAR)}-02-11`,
      reversedByTransactionId: `rev_${'B'.repeat(20)}`,
    }),
    entry(`rev_${'B'.repeat(20)}`, {
      transactionType: 'REVERSAL',
      reversesType: 'USAGE',
      reversesTransactionId: 'B'.repeat(20),
      days: 2,
      creditsDelta: 0,
      usedDelta: -2,
      dateFrom: `${String(YEAR)}-02-10`,
      dateTo: `${String(YEAR)}-02-11`,
    }),
    entry('A'.repeat(20)),
  ];

  it('queries only this employee and year, and shows the signed effects with Reversed / Reversal-of labels', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: rows,
      nextCursor: null,
      hasMore: false,
    });
    renderAt('/employees/juan');
    const table = await screen.findByRole('table', {
      name: /Transaction history for Juan Dela Cruz/,
    });
    await within(table).findByText('+10 days');
    expect(within(table).getByText('−2 days')).toBeInTheDocument();
    expect(within(table).getByText('+2 days (reversal)')).toBeInTheDocument();
    expect(within(table).getByText('Reversed')).toBeInTheDocument();
    expect(within(table).getByText(/Reversal of …BBBBBB/)).toBeInTheDocument();
    expect(ledgerService.listLedgerPage).toHaveBeenCalledWith(
      expect.objectContaining({ year: YEAR, employeeId: 'juan' }),
    );
    // the employee filter is hidden because the list is already scoped
    expect(screen.queryByRole('combobox', { name: /All employees/ })).not.toBeInTheDocument();
  });

  it('empty history says so, with an Allocate CTA', async () => {
    renderAt('/employees/juan');
    expect(await screen.findByText(`No transactions for ${String(YEAR)}.`)).toBeInTheDocument();
  });
});

describe('Actions and the archived employee (TC-SUM-08, R-03)', () => {
  it('an active employee can be edited, allocated to, recorded for, exported and archived', async () => {
    renderAt('/employees/juan');
    await screen.findByRole('heading', { name: 'Juan Dela Cruz' });
    expect(screen.getByRole('button', { name: 'Allocate days' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Record usage' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Export Excel' })).toHaveAttribute(
      'href',
      `/reports?employee=juan&year=${String(YEAR)}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Allocate days' }));
    const dialog = await screen.findByRole('dialog', { name: 'Allocate days' });
    expect(within(dialog).getByRole('combobox', { name: /^Employee/ })).toHaveTextContent(
      'Juan Dela Cruz',
    );
  });

  it('Archive asks for confirmation and then archives', async () => {
    renderAt('/employees/juan');
    await screen.findByRole('heading', { name: 'Juan Dela Cruz' });
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', { name: 'Archive Juan Dela Cruz?' });
    expect(employeesService.archiveEmployee).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Archive employee' }));
    await waitFor(() => {
      expect(employeesService.archiveEmployee).toHaveBeenCalledWith('juan', 'hr1');
    });
    expect(toast.success).toHaveBeenCalledWith('Archived Juan Dela Cruz.');
  });

  it('an archived employee shows the banner, disables Allocate/Record, offers Restore, keeps history and Reverse', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: [entry('A'.repeat(20), { employeeId: 'arch' })],
      nextCursor: null,
      hasMore: false,
    });
    renderAt('/employees/arch');
    expect(
      await screen.findByText('This employee is archived. History is read-only.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allocate days' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record usage' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    // history stays visible and a reversal is still possible (R-03)
    expect(await screen.findByText('+10 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reverse allocation for/ })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Restore employee' }));
    await waitFor(() => {
      expect(employeesService.restoreEmployee).toHaveBeenCalledWith('arch', 'hr1');
    });
  });
});
