import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { EmployeeDetailPage } from '@/features/employees/EmployeeDetailPage';
import { EmployeesPage } from '@/features/employees/EmployeesPage';
import * as service from '@/services/employees.service';
import * as balancesService from '@/services/leaveBalances.service';
import * as ledgerService from '@/services/leaveLedger.service';
import type { Employee } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('@/services/leaveBalances.service');
vi.mock('@/services/leaveLedger.service');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const NOW = new Date('2026-02-10T08:00:00Z');

function makeEmployee(n: number, overrides: Partial<Employee> = {}): Employee {
  const number = `EMP-${String(n).padStart(4, '0')}`;
  return {
    id: `id${String(n)}`,
    employeeNumber: number,
    employeeNumberKey: number,
    fullName: `Person ${String(n).padStart(2, '0')}`,
    position: 'Staff',
    department: n % 2 === 0 ? 'Finance' : null,
    employmentStatus: 'Regular',
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdAt: NOW,
    createdBy: 'hr1',
    updatedAt: NOW,
    updatedBy: 'hr1',
    ...overrides,
  };
}

const juan = makeEmployee(42, {
  id: 'juan',
  fullName: 'Juan Dela Cruz',
  position: 'Accounting Staff',
  department: 'Finance',
});
const ana = makeEmployee(43, {
  id: 'ana',
  fullName: 'Ana Reyes',
  employmentStatus: 'Probationary',
});
const mario = makeEmployee(100, {
  id: 'mario',
  fullName: 'Mario Santos',
  isArchived: true,
  employmentStatus: 'Contractual',
  archivedAt: NOW,
  archivedBy: 'hr1',
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

let queryClient: QueryClient;

function renderAt(path: string) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/employees/:employeeId" element={<EmployeeDetailPage />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const where = () => screen.getByTestId('where').textContent;
const table = () => screen.getByRole('table', { name: 'Employees' });
const rowNames = () =>
  within(table())
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(service.listEmployees).mockResolvedValue([juan, ana, mario]);
  vi.mocked(service.getEmployee).mockImplementation((id) =>
    Promise.resolve([juan, ana, mario].find((e) => e.id === id) ?? null),
  );
  vi.mocked(service.createEmployee).mockResolvedValue('newId');
  vi.mocked(service.updateEmployee).mockResolvedValue(undefined);
  vi.mocked(service.archiveEmployee).mockResolvedValue(undefined);
  vi.mocked(service.restoreEmployee).mockResolvedValue(undefined);
  vi.mocked(balancesService.getBalancesForEmployeeYear).mockResolvedValue([]);
  vi.mocked(ledgerService.listLedgerPage).mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.mocked(ledgerService.newTransactionId).mockReturnValue('Tx000000000000000001');
});

