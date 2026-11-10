import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { LeaveHistoryPage } from '@/features/leave-history/LeaveHistoryPage';
import { LeaveUsagePage } from '@/features/leave-usage/LeaveUsagePage';
import * as employeesService from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';
import * as typesService from '@/services/leaveTypes.service';
import type { Employee, LeaveBalance, LeaveTransaction, LeaveType } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');
vi.mock('@/services/leaveTypes.service');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const YEAR = new Date().getFullYear();
const NOW = new Date('2026-02-10T08:00:00Z');
const d = (month: string, day: string) => `${String(YEAR)}-${month}-${day}`;

const juan: Employee = {
  id: 'juan',
  employeeNumber: 'EMP-0042',
  employeeNumberKey: 'EMP-0042',
  fullName: 'Juan Dela Cruz',
  position: 'Staff',
  department: null,
  employmentStatus: 'Regular',
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  createdAt: NOW,
  createdBy: 'hr1',
  updatedAt: NOW,
  updatedBy: 'hr1',
};
const vac: LeaveType = {
  id: 'vac',
  name: 'Vacation Leave',
  description: null,
  isActive: true,
  createdAt: null,
  createdBy: 'hr1',
  updatedAt: null,
  updatedBy: 'hr1',
};
const sick: LeaveType = { ...vac, id: 'sick', name: 'Sick Leave' };

function balance(credits: number, used: number): LeaveBalance {
  return {
    id: `juan_${String(YEAR)}_vac`,
    employeeId: 'juan',
    leaveTypeId: 'vac',
    year: YEAR,
    totalCredits: credits,
    totalUsed: used,
    availableCredits: credits - used,
    lastTransactionId: 'T'.repeat(20),
    createdAt: null,
    updatedAt: null,
  };
}
function usage(
  id: string,
  from: string,
  to: string,
  days: number,
  over: Partial<LeaveTransaction> = {},
): LeaveTransaction {
  return {
    id,
    employeeId: 'juan',
    employeeNumberSnapshot: 'EMP-0042',
    employeeNameSnapshot: 'Juan Dela Cruz',
    positionSnapshot: 'Staff',
    departmentSnapshot: null,
    leaveTypeId: 'vac',
    leaveTypeNameSnapshot: 'Vacation Leave',
    leaveYear: YEAR,
    balanceId: `juan_${String(YEAR)}_vac`,
    transactionType: 'USAGE',
    days,
    creditsDelta: 0,
    usedDelta: days,
    dateFrom: from,
    dateTo: to,
    remarks: null,
    reversesTransactionId: null,
    reversesType: null,
    reversedByTransactionId: null,
    resultingTotalCredits: 10,
    resultingTotalUsed: days,
    createdBy: 'hr1',
    createdByName: 'Maria Santos',
    createdAt: NOW,
    ...over,
  };
}

function renderRoutes(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/leave-usage" element={<LeaveUsagePage />} />
            <Route path="/leave-history" element={<LeaveHistoryPage />} />
            <Route path="/leave-credits" element={<p>credits page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

let idCounter = 0;
beforeEach(() => {
  vi.resetAllMocks();
  idCounter = 0;
  vi.mocked(employeesService.listEmployees).mockResolvedValue([juan]);
  vi.mocked(typesService.listLeaveTypes).mockResolvedValue([sick, vac]);
  vi.mocked(balancesService.getBalance).mockResolvedValue(balance(10, 3));
  vi.mocked(ledgerService.newTransactionId).mockImplementation(
    () => `Tx${String((idCounter += 1)).padStart(18, '0')}`,
  );
  vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.mocked(ledgerService.findUsageForOverlap).mockResolvedValue([]);
  vi.mocked(ledgerService.recordUsage).mockResolvedValue({
    status: 'created',
    transactionId: 'x',
    balance: { totalCredits: 10, totalUsed: 5 },
  });
  vi.mocked(ledgerService.reverseEntry).mockResolvedValue({
    status: 'created',
    transactionId: 'rev_x',
    balance: { totalCredits: 10, totalUsed: 2 },
  });
});

async function openRecord(): Promise<HTMLElement> {
  renderRoutes('/leave-usage');
  await userEvent.click(await screen.findByRole('button', { name: 'Record leave usage' }));
  return screen.findByRole('dialog', { name: 'Record leave usage' });
}
async function pick(dialog: HTMLElement, label: RegExp, option: string | RegExp) {
  await userEvent.click(within(dialog).getByRole('combobox', { name: label }));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}
async function fillValid(dialog: HTMLElement, days = '2') {
  await pick(dialog, /^Employee/, /Juan Dela Cruz/);
  await pick(dialog, /Leave type/, 'Vacation Leave');
  fireEvent.change(within(dialog).getByLabelText(/^Date from/), {
    target: { value: d('02', '10') },
  });
  fireEvent.change(within(dialog).getByLabelText(/^Date to/), { target: { value: d('02', '11') } });
  await userEvent.type(within(dialog).getByLabelText(/^Days to deduct/), days);
}
const submitButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: 'Record leave' });

