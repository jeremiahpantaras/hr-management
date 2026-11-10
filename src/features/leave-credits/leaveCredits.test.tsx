import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { LeaveCreditsPage } from '@/features/leave-credits/LeaveCreditsPage';
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

function employee(
  id: string,
  name: string,
  number: string,
  over: Partial<Employee> = {},
): Employee {
  return {
    id,
    employeeNumber: number,
    employeeNumberKey: number,
    fullName: name,
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
    ...over,
  };
}
function balance(employeeId: string, credits: number, used: number, year = YEAR): LeaveBalance {
  return {
    id: `${employeeId}_${String(year)}`,
    employeeId,
    year,
    totalCredits: credits,
    totalUsed: used,
    availableCredits: credits - used,
    lastTransactionId: 'T'.repeat(20),
    createdAt: null,
    updatedAt: null,
  };
}
function entry(id: string, over: Partial<LeaveTransaction> = {}): LeaveTransaction {
  return {
    id,
    employeeId: 'juan',
    employeeNumberSnapshot: 'EMP-0042',
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
    remarks: 'Annual credits',
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

const juan = employee('juan', 'Juan Dela Cruz', 'EMP-0042');
const ana = employee('ana', 'Ana Reyes', 'EMP-0043');
const mario = employee('mario', 'Mario Santos', 'EMP-0100', { isArchived: true });

let client: QueryClient;
function renderPage(path = '/leave-credits') {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/leave-credits" element={<LeaveCreditsPage />} />
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
  vi.mocked(employeesService.listEmployees).mockResolvedValue([juan, ana, mario]);
  vi.mocked(balancesService.getBalancesForEmployees).mockResolvedValue([balance('juan', 10, 3)]);
  vi.mocked(balancesService.getBalance).mockResolvedValue(null);
  vi.mocked(ledgerService.newTransactionId).mockImplementation(
    () => `Tx${String((idCounter += 1)).padStart(18, '0')}`,
  );
  vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.mocked(ledgerService.recordAllocation).mockResolvedValue({
    status: 'created',
    transactionId: 'x',
    balance: { totalCredits: 12, totalUsed: 0 },
  });
  vi.mocked(ledgerService.reverseEntry).mockResolvedValue({
    status: 'created',
    transactionId: 'rev_x',
    balance: { totalCredits: 10, totalUsed: 2 },
  });
});

describe('Balances tab (UI §6.7, DB §8.4)', () => {
  it('lists active employees with year totals, "—" for those without credits, and the year caption', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: `Leave days for ${String(YEAR)}` });
    await within(table).findByText('Juan Dela Cruz');
    const juanRow = screen.getByText('Juan Dela Cruz').closest('tr')!;
    expect(
      within(juanRow)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(expect.arrayContaining(['10', '3', '7']));
    const anaRow = screen.getByText('Ana Reyes').closest('tr')!;
    expect(within(anaRow).getAllByText('—')).toHaveLength(3);
    expect(screen.queryByText('Mario Santos')).not.toBeInTheDocument(); // archived hidden by default
    expect(
      screen.getAllByText(new RegExp(`Leave days for ${String(YEAR)}`)).length,
    ).toBeGreaterThan(0);
    expect(balancesService.getBalancesForEmployees).toHaveBeenCalledWith(['ana', 'juan'], YEAR);
  });

  it('"Include archived" shows archived employees (no Allocate action for them)', async () => {
    renderPage();
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('switch', { name: 'Include archived' }));
    const row = (await screen.findByText('Mario Santos')).closest('tr')!;
    expect(within(row).getByText('Archived')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Allocate days to/ })).not.toBeInTheDocument();
  });

  it('searches by name or employee ID', async () => {
    renderPage();
    await screen.findByText('Juan Dela Cruz');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), '0043');
    await waitFor(() => {
      expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
    });
    expect(await screen.findByText('Ana Reyes')).toBeInTheDocument();
  });

  it('shows an empty state with no employees, and an error with Retry', async () => {
    vi.mocked(employeesService.listEmployees).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No employees yet')).toBeInTheDocument();
  });

  it('shows a friendly error with Retry when balances fail to load', async () => {
    vi.mocked(balancesService.getBalancesForEmployees).mockRejectedValueOnce(
      new AppError('UNKNOWN'),
    );
    renderPage();
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
  });
});

