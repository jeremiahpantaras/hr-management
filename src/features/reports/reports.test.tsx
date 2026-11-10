import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { juan2026, makeBalance, makeEmployee } from '@/domain/testFixtures';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { ReportsPage } from '@/features/reports/ReportsPage';
import * as employeesService from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';
import type { LeaveBalance } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// The Excel layer is lazy: replace the module the dynamic import() resolves to.
const downloadLeaveCredits =
  vi.fn<(report: unknown, print: { paper: string; orientation: string }) => string>();
vi.mock('@/utils/excel/leaveCreditsReport', () => ({
  downloadLeaveCredits: (report: unknown, print: { paper: string; orientation: string }) =>
    downloadLeaveCredits(report, print),
}));

const juan = makeEmployee();
const data = juan2026();
const HEADING = 'BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026';

function renderPage(path = '/reports?year=2026&month=8') {
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

const preview = () => screen.findByLabelText('Report preview');
const clickPreview = () => userEvent.click(screen.getByRole('button', { name: 'Preview' }));
const clickDownload = () => userEvent.click(screen.getByRole('button', { name: /Download Excel/ }));

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  downloadLeaveCredits.mockReturnValue('BAGO-PLANT-LEAVE-CREDITS-AS-OF-AUGUST-2026_A4.xlsx');
  vi.mocked(employeesService.listEmployees).mockResolvedValue([juan]);
  vi.mocked(balancesService.getYearBalances).mockResolvedValue(data.balances);
  vi.mocked(balancesService.getBalancesForEmployeeYear).mockResolvedValue(data.balances);
  vi.mocked(ledgerService.getLedgerYear).mockResolvedValue(data.ledger);
});

describe('Reports page — the form', () => {
  it('before a preview it explains the next step and offers Preview and Download', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText(/select/i, { selector: 'p' })).toHaveTextContent('Preview');
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeEnabled();
  });

  it('starts with the company title, the chosen month, A4 landscape, archived excluded', () => {
    renderPage();
    expect(screen.getByLabelText('Report title')).toHaveValue('BAGO PLANT LEAVE CREDITS');
    expect(screen.getByRole('combobox', { name: 'As of month' })).toHaveTextContent('August');
    expect(screen.getByRole('radio', { name: 'A4' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Landscape' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Include archived' })).not.toBeChecked();
    // there is no leave type filter any more
    expect(screen.queryByRole('combobox', { name: 'Leave type' })).not.toBeInTheDocument();
  });

  it('remembers the title and the paper choice', async () => {
    const { unmount } = renderPage();
    const title = screen.getByLabelText('Report title');
    await userEvent.clear(title);
    await userEvent.type(title, 'ACME PLANT');
    await userEvent.click(screen.getByRole('radio', { name: 'Letter' }));
    unmount();
    renderPage();
    expect(screen.getByLabelText('Report title')).toHaveValue('ACME PLANT');
    expect(screen.getByRole('radio', { name: 'Letter' })).toHaveAttribute('aria-checked', 'true');
  });

  it('warns about a title that is too long', async () => {
    renderPage();
    const title = screen.getByLabelText('Report title');
    await userEvent.clear(title);
    await userEvent.paste('x'.repeat(81));
    expect(await screen.findByText(/The title is too long/)).toBeInTheDocument();
  });
});

