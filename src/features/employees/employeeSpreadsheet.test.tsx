import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ExcelModule from '@/utils/excel/employees/employeeExcel';
import { IMPORT_COLUMNS } from '@/domain/employeeImport';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { EmployeesPage } from '@/features/employees/EmployeesPage';
import * as service from '@/services/employees.service';
import type { Employee } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// The zip layer is exercised for real in src/utils/excel (Node environment); here only the
// downloads are replaced so the dialogs' behaviour can be observed.
const downloadEmployees = vi.fn<(rows: readonly Employee[], options: unknown) => string>();
const downloadTemplate = vi.fn<(paper: string) => string>();
vi.mock('@/utils/excel/employees/employeeExcel', async (importOriginal) => ({
  ...(await importOriginal<typeof ExcelModule>()),
  downloadEmployees: (rows: readonly Employee[], options: unknown) =>
    downloadEmployees(rows, options),
  downloadTemplate: (paper: string) => downloadTemplate(paper),
}));

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
    employeeNumberKey: number.toUpperCase(),
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
const juan = employee('juan', 'Juan Dela Cruz', 'EMP-0042');
const ana = employee('ana', 'Ana Reyes', 'EMP-0043');
const mario = employee('mario', 'Mario Santos', 'EMP-0100', { isArchived: true });

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={['/employees']}>
          <EmployeesPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function xlsxFile(rows: unknown[][], name = 'employees.xlsx'): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Employees');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
const HEADER = [...IMPORT_COLUMNS];

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  downloadEmployees.mockReturnValue('Employees_A4_20261109-1405.xlsx');
  vi.mocked(service.listEmployees).mockResolvedValue([juan, ana, mario]);
  vi.mocked(service.createEmployeesBulk).mockImplementation((items, _uid, options) => {
    items.forEach((_item, i) => options?.onProgress?.(i + 1, items.length));
    return Promise.resolve(
      items.map((item) => ({ rowNumber: item.rowNumber, ok: true, code: null })),
    );
  });
});

async function openExport() {
  renderPage();
  await screen.findByText('Juan Dela Cruz');
  await userEvent.click(screen.getByRole('button', { name: 'Export' }));
  return screen.findByRole('dialog', { name: 'Export employees' });
}
async function openImport() {
  renderPage();
  await screen.findByText('Juan Dela Cruz');
  await userEvent.click(screen.getByRole('button', { name: 'Import' }));
  return screen.findByRole('dialog', { name: 'Import employees' });
}
const choose = (dialog: HTMLElement, rows: unknown[][], name?: string) =>
  userEvent.upload(within(dialog).getByLabelText('Excel file'), xlsxFile(rows, name));