describe('directory: list, states, filters (TC-EMP-08/09/10/16)', () => {
  it('shows a loading state, then the Active employees A–Z with all planned columns', async () => {
    renderAt('/employees');
    expect(screen.getByRole('region', { name: 'Employees' })).toHaveAttribute('aria-busy', 'true');
    await screen.findByText('Juan Dela Cruz');

    expect(rowNames()).toEqual(['Ana Reyes', 'Juan Dela Cruz']); // Mario is archived → hidden by default
    for (const header of [
      'Employee ID',
      'Complete name',
      'Position',
      'Location',
      'Employment status',
    ]) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.getByText('EMP-0042')).toBeInTheDocument();
    expect(screen.getByText('2 employees')).toBeInTheDocument();
  });

  it('shows "—" for a missing department and the status as a badge', async () => {
    renderAt('/employees');
    const row = (await screen.findByText('Ana Reyes')).closest('tr') as HTMLElement;
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).getByText('Probationary')).toBeInTheDocument();
  });

  it('TC-EMP-16 empty state: no employees yet, with an Add action', async () => {
    vi.mocked(service.listEmployees).mockResolvedValue([]);
    renderAt('/employees');
    expect(await screen.findByText('No employees yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add your first employee to start tracking leave.'),
    ).toBeInTheDocument();
    await userEvent.click(within(table()).getByRole('button', { name: 'Add employee' }));
    expect(await screen.findByRole('dialog', { name: 'Add employee' })).toBeInTheDocument();
  });

  it('error state: a friendly message, an error code, and a Retry that reloads', async () => {
    vi.mocked(service.listEmployees)
      .mockRejectedValueOnce(new AppError('OFFLINE'))
      .mockResolvedValue([juan]);
    renderAt('/employees');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You're offline. Reconnect and try again.",
    );
    expect(screen.getByText('Error code: OFFLINE')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
  });

  it('error state never shows raw error text', async () => {
    vi.mocked(service.listEmployees).mockRejectedValue(
      new Error('Firebase: Missing or insufficient permissions (xyz)'),
    );
    renderAt('/employees');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(alert).not.toHaveTextContent('insufficient');
  });

  it('archive filter: Archived and All, driven from the URL', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');

    await userEvent.click(screen.getByRole('radio', { name: 'Archived' }));
    expect(await screen.findByText('Mario Santos')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Mario Santos']);
    expect(within(table()).getByText('Archived')).toBeInTheDocument(); // badge
    expect(where()).toBe('/employees?archived=archived');

    await userEvent.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => {
      expect(rowNames()).toEqual(['Ana Reyes', 'Juan Dela Cruz', 'Mario Santos']);
    });

    await userEvent.click(screen.getByRole('radio', { name: 'Active' }));
    await waitFor(() => {
      expect(rowNames()).toEqual(['Ana Reyes', 'Juan Dela Cruz']);
    });
    expect(where()).toBe('/employees'); // default is not written to the URL
  });

  it('restores state from the URL (shareable): archived + status + search', async () => {
    renderAt('/employees?archived=all&status=Contractual&q=mario');
    await screen.findByText('Mario Santos');
    expect(rowNames()).toEqual(['Mario Santos']);
    expect(screen.getByRole('searchbox', { name: 'Search employees' })).toHaveValue('mario');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  });

  it('status filter narrows the list', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Probationary' }));
    await waitFor(() => {
      expect(rowNames()).toEqual(['Ana Reyes']);
    });
    expect(where()).toContain('status=Probationary');
  });

  it('search matches name or Employee ID, debounced, case-insensitively, and updates the URL', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    const box = screen.getByRole('searchbox', { name: 'Search employees' });

    await userEvent.type(box, 'DELA');
    await waitFor(() => {
      expect(rowNames()).toEqual(['Juan Dela Cruz']);
    });
    expect(where()).toBe('/employees?q=DELA');

    await userEvent.clear(box);
    await userEvent.type(box, '0043');
    await waitFor(() => {
      expect(rowNames()).toEqual(['Ana Reyes']);
    });
  });

  it('a search with no results offers Clear filters, which resets everything', async () => {
    renderAt('/employees?q=zzzz&status=Regular');
    expect(await screen.findByText('No employees match your filters.')).toBeInTheDocument();
    await userEvent.click(within(table()).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(rowNames()).toEqual(['Ana Reyes', 'Juan Dela Cruz']);
    });
    expect(where()).toBe('/employees');
    expect(screen.getByRole('searchbox', { name: 'Search employees' })).toHaveValue('');
  });

  it('sorts by clicking a header (asc → desc → default) and keeps the choice in the URL', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    const idHeader = () => screen.getByRole('columnheader', { name: /Employee ID/ });

    await userEvent.click(within(idHeader()).getByRole('button'));
    expect(where()).toBe('/employees?sort=employeeNumber');
    expect(idHeader()).toHaveAttribute('aria-sort', 'ascending');
    expect(rowNames()).toEqual(['Juan Dela Cruz', 'Ana Reyes']); // EMP-0042 < EMP-0043

    await userEvent.click(within(idHeader()).getByRole('button'));
    expect(where()).toBe('/employees?sort=employeeNumber&dir=desc');
    expect(rowNames()).toEqual(['Ana Reyes', 'Juan Dela Cruz']);

    await userEvent.click(within(idHeader()).getByRole('button'));
    expect(where()).toBe('/employees'); // back to name A–Z
  });
});