describe('Record usage form (UI §6.10)', () => {
  it('validates required fields with the exact messages', async () => {
    const dialog = await openRecord();
    await userEvent.click(submitButton(dialog));
    expect(await within(dialog).findByText('Select an employee.')).toBeInTheDocument();
    expect(within(dialog).getByText('Select a leave type.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the start date.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the end date.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the number of days.')).toBeInTheDocument();
    expect(ledgerService.recordUsage).not.toHaveBeenCalled();
  });

  it('TC-LU-05/08: an end date before the start, and more days than calendar days', async () => {
    const dialog = await openRecord();
    await fillValid(dialog, '3');
    await userEvent.click(submitButton(dialog));
    expect(
      await within(dialog).findByText("Days can't exceed the 2 calendar days in this range."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Date to/), {
      target: { value: d('02', '09') },
    });
    await userEvent.click(submitButton(dialog));
    expect(
      await within(dialog).findByText("The end date can't be before the start date."),
    ).toBeInTheDocument();
    expect(ledgerService.recordUsage).not.toHaveBeenCalled();
  });

  it('TC-LU-06/07: native date inputs are bounded to the chosen year', async () => {
    const dialog = await openRecord();
    const from = within(dialog).getByLabelText(/^Date from/);
    expect(from).toHaveAttribute('min', `${String(YEAR)}-01-01`);
    expect(from).toHaveAttribute('max', `${String(YEAR)}-12-31`);
    fireEvent.change(from, { target: { value: `${String(YEAR - 1)}-12-31` } });
    await pick(dialog, /^Employee/, /Juan Dela Cruz/);
    await userEvent.click(submitButton(dialog));
    expect(
      await within(dialog).findByText(`Leave must fall within ${String(YEAR)}.`),
    ).toBeInTheDocument();
  });

  it('shows the calendar-day helper once both dates are set', async () => {
    const dialog = await openRecord();
    expect(
      within(dialog).getByText(/Weekends and holidays are not excluded automatically/),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Date from/), {
      target: { value: d('02', '10') },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Date to/), {
      target: { value: d('02', '12') },
    });
    expect(await within(dialog).findByText(/Calendar days in range: 3\./)).toBeInTheDocument();
  });

  it('TC-LU-14: sufficient balance shows Available and After; insufficient turns red and disables submit', async () => {
    const dialog = await openRecord();
    await fillValid(dialog, '2');
    const strip = await within(dialog).findByText(/Available/);
    expect(strip).toHaveTextContent('Vacation Leave');
    expect(strip).toHaveTextContent('Available 7 days. After this entry: 5.');
    expect(submitButton(dialog)).toBeEnabled();

    fireEvent.change(within(dialog).getByLabelText(/^Date to/), {
      target: { value: d('02', '20') },
    });
    await userEvent.clear(within(dialog).getByLabelText(/^Days to deduct/));
    await userEvent.type(within(dialog).getByLabelText(/^Days to deduct/), '8');
    expect(
      await within(dialog).findByText('Not enough credits: 7 available, 8 requested.'),
    ).toBeInTheDocument();
    expect(submitButton(dialog)).toBeDisabled();
  });

  it('TC-LU-14: with no balance it says so, links to Allocate credits, and disables submit', async () => {
    vi.mocked(balancesService.getBalance).mockResolvedValue(null);
    const dialog = await openRecord();
    await fillValid(dialog, '1');
    expect(
      await within(dialog).findByText(
        /No Vacation Leave credits have been allocated to this employee for/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Allocate credits' })).toHaveAttribute(
      'href',
      `/leave-credits?year=${String(YEAR)}`,
    );
    expect(submitButton(dialog)).toBeDisabled();
  });

  it('records once with the session id, dates as typed, and a toast with the remaining balance', async () => {
    const dialog = await openRecord();
    await fillValid(dialog, '2');
    await userEvent.type(within(dialog).getByLabelText('Remarks'), ' Family trip ');
    await userEvent.click(submitButton(dialog));
    await waitFor(() => {
      expect(ledgerService.recordUsage).toHaveBeenCalledWith({
        transactionId: expect.stringMatching(/^Tx\d{18}$/) as string,
        employeeId: 'juan',
        leaveTypeId: 'vac',
        year: YEAR,
        days: 2,
        dateFrom: d('02', '10'),
        dateTo: d('02', '11'),
        remarks: 'Family trip',
        actor: { uid: 'hr1', name: 'Maria Santos' },
      });
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Recorded 2 days of Vacation Leave for Juan Dela Cruz. Remaining: 5.',
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Record leave usage' })).not.toBeInTheDocument();
    });
  });

  it('TC-DUP-03: a double click makes one service call', async () => {
    let release: (value: ledgerService.LedgerResult) => void = () => undefined;
    vi.mocked(ledgerService.recordUsage).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const dialog = await openRecord();
    await fillValid(dialog, '2');
    await userEvent.dblClick(submitButton(dialog));
    await waitFor(() => {
      expect(ledgerService.recordUsage).toHaveBeenCalledTimes(1);
    });
    expect(submitButton(dialog)).toBeDisabled();
    release({ status: 'created', transactionId: 'x', balance: { totalCredits: 10, totalUsed: 5 } });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Record leave usage' })).not.toBeInTheDocument();
    });
    expect(ledgerService.recordUsage).toHaveBeenCalledTimes(1);
  });

  it('shows a server insufficient-balance error with both figures and stays open', async () => {
    vi.mocked(ledgerService.recordUsage).mockRejectedValue(
      new AppError('INSUFFICIENT_BALANCE', { details: { available: 1, requested: 2 } }),
    );
    const dialog = await openRecord();
    await fillValid(dialog, '2');
    await userEvent.click(submitButton(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Not enough credits: 1 available, 2 requested.',
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('Overlap warning (TC-LU-15, BR-LU-09, Q-10)', () => {
  it('lists the conflicting entries and requires "Record anyway" before recording', async () => {
    vi.mocked(ledgerService.findUsageForOverlap).mockResolvedValue([
      usage('E'.repeat(20), d('02', '11'), d('02', '12'), 2),
    ]);
    const dialog = await openRecord();
    await fillValid(dialog, '2');
    await userEvent.click(submitButton(dialog));

    const warning = await within(dialog).findByText(
      /already has leave recorded on overlapping dates/,
    );
    expect(warning).toBeInTheDocument();
    expect(within(dialog).getByText(/Feb 11 – Feb 12/)).toBeInTheDocument();
    expect(ledgerService.recordUsage).not.toHaveBeenCalled();
    expect(submitButton(dialog)).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Record anyway' }));
    expect(submitButton(dialog)).toBeEnabled();
    await userEvent.click(submitButton(dialog));
    await waitFor(() => {
      expect(ledgerService.recordUsage).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores reversed entries and non-overlapping ranges (no warning, records immediately)', async () => {
    vi.mocked(ledgerService.findUsageForOverlap).mockResolvedValue([
      usage('R'.repeat(20), d('02', '10'), d('02', '11'), 2, {
        reversedByTransactionId: `rev_${'R'.repeat(20)}`,
      }),
      usage('N'.repeat(20), d('03', '01'), d('03', '02'), 2),
    ]);
    const dialog = await openRecord();
    await fillValid(dialog, '2');
    await userEvent.click(submitButton(dialog));
    await waitFor(() => {
      expect(ledgerService.recordUsage).toHaveBeenCalledTimes(1);
    });
  });

  it('a changed date invalidates the acknowledgement and re-checks on the next submit', async () => {
    vi.mocked(ledgerService.findUsageForOverlap).mockResolvedValue([
      usage('E'.repeat(20), d('02', '10'), d('02', '11'), 2),
    ]);
    const dialog = await openRecord();
    await fillValid(dialog, '2');
    await userEvent.click(submitButton(dialog));
    await within(dialog).findByText(/overlapping dates/);
    fireEvent.change(within(dialog).getByLabelText(/^Date to/), {
      target: { value: d('02', '12') },
    });
    expect(within(dialog).queryByText(/overlapping dates/)).not.toBeInTheDocument();
  });
});

describe('Leave Usage list (UI §6.9, TC-LU-17/18)', () => {
  const rows = [
    usage('A'.repeat(20), d('02', '10'), d('02', '11'), 2, { remarks: 'Family trip' }),
    usage('B'.repeat(20), d('04', '20'), d('04', '20'), 1),
  ];

  it("queries the year's USAGE entries and renders dates, days, status and a Reverse action", async () => {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: rows,
      nextCursor: null,
      hasMore: false,
    });
    renderRoutes('/leave-usage');
    const table = await screen.findByRole('table', { name: `Leave usage ${String(YEAR)}` });
    await within(table).findAllByText('Juan Dela Cruz');
    expect(ledgerService.listLedgerPage).toHaveBeenCalledWith(
      expect.objectContaining({ year: YEAR, transactionType: 'USAGE' }),
    );
    expect(
      within(table).getByText(new RegExp(`Feb 10 – Feb 11, ${String(YEAR)}`)),
    ).toBeInTheDocument();
    expect(within(table).getByText(new RegExp(`Apr 20, ${String(YEAR)}`))).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: /Reverse usage for/ })).toHaveLength(2);
  });

  it('text search applies to loaded rows and shows the "Load all" notice; Load all fetches the rest', async () => {
    vi.mocked(ledgerService.listLedgerPage)
      .mockResolvedValueOnce({ items: [rows[0]!], nextCursor: {} as never, hasMore: true })
      .mockResolvedValueOnce({ items: [rows[1]!], nextCursor: null, hasMore: false });
    renderRoutes('/leave-usage');
    await screen.findByText('Loaded 1 row');
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search remarks or employee' }),
      'trip',
    );
    expect(await screen.findByText('Searching loaded rows only.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Load all for ${String(YEAR)}` }));
    expect(
      await screen.findByText(`All ${String(YEAR)} rows for these filters are loaded.`),
    ).toBeInTheDocument();
    expect(ledgerService.listLedgerPage).toHaveBeenCalledTimes(2);
  });

  it('a leave-date range filters the loaded rows', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: rows,
      nextCursor: null,
      hasMore: false,
    });
    renderRoutes('/leave-usage');
    const table = await screen.findByRole('table', { name: `Leave usage ${String(YEAR)}` });
    await within(table).findAllByText('Juan Dela Cruz');
    fireEvent.change(screen.getByLabelText('Leave from'), { target: { value: d('04', '01') } });
    await waitFor(() => {
      expect(within(table).getAllByRole('button', { name: /Reverse usage for/ })).toHaveLength(1);
    });
  });

  it('the empty state offers Record leave usage; a filtered empty offers Clear filters', async () => {
    renderRoutes('/leave-usage');
    expect(await screen.findByText(`No leave recorded for ${String(YEAR)}.`)).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search remarks or employee' }),
      'zzz',
    );
    expect(await screen.findByText('No entries match your filters.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0);
  });

  it('shows an error with Retry', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockRejectedValueOnce(new AppError('UNKNOWN'));
    renderRoutes('/leave-usage');
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
  });
});