describe('Reports page — preview (the company layout)', () => {
  it('shows the heading, the bands, the headers and Juan: 10 credits, Feb 2, Mar 1, Apr 1, May 1, used 5, remaining 5', async () => {
    renderPage();
    await clickPreview();
    const card = await preview();
    expect(within(card).getByRole('heading', { name: HEADING })).toBeInTheDocument();
    expect(within(card).getByText("EMPLOYEE'S INFORMATION")).toBeInTheDocument();
    expect(within(card).getByText('USED CREDITS AND DATE')).toBeInTheDocument();
    for (const header of [
      'NAME',
      'POSITION',
      'LOCATION',
      'TOTAL NO. OF UNUSED LEAVE CREDITS',
      'JAN',
      'DEC',
      'TOTAL OF USED LEAVE',
      'TOTAL REMAINING LEAVES',
    ]) {
      expect(within(card).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    const row = within(card).getByText('JUAN DELA CRUZ').closest('tr')!;
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'JUAN DELA CRUZ',
      'ACCOUNTING STAFF',
      'FINANCE',
      '10',
      '',
      '2',
      '1',
      '1',
      '1',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '5',
      '5',
    ]);
    expect(card).toHaveTextContent('Total 10 · Used 5 · Remaining 5');
    expect(within(card).getByText('Reconciled')).toBeInTheDocument();
    expect(balancesService.getYearBalances).toHaveBeenCalledWith(2026);
    expect(ledgerService.getLedgerYear).toHaveBeenCalledWith(2026, undefined);
  });

  it('the as-of month and the title change the heading, and an old preview is not shown', async () => {
    renderPage();
    await clickPreview();
    await preview();
    await userEvent.click(screen.getByRole('combobox', { name: 'As of month' }));
    await userEvent.click(await screen.findByRole('option', { name: 'January' }));
    await waitFor(() => {
      expect(screen.queryByLabelText('Report preview')).not.toBeInTheDocument();
    });
    const title = screen.getByLabelText('Report title');
    await userEvent.clear(title);
    await userEvent.type(title, 'acme plant');
    await clickPreview();
    expect(
      await within(await preview()).findByRole('heading', {
        name: 'ACME PLANT AS OF JANUARY 2026',
      }),
    ).toBeInTheDocument();
  });

  it('a fully used employee gets the dark row', async () => {
    vi.mocked(balancesService.getYearBalances).mockResolvedValue([
      makeBalance({ totalCredits: 10, totalUsed: 10 }),
    ]);
    renderPage();
    await clickPreview();
    const row = (await within(await preview()).findByText('JUAN DELA CRUZ')).closest('tr')!;
    expect(row).toHaveClass('bg-neutral');
  });

  it('archived employees appear only when asked for and only if they have credits', async () => {
    const old = makeEmployee({ id: 'old', fullName: 'Old Timer', isArchived: true });
    vi.mocked(employeesService.listEmployees).mockResolvedValue([juan, old]);
    vi.mocked(balancesService.getYearBalances).mockResolvedValue([
      ...data.balances,
      makeBalance({ id: 'old_2026', employeeId: 'old', totalCredits: 4, totalUsed: 1 }),
    ]);
    renderPage();
    await clickPreview();
    await within(await preview()).findByText('JUAN DELA CRUZ');
    expect(screen.queryByText('OLD TIMER')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include archived' }));
    await clickPreview();
    expect(await within(await preview()).findByText('OLD TIMER')).toBeInTheDocument();
  });

  it('shows "Loading 2026 records…" while the year loads', async () => {
    vi.mocked(ledgerService.getLedgerYear).mockReturnValue(new Promise(() => undefined));
    renderPage();
    await clickPreview();
    expect(await screen.findByText('Loading 2026 records…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
  });

  it('an empty list shows the no-employees message and disables Download', async () => {
    vi.mocked(employeesService.listEmployees).mockResolvedValue([]);
    renderPage();
    await clickPreview();
    expect(
      await screen.findByText('There are no employees to report for 2026 with these filters.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeDisabled();
  });

  it('TC-RPT-08: mismatched balances produce a visible, non-blocking warning', async () => {
    const tampered: LeaveBalance[] = data.balances.map((b, i) =>
      i === 0 ? { ...b, totalCredits: 999, availableCredits: 999 - b.totalUsed } : b,
    );
    vi.mocked(balancesService.getYearBalances).mockResolvedValue(tampered);
    renderPage();
    await clickPreview();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '1 balance doesn’t match their transaction history. The report shows the stored balances; check Leave History for the affected employees.',
    );
    expect(screen.queryByText('Reconciled')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Excel/ })).toBeEnabled();
  });

  it('shows an error with Retry when the year cannot be loaded', async () => {
    vi.mocked(ledgerService.getLedgerYear).mockRejectedValueOnce(new AppError('OFFLINE'));
    renderPage();
    await clickPreview();
    expect(await screen.findByText("You're offline. Reconnect and try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByLabelText('Report preview')).toBeInTheDocument();
  });
});

describe('Reports page — download', () => {
  it('builds the report if needed and exports it with the chosen paper, then confirms', async () => {
    renderPage();
    await clickDownload();
    await waitFor(() => {
      expect(downloadLeaveCredits).toHaveBeenCalledTimes(1);
    });
    const [report, print] = downloadLeaveCredits.mock.calls[0]!;
    expect((report as { heading: string }).heading).toBe(HEADING);
    expect(print).toEqual({ paper: 'A4', orientation: 'landscape' });
    expect(toast.success).toHaveBeenCalledWith(
      'Downloaded BAGO-PLANT-LEAVE-CREDITS-AS-OF-AUGUST-2026_A4.xlsx.',
    );
  });

  it('passes Letter / portrait when chosen', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Letter' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Portrait' }));
    await clickDownload();
    await waitFor(() => {
      expect(downloadLeaveCredits).toHaveBeenCalled();
    });
    expect(downloadLeaveCredits.mock.calls[0]?.[1]).toEqual({
      paper: 'LETTER',
      orientation: 'portrait',
    });
  });

  it('after a preview, Download reuses it — the year is not loaded twice', async () => {
    renderPage();
    await clickPreview();
    await preview();
    await clickDownload();
    await waitFor(() => {
      expect(downloadLeaveCredits).toHaveBeenCalledTimes(1);
    });
    expect(ledgerService.getLedgerYear).toHaveBeenCalledTimes(1);
  });

  it('?employee= selects the employee and narrows the reads', async () => {
    renderPage('/reports?year=2026&month=8&employee=emp1');
    await clickDownload();
    await waitFor(() => {
      expect(downloadLeaveCredits).toHaveBeenCalled();
    });
    expect(balancesService.getBalancesForEmployeeYear).toHaveBeenCalledWith('emp1', 2026);
    expect(ledgerService.getLedgerYear).toHaveBeenCalledWith(2026, 'emp1');
  });

  it('a different year is a different preview (the old one is not shown)', async () => {
    renderPage();
    await clickPreview();
    await preview();
    await userEvent.click(screen.getByRole('combobox', { name: 'Leave year' }));
    await userEvent.click(await screen.findByRole('option', { name: '2025' }));
    await waitFor(() => {
      expect(screen.queryByLabelText('Report preview')).not.toBeInTheDocument();
    });
  });

  it('a failure while creating the workbook is reported, not swallowed', async () => {
    downloadLeaveCredits.mockImplementation(() => {
      throw new Error('boom');
    });
    renderPage();
    await clickDownload();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("The Excel file couldn't be created. Try again.");
    });
  });
});