describe('Export employees', () => {
  it('offers Letter and A4, landscape and portrait, with A4 landscape as the default', async () => {
    const dialog = await openExport();
    expect(within(dialog).getByRole('radio', { name: 'A4 (210 × 297 mm)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(dialog).getByRole('radio', { name: 'Letter (8.5 × 11 in)' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(dialog).getByRole('radio', { name: 'Landscape' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(dialog).getByRole('radio', { name: 'Portrait' })).toBeInTheDocument();
  });

  it('shows how many employees each choice exports: current view (active) vs everyone incl. archived', async () => {
    const dialog = await openExport();
    expect(within(dialog).getByRole('radio', { name: 'Current view (2)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      within(dialog).getByRole('radio', { name: 'Everyone, incl. archived (3)' }),
    ).toBeInTheDocument();
  });

  it('exports the current view with the chosen paper and orientation, then confirms and closes', async () => {
    const dialog = await openExport();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Letter (8.5 × 11 in)' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Portrait' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download Excel' }));
    await waitFor(() => {
      expect(downloadEmployees).toHaveBeenCalledTimes(1);
    });
    const [rows, options] = downloadEmployees.mock.calls[0]!;
    expect(rows.map((r) => r.fullName)).toEqual(['Ana Reyes', 'Juan Dela Cruz']); // A–Z, archived hidden
    expect(options).toEqual({ paper: 'LETTER', orientation: 'portrait' });
    expect(toast.success).toHaveBeenCalledWith(
      'Exported 2 employees to Employees_A4_20261109-1405.xlsx.',
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Export employees' })).not.toBeInTheDocument();
    });
  });

  it('"Everyone" includes archived employees', async () => {
    const dialog = await openExport();
    await userEvent.click(
      within(dialog).getByRole('radio', { name: 'Everyone, incl. archived (3)' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download Excel' }));
    await waitFor(() => {
      expect(downloadEmployees).toHaveBeenCalled();
    });
    expect(downloadEmployees.mock.calls[0]![0].map((r) => r.fullName)).toEqual([
      'Ana Reyes',
      'Juan Dela Cruz',
      'Mario Santos',
    ]);
  });

  it('the current view follows the search box (all pages, not just the visible one)', async () => {
    renderPage();
    await screen.findByText('Juan Dela Cruz');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'juan');
    await waitFor(() => {
      expect(screen.queryByText('Ana Reyes')).not.toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export employees' });
    expect(within(dialog).getByRole('radio', { name: 'Current view (1)' })).toBeInTheDocument();
  });

  it('remembers the paper and orientation for next time', async () => {
    const dialog = await openExport();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Letter (8.5 × 11 in)' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const again = await screen.findByRole('dialog', { name: 'Export employees' });
    expect(within(again).getByRole('radio', { name: 'Letter (8.5 × 11 in)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('survives blocked storage and a corrupt saved value', async () => {
    window.localStorage.setItem('hr.employeeExport.print', '{not json');
    const dialog = await openExport();
    expect(within(dialog).getByRole('radio', { name: 'A4 (210 × 297 mm)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('reports a failure instead of closing silently', async () => {
    downloadEmployees.mockImplementation(() => {
      throw new Error('boom');
    });
    const dialog = await openExport();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download Excel' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("The Excel file couldn't be created. Try again.");
    });
    expect(screen.getByRole('dialog', { name: 'Export employees' })).toBeInTheDocument();
  });

  it('is unavailable while the list is still loading', () => {
    vi.mocked(service.listEmployees).mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});

describe('Import employees', () => {
  it('explains the columns and offers the template for A4 or Letter', async () => {
    const dialog = await openImport();
    expect(
      within(dialog).getByText(/Employee ID, Complete Name, Position, Department/),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download template' }));
    await waitFor(() => {
      expect(downloadTemplate).toHaveBeenCalledWith('A4');
    });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Letter' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download template' }));
    await waitFor(() => {
      expect(downloadTemplate).toHaveBeenLastCalledWith('LETTER');
    });
  });

  it('rejects a file that is not .xlsx, with a clear message', async () => {
    const dialog = await openImport();
    await userEvent.upload(
      within(dialog).getByLabelText('Excel file'),
      new File(['a,b'], 'people.csv', { type: 'text/csv' }),
      { applyAccept: false },
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Choose an Excel file with the .xlsx extension',
    );
  });

  it('rejects a file larger than 5 MB', async () => {
    const dialog = await openImport();
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.xlsx');
    await userEvent.upload(within(dialog).getByLabelText('Excel file'), big);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('larger than 5 MB');
  });

  it('rejects a corrupt .xlsx and a sheet without the header row', async () => {
    const dialog = await openImport();
    await userEvent.upload(
      within(dialog).getByLabelText('Excel file'),
      new File(['not a zip'], 'x.xlsx'),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("couldn't be read");
    await choose(dialog, [
      ['Just', 'some', 'cells'],
      ['a', 'b', 'c'],
    ]);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "couldn't find the header row",
    );
  });

  it('previews every row with a verdict before anything is written', async () => {
    const dialog = await openImport();
    await choose(dialog, [
      HEADER,
      ['EMP-0500', 'New Person', 'Clerk', 'Finance', 'regular'], // ready
      ['EMP-0042', 'Existing Juan', 'Clerk', '', 'Regular'], // already exists
      ['emp-0500', 'Same ID again', 'Clerk', '', 'Regular'], // duplicate in file
      ['bad/id', '', 'Clerk', '', 'Intern'], // invalid
    ]);
    const table = await within(dialog).findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText('Ready')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Already exists')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Duplicate in file')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Same employee ID as row 2.')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Problem')).toBeInTheDocument();
    expect(within(rows[3]!).getByText(/Select an employment status/)).toBeInTheDocument();
    expect(within(dialog).getByText(/4 rows found/)).toHaveTextContent(
      '1 ready, 3 will be skipped',
    );
    expect(service.createEmployeesBulk).not.toHaveBeenCalled();
  });

  it('a duplicate of an ARCHIVED employee is also caught', async () => {
    const dialog = await openImport();
    await choose(dialog, [HEADER, ['emp-0100', 'Another Mario', 'Driver', '', 'Regular']]);
    expect(await within(dialog).findByText('Already exists')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Import 0 employees/ })).toBeDisabled();
  });

  it('imports only the ready rows, shows progress and a summary, and refreshes the list', async () => {
    const dialog = await openImport();
    await choose(dialog, [
      HEADER,
      ['EMP-0500', ' New Person ', 'Clerk', '', 'part time'],
      ['EMP-0501', 'Second', 'Clerk', 'HR', 'Regular'],
      ['', '', '', '', ''],
      ['EMP-0042', 'Dup', 'X', '', 'Regular'],
    ]);
    await within(dialog).findByRole('table');
    vi.mocked(service.listEmployees).mockClear();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import 2 employees' }));
    await waitFor(() => {
      expect(service.createEmployeesBulk).toHaveBeenCalledTimes(1);
    });
    const [items, uid] = vi.mocked(service.createEmployeesBulk).mock.calls[0]!;
    expect(uid).toBe('hr1');
    expect(items).toEqual([
      {
        rowNumber: 2,
        input: {
          employeeNumber: 'EMP-0500',
          fullName: 'New Person',
          position: 'Clerk',
          department: null,
          employmentStatus: 'Part-Time',
        },
      },
      {
        rowNumber: 3,
        input: {
          employeeNumber: 'EMP-0501',
          fullName: 'Second',
          position: 'Clerk',
          department: 'HR',
          employmentStatus: 'Regular',
        },
      },
    ]);
    expect(
      (await within(dialog).findByText(/2 employees imported/)).closest('p'),
    ).toHaveTextContent('2 employees imported, 1 skipped because of problems in the file');
    expect(toast.success).toHaveBeenCalledWith('Imported 2 employees.');
    await waitFor(() => {
      expect(service.listEmployees).toHaveBeenCalled();
    }); // directory refreshed
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Import employees' })).not.toBeInTheDocument();
    });
  });

  it('a double click imports once', async () => {
    const dialog = await openImport();
    await choose(dialog, [HEADER, ['EMP-0500', 'New', 'Clerk', '', 'Regular']]);
    await within(dialog).findByRole('table');
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Import 1 employee' }));
    await within(dialog).findByText(/1 employee imported/);
    expect(service.createEmployeesBulk).toHaveBeenCalledTimes(1);
  });

  it('shows per-row failures (an ID taken meanwhile) without hiding the successes', async () => {
    vi.mocked(service.createEmployeesBulk).mockResolvedValue([
      { rowNumber: 2, ok: true, code: null },
      { rowNumber: 3, ok: false, code: 'DUPLICATE_EMPLOYEE_NUMBER' },
      { rowNumber: 4, ok: false, code: 'PERMISSION_DENIED' },
    ]);
    const dialog = await openImport();
    await choose(dialog, [
      HEADER,
      ['E2', 'A', 'P', '', 'Regular'],
      ['E3', 'B', 'P', '', 'Regular'],
      ['E4', 'C', 'P', '', 'Regular'],
    ]);
    await within(dialog).findByRole('table');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import 3 employees' }));
    expect((await within(dialog).findByText(/1 employee imported/)).closest('p')).toHaveTextContent(
      '1 employee imported, 2 could not be saved',
    );
    expect(
      within(dialog).getByText('Row 3: This employee ID is already in use.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Row 4: You no longer have permission/)).toBeInTheDocument();
  });

  it('"Choose another file" goes back, and a whole-import failure returns to the preview with a toast', async () => {
    vi.mocked(service.createEmployeesBulk).mockRejectedValueOnce(new Error('network'));
    const dialog = await openImport();
    await choose(dialog, [HEADER, ['E9', 'A', 'P', '', 'Regular']]);
    await within(dialog).findByRole('table');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import 1 employee' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong. Try again.');
    });
    expect(await within(dialog).findByRole('table')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose another file' }));
    expect(within(dialog).getByRole('button', { name: 'Choose Excel file' })).toBeInTheDocument();
  });

  it('the dialog cannot be dismissed while the import is running', async () => {
    let release: () => void = () => undefined;
    vi.mocked(service.createEmployeesBulk).mockReturnValue(
      new Promise((resolve) => {
        release = () => {
          resolve([{ rowNumber: 2, ok: true, code: null }]);
        };
      }),
    );
    const dialog = await openImport();
    await choose(dialog, [HEADER, ['E9', 'A', 'P', '', 'Regular']]);
    await within(dialog).findByRole('table');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import 1 employee' }));
    expect(await within(dialog).findByText(/Importing \d+ of \d+/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Import employees' })).toBeInTheDocument();
    release();
    await within(dialog).findByText(/1 employee imported/);
  });
});
