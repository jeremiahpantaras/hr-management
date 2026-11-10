import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { LeaveBreakdownTable } from '@/components/data/LeaveBreakdownTable';
import { Pagination } from '@/components/data/Pagination';
import { ProgressBar } from '@/components/data/ProgressBar';
import { SearchInput } from '@/components/data/SearchInput';
import { StatCard } from '@/components/data/StatCard';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly department: string;
}

const rows: readonly Row[] = [
  { id: '1', name: 'Juan Dela Cruz', department: 'Finance' },
  { id: '2', name: 'Ana Reyes', department: 'HR' },
];

const columns: readonly DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name, sortable: true, isRowHeader: true },
  { id: 'department', header: 'Department', cell: (row) => row.department, priority: 'low' },
];

describe('DataTable (UI spec §8)', () => {
  it('is a named, keyboard-scrollable region containing a captioned table', () => {
    render(<DataTable caption="Employees" columns={columns} rows={rows} getRowId={(r) => r.id} />);
    const region = screen.getByRole('region', { name: 'Employees' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('table', { name: 'Employees' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Juan Dela Cruz' })).toBeInTheDocument();
  });

  it('hides low-priority columns below the md breakpoint', () => {
    render(<DataTable caption="Employees" columns={columns} rows={rows} getRowId={(r) => r.id} />);
    expect(screen.getByRole('columnheader', { name: 'Department' })).toHaveClass(
      'hidden',
      'md:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveClass('hidden');
  });

  it('cycles sort asc → desc → none and exposes aria-sort', async () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <DataTable
        caption="Employees"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        sort={null}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'none');

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'asc' });

    rerender(
      <DataTable
        caption="Employees"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        sort={{ columnId: 'name', direction: 'asc' }}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'desc' });

    rerender(
      <DataTable
        caption="Employees"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        sort={{ columnId: 'name', direction: 'desc' }}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  it('loading: marks the region busy and renders hidden skeleton rows instead of data', () => {
    render(
      <DataTable
        caption="Employees"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        loading
        skeletonRows={3}
      />,
    );
    expect(screen.getByRole('region', { name: 'Employees' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Juan Dela Cruz')).toBeNull();
    expect(document.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(3);
  });

  it('empty: shows the provided empty state, or a generic default', () => {
    const { rerender } = render(
      <DataTable
        caption="Employees"
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        empty={<p>No employees yet</p>}
      />,
    );
    expect(screen.getByText('No employees yet')).toBeInTheDocument();
    rerender(<DataTable caption="Employees" columns={columns} rows={[]} getRowId={(r) => r.id} />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });

  it('error: shows a friendly message and a working Retry', async () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        caption="Employees"
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        error={{ message: 'The list could not be loaded.', code: 'UNAVAILABLE', onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The list could not be loaded.');
    expect(screen.getByText('Error code: UNAVAILABLE')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('rows are clickable and operable from the keyboard', async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        caption="Employees"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    const row = screen.getByRole('row', { name: /Juan Dela Cruz/ });
    await userEvent.click(row);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[0]);

    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});

describe('Pagination', () => {
  it('page mode: reports the range and disables Previous on the first page', async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination mode="pages" page={1} pageSize={25} total={87} onPageChange={onPageChange} />,
    );
    expect(screen.getByText('Showing 1–25 of 87')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('page mode: last page shows the partial range and disables Next', () => {
    render(
      <Pagination mode="pages" page={4} pageSize={25} total={87} onPageChange={() => undefined} />,
    );
    expect(screen.getByText('Showing 76–87 of 87')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('page mode: an empty result is "Showing 0–0 of 0" with both buttons disabled', () => {
    render(
      <Pagination mode="pages" page={1} pageSize={25} total={0} onPageChange={() => undefined} />,
    );
    expect(screen.getByText('Showing 0–0 of 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('cursor mode: shows the loaded count and a Load more button only while more exist', async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <Pagination mode="cursor" loadedCount={25} hasMore onLoadMore={onLoadMore} />,
    );
    expect(screen.getByText('Loaded 25 rows')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<Pagination mode="cursor" loadedCount={1} hasMore={false} onLoadMore={onLoadMore} />);
    expect(screen.getByText('Loaded 1 row')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});

describe('LeaveBreakdownTable', () => {
  it('shows halves with one decimal, the supplied totals row, and muted unassigned rows', () => {
    render(
      <LeaveBreakdownTable
        caption="Breakdown"
        rows={[
          {
            id: 'v',
            leaveTypeName: 'Vacation Leave',
            total: 10,
            used: 2.5,
            unused: 7.5,
            hasBalance: true,
          },
          {
            id: 'o',
            leaveTypeName: 'Old Leave',
            total: 0,
            used: 0,
            unused: 0,
            hasBalance: false,
            inactive: true,
          },
        ]}
        totals={{ total: 10, used: 2.5, unused: 7.5 }}
      />,
    );
    const vacation = screen.getByRole('row', { name: /Vacation Leave/ });
    expect(
      within(vacation)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(expect.arrayContaining(['10', '2.5', '7.5']));
    const old = screen.getByRole('row', { name: /Old Leave/ });
    expect(within(old).getByText('No credits assigned')).toBeInTheDocument();
    expect(within(old).getByText('Inactive')).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /^Total/ })).getAllByRole('cell')[3],
    ).toHaveTextContent('7.5');
  });
});

describe('ProgressBar / StatCard / SearchInput', () => {
  it('ProgressBar exposes a labelled progressbar and clamps the fill', () => {
    render(<ProgressBar value={30} max={10} label="Vacation used" />);
    const bar = screen.getByRole('progressbar', { name: 'Vacation used' });
    expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
  });

  it('ProgressBar with max 0 renders an empty bar without dividing by zero', () => {
    render(<ProgressBar value={0} max={0} label="Empty" />);
    expect(screen.getByRole('progressbar', { name: 'Empty' }).firstElementChild).toHaveStyle({
      width: '0%',
    });
  });

  it('StatCard shows its figure, or a labelled loading state', () => {
    const { rerender } = render(<StatCard label="Total credits" value="18" caption="2026" />);
    expect(screen.getByText('18')).toBeInTheDocument();
    rerender(<StatCard label="Total credits" value="18" loading />);
    expect(screen.queryByText('18')).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading Total credits' })).toBeInTheDocument();
  });

  it('SearchInput is labelled, reports changes, and clears', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SearchInput label="Search employees" value="" onChange={onChange} />,
    );
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search employees' }), 'j');
    expect(onChange).toHaveBeenCalledWith('j');

    rerender(<SearchInput label="Search employees" value="juan" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

describe('EmployeeCombobox accessible name (axe: button-name)', () => {
  it('a combobox without a <label> takes its name from aria-label — the role ignores its content', () => {
    render(
      <EmployeeCombobox
        employees={[]}
        value={null}
        onChange={() => undefined}
        placeholder="All employees"
        aria-label="Filter by employee"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Filter by employee' })).toHaveTextContent(
      'All employees',
    );
  });
});