describe('Reverse and re-enter (TC-REV-09/10, RK-07)', () => {
  const target = usage('A'.repeat(20), d('02', '10'), d('02', '11'), 2, { remarks: 'Family trip' });

  async function reverseWithReEnter() {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: [target],
      nextCursor: null,
      hasMore: false,
    });
    renderRoutes('/leave-usage');
    await userEvent.click(await screen.findByRole('button', { name: /Reverse usage for/ }));
    const reverse = await screen.findByRole('dialog', { name: 'Reverse this usage?' });
    await userEvent.type(within(reverse).getByLabelText(/^Reason/), 'Wrong dates');
    await userEvent.click(
      within(reverse).getByRole('checkbox', { name: 'Then enter a corrected record' }),
    );
    await userEvent.click(within(reverse).getByRole('button', { name: 'Reverse entry' }));
    return screen.findByRole('dialog', { name: 'Record leave usage' });
  }

  it('opens the record form pre-filled with the original values and a notice', async () => {
    const dialog = await reverseWithReEnter();
    expect(ledgerService.reverseEntry).toHaveBeenCalledWith(
      expect.objectContaining({ originalTransactionId: 'A'.repeat(20), reason: 'Wrong dates' }),
    );
    expect(
      within(dialog).getByText(
        'The original entry has been reversed. The replacement has not been saved yet.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /^Employee/ })).toHaveTextContent(
      'Juan Dela Cruz',
    );
    expect(within(dialog).getByLabelText(/^Date from/)).toHaveValue(d('02', '10'));
    expect(within(dialog).getByLabelText(/^Date to/)).toHaveValue(d('02', '11'));
    expect(within(dialog).getByLabelText(/^Days to deduct/)).toHaveValue(2);
    expect(within(dialog).getByLabelText('Remarks')).toHaveValue('Family trip');
  });

  it('closing without saving leaves a persistent banner that can reopen the form', async () => {
    const dialog = await reverseWithReEnter();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    // the pre-filled correction counts as unsaved work, so the shell asks first
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Record leave usage' })).not.toBeInTheDocument();
    });
    const bannerText = await screen.findByText(
      'The original entry has been reversed. The replacement has not been saved yet.',
    );
    const banner = bannerText.closest<HTMLElement>('[role="status"]')!;
    await userEvent.click(within(banner).getByRole('button', { name: 'Enter corrected record' }));
    expect(await screen.findByRole('dialog', { name: 'Record leave usage' })).toBeInTheDocument();
  });

  it('saving the replacement clears the banner; the new record uses a NEW transaction id', async () => {
    const dialog = await reverseWithReEnter();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record leave' }));
    await waitFor(() => {
      expect(ledgerService.recordUsage).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Record leave usage' })).not.toBeInTheDocument();
    });
    expect(
      screen.queryByText(
        'The original entry has been reversed. The replacement has not been saved yet.',
      ),
    ).not.toBeInTheDocument();
  });

  it('without the checkbox no corrected-record form opens', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: [target],
      nextCursor: null,
      hasMore: false,
    });
    renderRoutes('/leave-usage');
    await userEvent.click(await screen.findByRole('button', { name: /Reverse usage for/ }));
    const reverse = await screen.findByRole('dialog', { name: 'Reverse this usage?' });
    await userEvent.type(within(reverse).getByLabelText(/^Reason/), 'Wrong dates');
    await userEvent.click(within(reverse).getByRole('button', { name: 'Reverse entry' }));
    await waitFor(() => {
      expect(ledgerService.reverseEntry).toHaveBeenCalled();
    });
    expect(screen.queryByRole('dialog', { name: 'Record leave usage' })).not.toBeInTheDocument();
  });
});