describe('pagination with 87 employees (TC-EMP-10)', () => {
  beforeEach(() => {
    vi.mocked(service.listEmployees).mockResolvedValue(
      Array.from({ length: 87 }, (_, i) => makeEmployee(i + 1)),
    );
  });

  it('25 per page by default with "Showing 1–25 of 87" and 4 pages', async () => {
    renderAt('/employees');
    await screen.findByText('Person 01');
    expect(within(table()).getAllByRole('rowheader')).toHaveLength(25);
    expect(screen.getByText('Showing 1–25 of 87')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('87 employees')).toBeInTheDocument();
  });

  it('next/previous move through pages, reflected in the URL', async () => {
    renderAt('/employees');
    await screen.findByText('Person 01');
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Person 26')).toBeInTheDocument();
    expect(screen.getByText('Showing 26–50 of 87')).toBeInTheDocument();
    expect(where()).toBe('/employees?page=2');

    await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Person 01')).toBeInTheDocument();
    expect(where()).toBe('/employees');
  });

  it('the last page is partial, and Next is disabled', async () => {
    renderAt('/employees?page=4');
    expect(await screen.findByText('Showing 76–87 of 87')).toBeInTheDocument();
    expect(within(table()).getAllByRole('rowheader')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('changing the page size resets to page 1', async () => {
    renderAt('/employees?page=3');
    await screen.findByText('Showing 51–75 of 87');
    await userEvent.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    await userEvent.click(await screen.findByRole('option', { name: '10 / page' }));
    expect(await screen.findByText('Showing 1–10 of 87')).toBeInTheDocument();
    expect(where()).toBe('/employees?size=10');
  });

  it('an out-of-range page in the URL is clamped, not blank', async () => {
    renderAt('/employees?page=99');
    expect(await screen.findByText('Showing 76–87 of 87')).toBeInTheDocument();
  });

  it('filtering resets to the first page', async () => {
    renderAt('/employees?page=3');
    await screen.findByText('Showing 51–75 of 87');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'Person 7');
    await waitFor(() => {
      expect(where()).toBe('/employees?q=Person+7');
    });
  });
});

describe('add employee (TC-EMP-01, 03, 14)', () => {
  async function openAdd() {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Add employee' }));
    return screen.findByRole('dialog', { name: 'Add employee' });
  }

  async function chooseStatus(dialog: HTMLElement, status: string) {
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Employment status/ }));
    await userEvent.click(await screen.findByRole('option', { name: status }));
  }

  it('opens an empty, labelled form with required markers', async () => {
    const dialog = await openAdd();
    for (const label of ['Employee ID', 'Complete name', 'Position', 'Employment status']) {
      expect(within(dialog).getByLabelText(new RegExp(label))).toBeRequired();
    }
    expect(within(dialog).getByLabelText('Location')).not.toBeRequired();
    expect(within(dialog).getByLabelText(/Employee ID/)).toHaveValue('');
    expect(within(dialog).queryByText(/Created .* Updated/)).toBeNull();
  });

  it('validation: empty submit shows every required message and saves nothing', async () => {
    const dialog = await openAdd();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));
    expect(await within(dialog).findByText('Enter the employee ID.')).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the employee's complete name.")).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a position.')).toBeInTheDocument();
    expect(within(dialog).getByText('Select an employment status.')).toBeInTheDocument();
    expect(service.createEmployee).not.toHaveBeenCalled();
  });

  it('validation: an invalid Employee ID shows the pattern message', async () => {
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Employee ID/), 'EMP/42');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));
    expect(
      await within(dialog).findByText(
        'Use letters, numbers, dots, dashes or underscores (max 30).',
      ),
    ).toBeInTheDocument();
  });

  it('saves trimmed values with a null department, reports success, closes, and refreshes the list', async () => {
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Employee ID/), ' EMP-0200 ');
    await userEvent.type(within(dialog).getByLabelText(/Complete name/), '  Maria Santos ');
    await userEvent.type(within(dialog).getByLabelText(/Position/), 'HR Officer');
    await chooseStatus(dialog, 'Probationary');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));

    await waitFor(() => {
      expect(service.createEmployee).toHaveBeenCalledWith(
        {
          employeeNumber: 'EMP-0200',
          fullName: 'Maria Santos',
          position: 'HR Officer',
          department: null,
          employmentStatus: 'Probationary',
        },
        'hr1',
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(toast.success).toHaveBeenCalledWith('Added Maria Santos.');
    expect(service.listEmployees).toHaveBeenCalledTimes(2); // initial + invalidation refetch
  });

  it('TC-EMP-02: a duplicate ID from the server shows under the field and keeps the form open', async () => {
    vi.mocked(service.createEmployee).mockRejectedValue(new AppError('DUPLICATE_EMPLOYEE_NUMBER'));
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Employee ID/), 'emp-0042');
    await userEvent.type(within(dialog).getByLabelText(/Complete name/), 'Someone');
    await userEvent.type(within(dialog).getByLabelText(/Position/), 'Staff');
    await chooseStatus(dialog, 'Regular');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));

    expect(
      await within(dialog).findByText('This employee ID is already in use.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Employee ID/)).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText(/Employee ID/)).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Add employee' })).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('any other failure shows a friendly alert in the dialog and keeps the typed data', async () => {
    vi.mocked(service.createEmployee).mockRejectedValue(new AppError('OFFLINE'));
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Employee ID/), 'EMP-0300');
    await userEvent.type(within(dialog).getByLabelText(/Complete name/), 'Someone');
    await userEvent.type(within(dialog).getByLabelText(/Position/), 'Staff');
    await chooseStatus(dialog, 'Regular');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "You're offline. Reconnect and try again.",
    );
    expect(within(dialog).getByLabelText(/Complete name/)).toHaveValue('Someone');
  });

  it('cannot be double-submitted or dismissed while saving', async () => {
    let finish: (id: string) => void = () => undefined;
    vi.mocked(service.createEmployee).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Employee ID/), 'EMP-0400');
    await userEvent.type(within(dialog).getByLabelText(/Complete name/), 'Someone');
    await userEvent.type(within(dialog).getByLabelText(/Position/), 'Staff');
    await chooseStatus(dialog, 'Regular');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));

    const busy = await within(dialog).findByRole('button', { name: 'Save employee' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Add employee' })).toBeInTheDocument();
    expect(service.createEmployee).toHaveBeenCalledTimes(1);

    finish('x');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('closing with typed changes asks first; Keep editing returns, Discard closes', async () => {
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Complete name/), 'Half typed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog', { name: 'Add employee' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: 'Add employee' })).getByLabelText(/Complete name/),
    ).toHaveValue('Half typed');

    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Add employee' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(service.createEmployee).not.toHaveBeenCalled();
  });

  it('returns focus to the "Add employee" button when the dialog closes (WCAG 2.4.3)', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    const opener = screen.getByRole('button', { name: 'Add employee' });
    await userEvent.click(opener);
    await screen.findByRole('dialog', { name: 'Add employee' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // Radix restores focus on the next tick after unmount.
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('closing an untouched form needs no confirmation, and reopening starts clean', async () => {
    const dialog = await openAdd();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add employee' }));
    const again = await screen.findByRole('dialog', { name: 'Add employee' });
    expect(within(again).getByLabelText(/Complete name/)).toHaveValue('');
  });
});

describe('edit employee (TC-EMP-04, 05, 06)', () => {
  async function openEdit(name: string) {
    renderAt('/employees');
    await screen.findByText(name);
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    return screen.findByRole('dialog', { name: 'Edit employee' });
  }

  it('prefills the record and shows the created / updated stamps', async () => {
    const dialog = await openEdit('Juan Dela Cruz');
    expect(within(dialog).getByLabelText(/Employee ID/)).toHaveValue('EMP-0042');
    expect(within(dialog).getByLabelText(/Complete name/)).toHaveValue('Juan Dela Cruz');
    expect(within(dialog).getByLabelText(/Position/)).toHaveValue('Accounting Staff');
    expect(within(dialog).getByLabelText('Location')).toHaveValue('Finance');
    expect(within(dialog).getByRole('combobox', { name: /Employment status/ })).toHaveTextContent(
      'Regular',
    );
    expect(within(dialog).getByText(/Created Feb 10, 2026/)).toBeInTheDocument();
  });

  it('saves only through updateEmployee with the employee id, and reports success', async () => {
    const dialog = await openEdit('Juan Dela Cruz');
    const position = within(dialog).getByLabelText(/Position/);
    await userEvent.clear(position);
    await userEvent.type(position, 'Senior Accountant');
    await userEvent.clear(within(dialog).getByLabelText('Location'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));

    await waitFor(() => {
      expect(service.updateEmployee).toHaveBeenCalledWith(
        'juan',
        {
          employeeNumber: 'EMP-0042',
          fullName: 'Juan Dela Cruz',
          position: 'Senior Accountant',
          department: null,
          employmentStatus: 'Regular',
        },
        'hr1',
      );
    });
    expect(service.createEmployee).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Saved changes to Juan Dela Cruz.');
  });

  it('changing the Employee ID to one in use shows the duplicate message', async () => {
    vi.mocked(service.updateEmployee).mockRejectedValue(new AppError('DUPLICATE_EMPLOYEE_NUMBER'));
    const dialog = await openEdit('Juan Dela Cruz');
    const id = within(dialog).getByLabelText(/Employee ID/);
    await userEvent.clear(id);
    await userEvent.type(id, 'EMP-0043');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));
    expect(
      await within(dialog).findByText('This employee ID is already in use.'),
    ).toBeInTheDocument();
  });

  it('a record that vanished meanwhile is reported as not found', async () => {
    vi.mocked(service.updateEmployee).mockRejectedValue(new AppError('NOT_FOUND'));
    const dialog = await openEdit('Juan Dela Cruz');
    await userEvent.type(within(dialog).getByLabelText(/Position/), '!');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save employee' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That record no longer exists.',
    );
  });
});

