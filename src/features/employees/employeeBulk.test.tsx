import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { EmployeesPage } from '@/features/employees/EmployeesPage';
import * as service from '@/services/employees.service';
import type { Employee } from '@/types/models';

vi.mock('@/services/employees.service');
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const NOW = new Date('2026-02-10T08:00:00Z');
function employee(n: number, over: Partial<Employee> = {}): Employee {
  const number = `EMP-${String(n).padStart(4, '0')}`;
  return {
    id: `id${String(n)}`,
    employeeNumber: number,
    employeeNumberKey: number,
    fullName: `Person ${String(n).padStart(2, '0')}`,
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
// 30 active + 3 archived, so one page (25) is not everything
const active = Array.from({ length: 30 }, (_, i) => employee(i + 1));
const archived = [31, 32, 33].map((n) =>
  employee(n, { isArchived: true, archivedAt: NOW, archivedBy: 'hr1' }),
);
const everyone = [...active, ...archived];

function renderAt(path = '/employees') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/employees/:employeeId" element={<p>detail page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
const ok = (ids: readonly string[]) =>
  ids.map((employeeId) => ({ employeeId, ok: true, code: null }));
const rowBox = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}` });
const bar = () => screen.getByRole('region', { name: 'Bulk actions' });
const headerBox = () => screen.getByRole('checkbox', { name: 'Select all on this page' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(service.listEmployees).mockResolvedValue(everyone);
  vi.mocked(service.archiveEmployeesBulk).mockImplementation((ids) => Promise.resolve(ok(ids)));
  vi.mocked(service.restoreEmployeesBulk).mockImplementation((ids) => Promise.resolve(ok(ids)));
  vi.mocked(service.deleteEmployeesBulk).mockImplementation((ids) => Promise.resolve(ok(ids)));
  vi.mocked(service.findEmployeesWithLeaveRecords).mockResolvedValue(new Set());
});

describe('selecting rows', () => {
  it('has a checkbox on every row and a select-all in the header; no bar until something is selected', async () => {
    renderAt();
    await screen.findByText('Person 01');
    expect(headerBox()).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(26); // header + 25 rows
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('selecting a row shows the bar with the count and the actions', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    expect(within(bar()).getByRole('status')).toHaveTextContent('1 employee selected');
    expect(within(bar()).getByRole('button', { name: 'Archive 1' })).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Delete 1' })).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
    expect(within(bar()).queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument();
  });

  it('the header checkbox selects the whole page, is indeterminate when partly selected, and clears', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    expect(headerBox()).toHaveAttribute('data-state', 'indeterminate');
    await userEvent.click(headerBox());
    expect(headerBox()).toHaveAttribute('data-state', 'checked');
    expect(within(bar()).getByRole('status')).toHaveTextContent('25 employees selected');
    await userEvent.click(headerBox());
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
  });

  it('offers "Select all N matching" beyond the page, and then selects every matching employee', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(headerBox());
    await userEvent.click(within(bar()).getByRole('button', { name: 'Select all 30 matching' }));
    expect(within(bar()).getByRole('status')).toHaveTextContent('30 employees selected');
    expect(within(bar()).queryByRole('button', { name: /Select all/ })).not.toBeInTheDocument();
  });

  it('the selection survives paging, but is cleared when the search or filters change', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Person 26');
    expect(within(bar()).getByRole('status')).toHaveTextContent('1 employee selected');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'Person 2');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    });
    // …and clearing the search must NOT bring the old selection back
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await screen.findByText('Person 01');
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('checkbox').some((box) => box.getAttribute('data-state') === 'checked'),
    ).toBe(false);
  });

  it('ticking a checkbox does not open the employee', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    expect(screen.queryByText('detail page')).not.toBeInTheDocument();
  });

  it('Clear selection empties it', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(headerBox());
    await userEvent.click(within(bar()).getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
  });
});

describe('archive and restore in bulk', () => {
  it('asks first, archives only the active employees, confirms, and clears the selection', async () => {
    renderAt('/employees?archived=all');
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(rowBox('Person 02'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Archive 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive 2 employees?' });
    expect(within(dialog).getByText(/leave history is kept/)).toBeInTheDocument();
    expect(service.archiveEmployeesBulk).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive 2' }));
    await waitFor(() => {
      expect(service.archiveEmployeesBulk).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(service.archiveEmployeesBulk).mock.calls[0]![0]).toEqual(['id1', 'id2']);
    expect(vi.mocked(service.archiveEmployeesBulk).mock.calls[0]![1]).toBe('hr1');
    expect(toast.success).toHaveBeenCalledWith('Archived 2 employees.');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    });
  });

  it('a mixed selection offers both, each acting on its own subset', async () => {
    renderAt('/employees?archived=all');
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Person 31' }));
    expect(within(bar()).getByRole('button', { name: 'Archive 1' })).toBeInTheDocument();
    await userEvent.click(within(bar()).getByRole('button', { name: 'Restore 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore 1 employee?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore 1' }));
    await waitFor(() => {
      expect(service.restoreEmployeesBulk).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(service.restoreEmployeesBulk).mock.calls[0]![0]).toEqual(['id31']);
    expect(service.archiveEmployeesBulk).not.toHaveBeenCalled();
    // the one that was not part of this action is still selected
    await waitFor(() => {
      expect(within(bar()).getByRole('status')).toHaveTextContent('1 employee selected');
    });
  });

  it('a partial failure is reported honestly and the failed rows stay selected', async () => {
    vi.mocked(service.archiveEmployeesBulk).mockResolvedValue([
      { employeeId: 'id1', ok: true, code: null },
      { employeeId: 'id2', ok: false, code: 'PERMISSION_DENIED' },
    ]);
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(rowBox('Person 02'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Archive 2' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive 2' }),
    );
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Archived 1 of 2. 1 employee could not be changed.',
      );
    });
    expect(within(bar()).getByRole('status')).toHaveTextContent('1 employee selected');
    expect(rowBox('Person 02')).toHaveAttribute('data-state', 'checked');
  });

  it('if everything fails it is an error toast, and a network failure keeps the dialog open', async () => {
    vi.mocked(service.archiveEmployeesBulk).mockRejectedValueOnce(new Error('network'));
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Archive 1' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive 1' }),
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong. Try again.');
    });
    expect(screen.getByRole('dialog', { name: 'Archive 1 employee?' })).toBeInTheDocument();
  });
});

describe('delete in bulk (only employees without leave records)', () => {
  it('checks for leave records first, then asks with a destructive confirmation (focus starts on Cancel)', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(rowBox('Person 02'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 2 employees permanently?' });
    expect(vi.mocked(service.findEmployeesWithLeaveRecords).mock.calls[0]![0]).toEqual([
      'id1',
      'id2',
    ]);
    expect(
      within(dialog).getByText("This can't be undone. Their Employee IDs become available again."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Person 01, Person 02')).toBeInTheDocument();
    expect(service.deleteEmployeesBulk).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 2' }));
    await waitFor(() => {
      expect(service.deleteEmployeesBulk).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(service.deleteEmployeesBulk).mock.calls[0]![0]).toEqual(['id1', 'id2']);
    expect(toast.success).toHaveBeenCalledWith('Deleted 2 employees.');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    });
  });

  it('names the employees that have leave records and deletes only the others', async () => {
    vi.mocked(service.findEmployeesWithLeaveRecords).mockResolvedValue(new Set(['id2']));
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(rowBox('Person 02'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 1 employee permanently?' });
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      '1 employee has leave records and will be kept: Person 02. Archive them instead.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 1' }));
    await waitFor(() => {
      expect(service.deleteEmployeesBulk).toHaveBeenCalled();
    });
    expect(vi.mocked(service.deleteEmployeesBulk).mock.calls[0]![0]).toEqual(['id1']);
    // the protected one stays selected
    await waitFor(() => {
      expect(within(bar()).getByRole('status')).toHaveTextContent('1 employee selected');
    });
    expect(rowBox('Person 02')).toHaveAttribute('data-state', 'checked');
  });

  it('when nobody can be deleted there is no delete button — only Close', async () => {
    vi.mocked(service.findEmployeesWithLeaveRecords).mockResolvedValue(new Set(['id1']));
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'These employees can’t be deleted' });
    expect(within(dialog).getByRole('note')).toHaveTextContent('Person 01');
    expect(within(dialog).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!); // footer button (the X is also named Close)
    expect(service.deleteEmployeesBulk).not.toHaveBeenCalled();
  });

  it('shows many names compactly ("… and 3 more")', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(headerBox());
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete 25' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 25 employees permanently?' });
    expect(
      within(dialog).getByText(/Person 01, Person 02, Person 03, Person 04, Person 05 and 20 more/),
    ).toBeInTheDocument();
  });

  it('cancelling deletes nothing', async () => {
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete 1' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(service.deleteEmployeesBulk).not.toHaveBeenCalled();
    expect(within(bar()).getByRole('status')).toHaveTextContent('1 employee selected');
  });

  it('a failed record check is reported and nothing is offered for deletion', async () => {
    vi.mocked(service.findEmployeesWithLeaveRecords).mockRejectedValueOnce(new Error('network'));
    renderAt();
    await screen.findByText('Person 01');
    await userEvent.click(rowBox('Person 01'));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete 1' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong. Try again.');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