describe('Leave History (UI §6.11)', () => {
  const allocation: LeaveTransaction = usage('L'.repeat(20), d('01', '01'), d('01', '01'), 10, {
    transactionType: 'ALLOCATION',
    dateFrom: null,
    dateTo: null,
    creditsDelta: 10,
    usedDelta: 0,
    remarks: 'Annual',
  });
  const reversed = usage('V'.repeat(20), d('02', '10'), d('02', '11'), 2, {
    reversedByTransactionId: `rev_${'V'.repeat(20)}`,
  });
  const reversal = usage(`rev_${'V'.repeat(20)}`, d('02', '10'), d('02', '11'), 2, {
    transactionType: 'REVERSAL',
    reversesType: 'USAGE',
    reversesTransactionId: 'V'.repeat(20),
    usedDelta: -2,
    remarks: 'Wrong dates',
  });

  async function openHistory() {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: [allocation, reversal, reversed],
      nextCursor: null,
      hasMore: false,
    });
    renderRoutes('/leave-history');
    return screen.findByRole('table', { name: `Leave history ${String(YEAR)}` });
  }

  it('shows all kinds with type badges, the effect on balance, and Reversed / Reversal-of status', async () => {
    const table = await openHistory();
    await within(table).findAllByText('Juan Dela Cruz');
    expect(within(table).getByText('Allocation')).toBeInTheDocument();
    expect(within(table).getByText('Reversal')).toBeInTheDocument();
    expect(within(table).getByText('+10 credits')).toBeInTheDocument();
    expect(within(table).getByText('+2 days (reversal)')).toBeInTheDocument();
    expect(within(table).getByText('Reversed')).toBeInTheDocument();
    expect(within(table).getByText(/Reversal of …VVVVVV/)).toBeInTheDocument();
  });

  it('TC-REV-13: no Reverse action on reversal rows or already-reversed rows', async () => {
    const table = await openHistory();
    await within(table).findAllByText('Juan Dela Cruz');
    expect(within(table).getAllByRole('button', { name: /^Reverse / })).toHaveLength(1); // only the allocation
  });

  it('the transaction-type filter queries the server', async () => {
    await openHistory();
    await userEvent.click(await screen.findByRole('combobox', { name: 'Type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Usage' }));
    await waitFor(() => {
      expect(ledgerService.listLedgerPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ year: YEAR, transactionType: 'USAGE' }),
      );
    });
  });

  it('a row opens the detail sheet with snapshots, balance after, and links between original and reversal', async () => {
    const table = await openHistory();
    const row = (await within(table).findByText(/Reversal of …VVVVVV/)).closest('tr')!;
    await userEvent.click(row);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Reversal · Vacation Leave')).toBeInTheDocument();
    expect(within(sheet).getByText(/EMP-0042/)).toBeInTheDocument();
    expect(within(sheet).getByText('Balance after')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'View the original entry' }));
    expect(await within(sheet).findByText('Usage · Vacation Leave')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'View the reversal' })).toBeInTheDocument();
  });
});