describe('archive and restore (TC-EMP-07, 11, 12)', () => {
  it('Archive asks first, names the employee, and explains what it does', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Juan Dela Cruz' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    const confirm = await screen.findByRole('dialog', { name: 'Archive Juan Dela Cruz?' });
    expect(confirm).toHaveAccessibleDescription(
      /Their leave history is kept and appears in reports/,
    );
    expect(service.archiveEmployee).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Archive employee' }));
    await waitFor(() => {
      expect(service.archiveEmployee).toHaveBeenCalledWith('juan', 'hr1');
    });
    expect(toast.success).toHaveBeenCalledWith('Archived Juan Dela Cruz.');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('cancelling the archive confirmation changes nothing', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Juan Dela Cruz' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(service.archiveEmployee).not.toHaveBeenCalled();
  });

  it('a failed archive reports the error and leaves the dialog open', async () => {
    vi.mocked(service.archiveEmployee).mockRejectedValue(new AppError('PERMISSION_DENIED'));
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Juan Dela Cruz' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive employee' }),
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'You no longer have permission to do that. Please sign in again.',
      );
    });
    expect(screen.getByRole('dialog', { name: 'Archive Juan Dela Cruz?' })).toBeInTheDocument();
  });

  it('an archived employee offers Restore (no confirmation), not Archive', async () => {
    renderAt('/employees?archived=archived');
    await screen.findByText('Mario Santos');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Mario Santos' }));
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restore' }));

    await waitFor(() => {
      expect(service.restoreEmployee).toHaveBeenCalledWith('mario', 'hr1');
    });
    expect(toast.success).toHaveBeenCalledWith('Restored Mario Santos.');
  });

  it('TC-EMP-11 (revised): nothing offers delete until employees are selected — and never in the row menu', async () => {
    renderAt('/employees?archived=all');
    await screen.findByText('Mario Santos');
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Juan Dela Cruz' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'View',
      'Edit',
      'Archive',
    ]);
  });
});