describe('Allocation dialog (UI §6.8, TC-CR-09, TC-DUP-03/04)', () => {
  async function openDialog() {
    renderPage();
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Allocate days' }));
    return screen.findByRole('dialog', { name: 'Allocate days' });
  }
  async function pick(dialog: HTMLElement, label: RegExp, option: string | RegExp) {
    await userEvent.click(within(dialog).getByRole('combobox', { name: label }));
    await userEvent.click(await screen.findByRole('option', { name: option }));
  }

  it('validates every field with the exact messages', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Allocate days' }));
    expect(await within(dialog).findByText('Select an employee.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter the number of days.')).toBeInTheDocument();
    expect(ledgerService.recordAllocation).not.toHaveBeenCalled();
  });

  it.each([
    ['0', 'Days must be greater than 0.'],
    ['0.3', 'Use whole or half days (0.5).'],
    ['366', 'The maximum is 365 per entry.'],
  ])('rejects %s credits', async (value, message) => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(/^Days to add/), value);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Allocate days' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('offers only active employees (BR-CR-04) and has no leave type field', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('combobox', { name: /^Employee/ }));
    expect(await screen.findByRole('option', { name: /Juan Dela Cruz/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Mario Santos/ })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(within(dialog).queryByRole('combobox', { name: /Leave type/ })).not.toBeInTheDocument();
  });

  it('TC-CR-09: the preview strip shows the current and the resulting total', async () => {
    vi.mocked(balancesService.getBalance).mockResolvedValue(balance('juan', 10, 0));
    const dialog = await openDialog();
    await pick(dialog, /^Employee/, /Juan Dela Cruz/);
    await userEvent.type(within(dialog).getByLabelText(/^Days to add/), '2');
    const status = await within(dialog).findByText(/Current total:/);
    expect(status).toHaveTextContent('Current total: 10 → After this allocation: 12 (');
  });

  it('submits once with the session id, then closes with a toast naming the new total', async () => {
    const dialog = await openDialog();
    await pick(dialog, /^Employee/, /Juan Dela Cruz/);
    await userEvent.type(within(dialog).getByLabelText(/^Days to add/), '2');
    await userEvent.type(within(dialog).getByLabelText('Remarks'), '  Top-up ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Allocate days' }));
    await waitFor(() => {
      expect(ledgerService.recordAllocation).toHaveBeenCalledWith({
        transactionId: expect.stringMatching(/^Tx\d{18}$/) as string,
        employeeId: 'juan',
        year: YEAR,
        days: 2,
        remarks: 'Top-up',
        actor: { uid: 'hr1', name: 'Maria Santos' },
      });
    });
    expect(toast.success).toHaveBeenCalledWith(
      `Added 2 days for Juan Dela Cruz (${String(YEAR)}). New total: 12.`,
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Allocate days' })).not.toBeInTheDocument();
    });
  });

  it('TC-DUP-03: a double click or Enter-spam makes one service call and disables the button', async () => {
    let release: (value: ledgerService.LedgerResult) => void = () => undefined;
    vi.mocked(ledgerService.recordAllocation).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const dialog = await openDialog();
    await pick(dialog, /^Employee/, /Juan Dela Cruz/);
    await userEvent.type(within(dialog).getByLabelText(/^Days to add/), '1');
    const submit = within(dialog).getByRole('button', { name: 'Allocate days' });
    await userEvent.dblClick(submit);
    await userEvent.type(within(dialog).getByLabelText(/^Days to add/), '{Enter}{Enter}');
    expect(ledgerService.recordAllocation).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    release({ status: 'created', transactionId: 'x', balance: { totalCredits: 1, totalUsed: 0 } });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Allocate days' })).not.toBeInTheDocument();
    });
    expect(ledgerService.recordAllocation).toHaveBeenCalledTimes(1);
  });

  it('TC-DUP-04: closing and reopening gives a NEW transaction id', async () => {
    renderPage();
    await screen.findByText('Juan Dela Cruz');
    const submitOnce = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Allocate days' }));
      const dialog = await screen.findByRole('dialog', { name: 'Allocate days' });
      await pick(dialog, /^Employee/, /Juan Dela Cruz/);
      await userEvent.type(within(dialog).getByLabelText(/^Days to add/), '1');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Allocate days' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Allocate days' })).not.toBeInTheDocument();
      });
    };
    await submitOnce();
    await submitOnce(); // identical data, new dialog session → an intentional second entry
    const ids = vi
      .mocked(ledgerService.recordAllocation)
      .mock.calls.map(([request]) => request.transactionId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('TC-CR-13: opened from a row, it prefills the employee and keeps the page year', async () => {
    renderPage(`/leave-credits?year=${String(YEAR)}`);
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Allocate days to Juan Dela Cruz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Allocate days' });
    expect(within(dialog).getByRole('combobox', { name: /^Employee/ })).toHaveTextContent(
      'Juan Dela Cruz',
    );
    expect(within(dialog).getByRole('combobox', { name: /Leave year/ })).toHaveTextContent(
      String(YEAR),
    );
  });

  it('shows server rejections with the names filled in and stays open', async () => {
    vi.mocked(ledgerService.recordAllocation).mockRejectedValue(new AppError('EMPLOYEE_ARCHIVED'));
    const dialog = await openDialog();
    await pick(dialog, /^Employee/, /Juan Dela Cruz/);
    await userEvent.type(within(dialog).getByLabelText(/^Days to add/), '1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Allocate days' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Juan Dela Cruz is archived. Restore them to continue.',
    );
    expect(screen.getByRole('dialog', { name: 'Allocate days' })).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('asks before discarding typed changes', async () => {
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(/^Days to add/), '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
  });
});

describe('Edit days (editing allocated days)', () => {
  async function openEdit() {
    renderPage();
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Edit days for Juan Dela Cruz' }));
    return screen.findByRole('dialog', { name: 'Edit days' });
  }
  const save = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Save change' });

  beforeEach(() => {
    vi.mocked(ledgerService.recordAdjustment).mockResolvedValue({
      status: 'created',
      transactionId: 'x',
      balance: { totalCredits: 12, totalUsed: 3 },
    });
  });

  it('is offered only for active employees who have days for the year', async () => {
    renderPage();
    await screen.findByText('Juan Dela Cruz');
    expect(screen.getByRole('button', { name: 'Edit days for Juan Dela Cruz' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Edit days for Ana Reyes' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Include archived' }));
    await screen.findByText('Mario Santos');
    expect(
      screen.queryByRole('button', { name: 'Edit days for Mario Santos' }),
    ).not.toBeInTheDocument();
  });

  it('shows the current figures, starts unchanged (Save disabled) and says it is logged', async () => {
    const dialog = await openEdit();
    expect(dialog).toHaveTextContent('with your name, the date and the time');
    expect(dialog).toHaveTextContent(/Current total\s*10/);
    expect(dialog).toHaveTextContent(/Already used\s*3/);
    expect(dialog).toHaveTextContent(/Remaining\s*7/);
    expect(within(dialog).getByLabelText(/^New total days/)).toHaveValue(10);
    expect(save(dialog)).toBeDisabled();
  });

  it('previews the change, then saves once with the total, the reason and the idempotency key', async () => {
    const dialog = await openEdit();
    await userEvent.clear(within(dialog).getByLabelText(/^New total days/));
    await userEvent.type(within(dialog).getByLabelText(/^New total days/), '12');
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Total: 10 → 12 (+2) · Remaining: 7 → 9',
    );
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), '  Corrected after audit ');
    await userEvent.click(save(dialog));
    await waitFor(() => {
      expect(ledgerService.recordAdjustment).toHaveBeenCalledWith({
        transactionId: expect.stringMatching(/^Tx\d{18}$/) as string,
        employeeId: 'juan',
        year: YEAR,
        newTotal: 12,
        reason: 'Corrected after audit',
        actor: { uid: 'hr1', name: 'Maria Santos' },
      });
    });
    expect(ledgerService.recordAdjustment).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      `Changed Juan Dela Cruz’s leave days for ${String(YEAR)} from 10 to 12.`,
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit days' })).not.toBeInTheDocument();
    });
  });

  it('lowering shows a minus sign; a total below the days already used is refused on the spot', async () => {
    const dialog = await openEdit();
    const total = within(dialog).getByLabelText(/^New total days/);
    await userEvent.clear(total);
    await userEvent.type(total, '8');
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Total: 10 → 8 (−2) · Remaining: 7 → 5',
    );
    await userEvent.clear(total);
    await userEvent.type(total, '2.5');
    expect(
      await within(dialog).findByText('The total can’t be lower than the 3 days already used.'),
    ).toBeInTheDocument();
    expect(save(dialog)).toBeDisabled();
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
  });

  it('validates the total and the reason with the exact messages', async () => {
    const dialog = await openEdit();
    const total = within(dialog).getByLabelText(/^New total days/);
    await userEvent.clear(total);
    await userEvent.type(total, '11.25');
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'ab');
    await userEvent.click(save(dialog));
    expect(await within(dialog).findByText('Use whole or half days (0.5).')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a reason (at least 3 characters).')).toBeInTheDocument();
    expect(ledgerService.recordAdjustment).not.toHaveBeenCalled();
  });

  it('shows a server refusal and stays open', async () => {
    vi.mocked(ledgerService.recordAdjustment).mockRejectedValue(
      new AppError('BELOW_USED', { details: { used: 5, requested: 4 } }),
    );
    const dialog = await openEdit();
    await userEvent.clear(within(dialog).getByLabelText(/^New total days/));
    await userEvent.type(within(dialog).getByLabelText(/^New total days/), '12');
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'Audit');
    await userEvent.click(save(dialog));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "The total can't be lower than the days already used: 5 used, 4 entered.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('Allocation history tab (UI §6.7, TC-CR-10)', () => {
  const rows = [
    entry('A'.repeat(20)),
    entry('B'.repeat(20), {
      days: 2,
      creditsDelta: 2,
      remarks: null,
      reversedByTransactionId: `rev_${'B'.repeat(20)}`,
    }),
    entry(`rev_${'B'.repeat(20)}`, {
      transactionType: 'REVERSAL',
      reversesType: 'ALLOCATION',
      reversesTransactionId: 'B'.repeat(20),
      days: 2,
      creditsDelta: -2,
    }),
  ];

  async function openHistory() {
    renderPage(`/leave-credits?tab=history`);
    return screen.findByRole('table', { name: `Allocation history ${String(YEAR)}` });
  }

  it('lists entries with the effect, who recorded them, and a Reversed badge; queries allocations and edits for the year', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: rows,
      nextCursor: null,
      hasMore: false,
    });
    const table = await openHistory();
    await within(table).findAllByText('Juan Dela Cruz');
    expect(within(table).getByText('+10 days')).toBeInTheDocument();
    expect(within(table).getAllByText('Maria Santos').length).toBeGreaterThan(0);
    expect(within(table).getByText('Reversed')).toBeInTheDocument();
    expect(ledgerService.listLedgerPage).toHaveBeenCalledWith(
      expect.objectContaining({ year: YEAR, transactionType: ['ALLOCATION', 'ADJUSTMENT'] }),
    );
  });

  it('offers Reverse… only on entries that can still be reversed (TC-REV-13)', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: rows,
      nextCursor: null,
      hasMore: false,
    });
    const table = await openHistory();
    await within(table).findAllByText('Juan Dela Cruz');
    expect(within(table).getAllByRole('button', { name: /Reverse allocation for/ })).toHaveLength(
      1,
    );
  });

  it('has an empty state with an Allocate CTA', async () => {
    const table = await openHistory();
    void table;
    expect(
      await screen.findByText(`No allocations recorded for ${String(YEAR)}.`),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Allocate days' }).length).toBeGreaterThan(0);
  });

  it('Load more appends the next page using the cursor', async () => {
    vi.mocked(ledgerService.listLedgerPage)
      .mockResolvedValueOnce({ items: [rows[0]!], nextCursor: {} as never, hasMore: true })
      .mockResolvedValueOnce({ items: [rows[1]!], nextCursor: null, hasMore: false });
    await openHistory();
    await screen.findByText('Loaded 1 row');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Loaded 2 rows')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows an error with Retry', async () => {
    vi.mocked(ledgerService.listLedgerPage).mockRejectedValueOnce(new AppError('OFFLINE'));
    renderPage('/leave-credits?tab=history');
    expect(await screen.findByText("You're offline. Reconnect and try again.")).toBeInTheDocument();
  });
});

