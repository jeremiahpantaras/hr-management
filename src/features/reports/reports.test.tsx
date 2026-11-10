import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { juan2026, makeEmployee, VACATION, SICK, EMERGENCY } from '@/domain/testFixtures';
import * as employeesService from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';
import * as typesService from '@/services/leaveTypes.service';
import type { LeaveBalance } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');
vi.mock('@/services/leaveTypes.service');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// The Excel layer is lazy: replace the module the dynamic import() resolves to.
const downloadReport = vi.fn<(report: unknown, employeeNumber?: string | null) => string>();
vi.mock('@/utils/excel/exportReport', () => ({
  downloadReport: (report: unknown, employeeNumber?: string | null) =>
    downloadReport(report, employeeNumber),
}));

const juan = makeEmployee();
const data = juan2026();

function renderPage(path = '/reports?year=2026') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/reports" element={<ReportsPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  downloadReport.mockReturnValue('HR-Leave-Report_2026_20261109-1405.xlsx');
  vi.mocked(employeesService.listEmployees).mockResolvedValue([juan]);
  vi.mocked(typesService.listLeaveTypes).mockResolvedValue([EMERGENCY, SICK, VACATION]);
  vi.mocked(balancesService.getYearBalances).mockResolvedValue(data.balances);
  vi.mocked(balancesService.getBalancesForEmployeeYear).mockResolvedValue(data.balances);
  vi.mocked(ledgerService.getLedgerYear).mockResolvedValue(data.ledger);
});

describe('Reports page (UI §6.12, TC-RPT-11)', () => {
  it('before a preview it explains the next step and offers Preview and Download', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText(/select/i, { selector: 'p' })).toHaveTextContent('Preview');
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeEnabled();
  });

  it('Preview loads the year once and shows counts, totals 18/5/13 and "Reconciled"', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await screen.findByLabelText('Report preview');
    expect(preview).toHaveTextContent('1 employee · 3 balance rows · 7 transactions');
    expect(preview).toHaveTextContent('Totals (2026): Credits 18 · Used 5 · Unused 13');
    expect(within(preview).getByText('Reconciled')).toBeInTheDocument();
    expect(preview).toHaveTextContent(
      'Report Info · Employee Summary · Leave Breakdown · Transactions',
    );
    expect(balancesService.getYearBalances).toHaveBeenCalledWith(2026);
    expect(ledgerService.getLedgerYear).toHaveBeenCalledWith(2026, undefined);
  });

  it('shows "Loading 2026 records…" while the year loads', async () => {
    vi.mocked(ledgerService.getLedgerYear).mockReturnValue(new Promise(() => undefined));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('Loading 2026 records…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
  });

  it('Download builds (if needed) and exports the same report, then confirms', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Download Excel/ }));
    await waitFor(() => {
      expect(downloadReport).toHaveBeenCalledTimes(1);
    });
    const [report, employeeNumber] = downloadReport.mock.calls[0]!;
    expect((report as { info: { totalCredits: number } }).info.totalCredits).toBe(18);
    expect(employeeNumber).toBeNull();
    expect(toast.success).toHaveBeenCalledWith(
      'Downloaded HR-Leave-Report_2026_20261109-1405.xlsx.',
    );
  });

  it('after a preview, Download reuses it — the year is not loaded twice', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByLabelText('Report preview');
    await userEvent.click(screen.getByRole('button', { name: /Download Excel/ }));
    await waitFor(() => {
      expect(downloadReport).toHaveBeenCalledTimes(1);
    });
    expect(ledgerService.getLedgerYear).toHaveBeenCalledTimes(1);
  });

  it('?employee= selects the employee, narrows the reads, and names the file after them', async () => {
    renderPage('/reports?year=2026&employee=emp1');
    await userEvent.click(screen.getByRole('button', { name: /Download Excel/ }));
    await waitFor(() => {
      expect(downloadReport).toHaveBeenCalled();
    });
    expect(balancesService.getBalancesForEmployeeYear).toHaveBeenCalledWith('emp1', 2026);
    expect(ledgerService.getLedgerYear).toHaveBeenCalledWith(2026, 'emp1');
    expect(downloadReport.mock.calls[0]?.[1]).toBe('EMP-0042');
  });

  it('a different year is a different preview (the old one is not shown)', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByLabelText('Report preview');
    await userEvent.click(screen.getByRole('combobox', { name: 'Leave year' }));
    await userEvent.click(await screen.findByRole('option', { name: '2025' }));
    await waitFor(() => {
      expect(screen.queryByLabelText('Report preview')).not.toBeInTheDocument();
    });
  });

  it('a leave type filter narrows the previewed totals', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('combobox', { name: 'Leave type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Vacation Leave' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = await screen.findByLabelText('Report preview');
    expect(preview).toHaveTextContent('Credits 10 · Used 3 · Unused 7');
  });

  it('an empty year shows the no-records message and disables Download', async () => {
    vi.mocked(balancesService.getYearBalances).mockResolvedValue([]);
    vi.mocked(ledgerService.getLedgerYear).mockResolvedValue([]);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(
      await screen.findByText('There are no records for 2026 with these filters.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeDisabled();
  });

  it('TC-RPT-08: mismatched balances produce a visible, non-blocking warning', async () => {
    const tampered: LeaveBalance[] = data.balances.map((b, i) =>
      i === 0 ? { ...b, totalCredits: 999, availableCredits: 999 - b.totalUsed } : b,
    );
    vi.mocked(balancesService.getYearBalances).mockResolvedValue(tampered);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '1 balance doesn’t match their transaction history. The export still includes both; see Report Info.',
    );
    expect(screen.queryByText('Reconciled')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeEnabled();
  });

  it('shows an error with Retry when the year cannot be loaded', async () => {
    vi.mocked(ledgerService.getLedgerYear).mockRejectedValueOnce(new AppError('OFFLINE'));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText("You're offline. Reconnect and try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByLabelText('Report preview')).toBeInTheDocument();
  });

  it('a failure while creating the workbook is reported, not swallowed', async () => {
    downloadReport.mockImplementation(() => {
      throw new Error('boom');
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Download Excel/ }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("The Excel file couldn't be created. Try again.");
    });
  });
});