describe('navigation and accessibility', () => {
  it('the name link and a row click open the detail page; the actions menu does not', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Juan Dela Cruz' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(where()).toBe('/employees'); // opening the menu / choosing Edit did NOT navigate
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('link', { name: 'Juan Dela Cruz' }));
    expect(where()).toBe('/employees/juan');
  });

  it('clicking a plain cell opens the detail page', async () => {
    renderAt('/employees');
    await userEvent.click(await screen.findByText('EMP-0043'));
    expect(where()).toBe('/employees/ana');
  });

  it('the table is a named, keyboard-focusable region; controls have accessible names', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    expect(screen.getByRole('region', { name: 'Employees' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('searchbox', { name: 'Search employees' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Show employees' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
  });

  it('the archive filter is operable by arrow keys (radio-group semantics)', async () => {
    renderAt('/employees');
    await screen.findByText('Juan Dela Cruz');
    screen.getByRole('radio', { name: 'Active' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Archived' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Archived' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('employee detail page (FR-EMP-06)', () => {
  it('shows the identity block from the service', async () => {
    renderAt('/employees/juan');
    expect(await screen.findByRole('heading', { name: 'Juan Dela Cruz' })).toBeInTheDocument();
    expect(screen.getByText('EMP-0042')).toBeInTheDocument();
    expect(screen.getByText('Accounting Staff')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
    expect(screen.queryByText(/is archived/)).toBeNull();
    expect(await screen.findByText(/Leave summary for/)).toBeInTheDocument();
  });

  it('is served from the list cache when it is already loaded (no second read)', async () => {
    renderAt('/employees');
    await userEvent.click(await screen.findByText('EMP-0042'));
    expect(await screen.findByRole('heading', { name: 'Juan Dela Cruz' })).toBeInTheDocument();
    expect(service.getEmployee).not.toHaveBeenCalled();
  });

  it('an archived employee shows the banner and the Archived badge', async () => {
    renderAt('/employees/mario');
    expect(await screen.findByText(/This employee is archived\./)).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('an unknown employee shows Employee not found with a way back', async () => {
    renderAt('/employees/ghost');
    expect(await screen.findByText('Employee not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to employees' })).toHaveAttribute(
      'href',
      '/employees',
    );
  });

  it('a load failure shows a friendly error with Retry', async () => {
    vi.mocked(service.getEmployee)
      .mockRejectedValueOnce(new AppError('OFFLINE'))
      .mockResolvedValue(juan);
    renderAt('/employees/juan-not-cached');
    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline.");
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByRole('heading', { name: 'Juan Dela Cruz' })).toBeInTheDocument();
  });
});