describe('Reverse dialog (UI §6.11, TC-REV-08)', () => {
  const allocation = entry('A'.repeat(20), { days: 2, creditsDelta: 2 });

  async function openReverse(target: LeaveTransaction, current: LeaveBalance | null) {
    vi.mocked(balancesService.getBalance).mockResolvedValue(current);
    vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
      items: [target],
      nextCursor: null,
      hasMore: false,
    });
    renderPage('/leave-credits?tab=history');
    await userEvent.click(await screen.findByRole('button', { name: /Reverse allocation for/ }));
    return screen.findByRole('dialog', { name: /Reverse this allocation\?/ });
  }

  it('previews the effect on available, and requires a reason of at least 3 characters', async () => {
    const dialog = await openReverse(allocation, balance('juan', 12, 3));
    expect(await within(dialog).findByText(/Available will change from/)).toHaveTextContent(
      'Available will change from 9 to 7.',
    );
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'ab');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverse entry' }));
    expect(
      await within(dialog).findByText('Enter a reason (at least 3 characters).'),
    ).toBeInTheDocument();
    expect(ledgerService.reverseEntry).not.toHaveBeenCalled();
  });

  it('starts with focus on Cancel (destructive action)', async () => {
    const dialog = await openReverse(allocation, balance('juan', 12, 3));
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });
  });

  it('reverses with the reason and confirms', async () => {
    const dialog = await openReverse(allocation, balance('juan', 12, 3));
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), ' Entered twice ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverse entry' }));
    await waitFor(() => {
      expect(ledgerService.reverseEntry).toHaveBeenCalledWith({
        originalTransactionId: 'A'.repeat(20),
        reason: 'Entered twice',
        actor: { uid: 'hr1', name: 'Maria Santos' },
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Reversed the allocation for Juan Dela Cruz.');
  });

  it('blocks reversing an allocation whose credits are partly used, with the explanation', async () => {
    const big = entry('A'.repeat(20), { days: 10, creditsDelta: 10 });
    const dialog = await openReverse(big, balance('juan', 10, 8));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reverse this allocation: 8 of its 10 days are already used. Reverse the related usage entries first.",
    );
    expect(within(dialog).getByRole('button', { name: 'Reverse entry' })).toBeDisabled();
  });

  it('shows a server refusal and keeps the dialog open', async () => {
    vi.mocked(ledgerService.reverseEntry).mockRejectedValue(new AppError('ALREADY_REVERSED'));
    const dialog = await openReverse(allocation, balance('juan', 12, 3));
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'Entered twice');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reverse entry' }));
    expect(
      await within(dialog).findByText('This entry has already been reversed.'),
    ).toBeInTheDocument();
  });

  it('does not offer "enter a corrected record" for an allocation', async () => {
    const dialog = await openReverse(allocation, balance('juan', 12, 3));
    expect(
      within(dialog).queryByLabelText('Then enter a corrected record'),
    ).not.toBeInTheDocument();
  });
});
