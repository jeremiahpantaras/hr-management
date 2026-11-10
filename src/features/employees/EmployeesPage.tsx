import { Download, Plus, Upload, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { DataTable, type DataTableColumn, type SortState } from '@/components/data/DataTable';
import { FilterDropdown } from '@/components/data/FilterDropdown';
import { Pagination } from '@/components/data/Pagination';
import { SearchInput } from '@/components/data/SearchInput';
import { SegmentedControl } from '@/components/data/SegmentedControl';
import { StatusBadge } from '@/components/data/StatusBadge';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DEFAULT_EMPLOYEE_PAGE_SIZE, EMPLOYMENT_STATUSES } from '@/domain/constants';
import {
  DEFAULT_SORT,
  filterEmployees,
  paginate,
  parseArchiveFilter,
  parsePage,
  parsePageSize,
  parseSort,
  parseStatusFilter,
  sortEmployees,
  type ArchiveFilter,
  type EmployeeSortKey,
} from '@/domain/employeeList';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import { EmployeeBulkBar } from '@/features/employees/EmployeeBulkBar';
import { EmployeeActionsMenu } from '@/features/employees/EmployeeActionsMenu';
import { EmployeeExportDialog } from '@/features/employees/EmployeeExportDialog';
import { EmployeeFormDialog } from '@/features/employees/EmployeeFormDialog';
import { EmployeeImportDialog } from '@/features/employees/EmployeeImportDialog';
import {
  useArchiveEmployee,
  useEmployees,
  useRestoreEmployee,
} from '@/features/employees/hooks/useEmployees';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Employee } from '@/types/models';

const EMPTY_SELECTION: ReadonlySet<string> = new Set();
const STATUS_OPTIONS = EMPLOYMENT_STATUSES.map((status) => ({ value: status, label: status }));
const ARCHIVE_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
] as const;

/**
 * Employee directory (UI spec §6.5, FR-EMP-01…08). The whole list is cached once and searched,
 * filtered, sorted and paged on the client (D-09); every filter lives in the URL so the page is
 * shareable and Back restores it.
 */
export function EmployeesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const employeesQuery = useEmployees();
  const archive = useArchiveEmployee();
  const restore = useRestoreEmployee();

  const query = params.get('q') ?? '';
  const status = parseStatusFilter(params.get('status'));
  const archiveFilter = parseArchiveFilter(params.get('archived'));
  const sort = parseSort(params.get('sort'), params.get('dir'));
  const pageSize = parsePageSize(params.get('size'));
  const requestedPage = parsePage(params.get('page'));

  // ── search box: typing is local, the URL updates after a 250 ms pause ─────────────────────
  const [searchText, setSearchText] = useState(query);
  const debouncedSearch = useDebouncedValue(searchText);
  const pushedQuery = useRef(query);

  function updateParams(
    changes: Record<string, string | null>,
    options: { resetPage?: boolean } = {},
  ): void {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        if (options.resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    if (debouncedSearch !== pushedQuery.current) {
      pushedQuery.current = debouncedSearch;
      updateParams({ q: debouncedSearch }, { resetPage: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debouncedSearch]);

  useEffect(() => {
    if (query !== pushedQuery.current) {
      pushedQuery.current = query;
      setSearchText(query);
    }
  }, [query]);

  // ── derived list ───────────────────────────────────────────────────────────────────────────
  const all = employeesQuery.data;
  const filtered = useMemo(
    () =>
      sortEmployees(filterEmployees(all ?? [], { query, status, archive: archiveFilter }), sort),
    [all, query, status, archiveFilter, sort],
  );
  const page = paginate(filtered, requestedPage, pageSize);
  // ── selection (checkboxes). It belongs to the current search/filters: changing them clears it, so
  // nothing is ever selected out of sight.
  const filterKey = `${query}|${status}|${archiveFilter}`;
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<string> }>({
    key: filterKey,
    ids: new Set(),
  });
  if (selection.key !== filterKey) {
    // The filters changed: drop the old selection for good (not just hide it — going back to the
    // previous filters must not bring it back).
    setSelection({ key: filterKey, ids: EMPTY_SELECTION });
  }
  const selectedIds = selection.key === filterKey ? selection.ids : EMPTY_SELECTION;
  function updateSelection(next: ReadonlySet<string>): void {
    setSelection({ key: filterKey, ids: next });
  }

  const pageIds = page.items.map((e) => e.id);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
  const selectedEmployees = filtered.filter((e) => selectedIds.has(e.id));
  function toggleOne(id: string, checked: boolean): void {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    updateSelection(next);
  }
  function togglePage(checked: boolean): void {
    const next = new Set(selectedIds);
    for (const id of pageIds) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    updateSelection(next);
  }
  const hasFilters = query !== '' || status !== '' || archiveFilter !== 'active';

  function clearFilters(): void {
    pushedQuery.current = '';
    setSearchText('');
    setParams({}, { replace: true });
  }

  // ── dialogs ────────────────────────────────────────────────────────────────────────────────
  // The target is kept while the dialog fades out so its title does not flip mid-animation.
  const [formOpen, setFormOpen] = useState(false);
  const [formEmployee, setFormEmployee] = useState<Employee | null>(null);
  function openForm(employee: Employee | null): void {
    setFormEmployee(employee);
    setFormOpen(true);
  }
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const everyone = useMemo(() => sortEmployees(all ?? [], DEFAULT_SORT), [all]);

  async function confirmArchive(): Promise<void> {
    if (!archiveTarget) return;
    try {
      await archive.mutateAsync(archiveTarget.id);
      toast.success(`Archived ${archiveTarget.fullName}.`);
    } catch (error) {
      toast.error(appErrorMessage(error));
      throw error; // keep the dialog open
    }
  }

  function restoreEmployee(employee: Employee): void {
    restore.mutate(employee.id, {
      onSuccess: () => {
        toast.success(`Restored ${employee.fullName}.`);
      },
      onError: (error) => {
        toast.error(appErrorMessage(error));
      },
    });
  }

  // ── table ──────────────────────────────────────────────────────────────────────────────────
  const columns: readonly DataTableColumn<Employee>[] = [
    {
      id: 'select',
      header: (
        <Checkbox
          aria-label="Select all on this page"
          checked={
            pageIds.length > 0 && selectedOnPage === pageIds.length
              ? true
              : selectedOnPage > 0
                ? 'indeterminate'
                : false
          }
          disabled={pageIds.length === 0}
          onCheckedChange={(checked) => {
            togglePage(checked === true);
          }}
        />
      ),
      cell: (e) => (
        <Checkbox
          aria-label={`Select ${e.fullName}`}
          checked={selectedIds.has(e.id)}
          onCheckedChange={(checked) => {
            toggleOne(e.id, checked === true);
          }}
        />
      ),
      className: 'w-10',
    },
    { id: 'employeeNumber', header: 'Employee ID', cell: (e) => e.employeeNumber, sortable: true },
    {
      id: 'fullName',
      header: 'Complete name',
      sortable: true,
      isRowHeader: true,
      cell: (e) => (
        <Link
          to={`/employees/${e.id}`}
          className="rounded-sm font-medium text-fg underline-offset-4 hover:text-primary hover:underline"
        >
          {e.fullName}
        </Link>
      ),
    },
    {
      id: 'position',
      header: 'Position',
      cell: (e) => e.position,
      sortable: true,
      priority: 'low',
    },
    { id: 'department', header: 'Location', cell: (e) => e.department ?? '—', priority: 'low' },
    {
      id: 'status',
      header: 'Employment status',
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge>{e.employmentStatus}</StatusBadge>
          {e.isArchived ? <StatusBadge tone="warning">Archived</StatusBadge> : null}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (e) => (
        <EmployeeActionsMenu
          employee={e}
          onEdit={(employee) => {
            openForm(employee);
          }}
          onArchive={setArchiveTarget}
          onRestore={restoreEmployee}
        />
      ),
    },
  ];

  const tableSort: SortState = { columnId: sort.key, direction: sort.direction };
  function onSortChange(next: SortState | null): void {
    // Third click clears the sort back to the default (name, A–Z).
    const resolved =
      next === null
        ? DEFAULT_SORT
        : { key: next.columnId as EmployeeSortKey, direction: next.direction };
    updateParams({
      sort: resolved.key === DEFAULT_SORT.key && resolved.direction === 'asc' ? null : resolved.key,
      dir: resolved.direction === 'asc' ? null : 'desc',
    });
  }

  const noEmployeesYet = all?.length === 0;
  const empty = noEmployeesYet ? (
    <EmptyState
      icon={Users}
      title="No employees yet"
      description="Add your first employee to start tracking leave."
      action={
        <Button
          onClick={() => {
            openForm(null);
          }}
        >
          <Plus aria-hidden="true" />
          Add employee
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Users}
      title="No employees match your filters."
      action={
        hasFilters ? (
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : undefined
      }
    />
  );

  const loadError = employeesQuery.isError
    ? {
        message: appErrorMessage(employeesQuery.error),
        code: errorCodeLabel(employeesQuery.error),
        onRetry: () => void employeesQuery.refetch(),
      }
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Employees"
        description="Manage employee records, search and archive."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setImportOpen(true);
              }}
            >
              <Upload aria-hidden="true" />
              Import
            </Button>
            <Button
              variant="secondary"
              disabled={all === undefined}
              onClick={() => {
                setExportOpen(true);
              }}
            >
              <Download aria-hidden="true" />
              Export
            </Button>
            <Button
              onClick={() => {
                openForm(null);
              }}
            >
              <Plus aria-hidden="true" />
              Add employee
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          label="Search employees"
          placeholder="Search by name or employee ID"
          value={searchText}
          onChange={setSearchText}
          className="lg:w-80"
        />
        <FilterDropdown
          label="Status"
          allLabel="All statuses"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            updateParams({ status: value }, { resetPage: true });
          }}
        />
        <SegmentedControl<ArchiveFilter>
          label="Show employees"
          value={archiveFilter}
          options={ARCHIVE_OPTIONS}
          onChange={(value) => {
            updateParams({ archived: value === 'active' ? null : value }, { resetPage: true });
          }}
        />
        <p role="status" className="text-sm text-fg-muted tabular-nums lg:ml-auto">
          {all === undefined
            ? ''
            : `${String(page.total)} ${page.total === 1 ? 'employee' : 'employees'}`}
        </p>
      </div>

      {selectedEmployees.length > 0 ? (
        <EmployeeBulkBar
          selected={selectedEmployees}
          matchingCount={filtered.length}
          allMatchingSelected={selectedEmployees.length === filtered.length}
          onSelectAllMatching={() => {
            updateSelection(new Set(filtered.map((e) => e.id)));
          }}
          onClear={() => {
            updateSelection(new Set());
          }}
          onDone={(finishedIds) => {
            const next = new Set(selectedIds);
            for (const id of finishedIds) next.delete(id);
            updateSelection(next);
          }}
        />
      ) : null}
      <DataTable
        caption="Employees"
        columns={columns}
        rows={page.items}
        getRowId={(e) => e.id}
        loading={employeesQuery.isPending}
        error={loadError}
        empty={empty}
        sort={tableSort}
        onSortChange={onSortChange}
        onRowClick={(e) => {
          void navigate(`/employees/${e.id}`);
        }}
        stickyFirstColumn
      />
      {all !== undefined && !loadError ? (
        <div className="mt-2 rounded-card border bg-surface shadow-card">
          <Pagination
            mode="pages"
            page={page.page}
            pageSize={pageSize}
            total={page.total}
            onPageChange={(next) => {
              updateParams({ page: next === 1 ? null : String(next) });
            }}
            onPageSizeChange={(size) => {
              updateParams(
                { size: size === DEFAULT_EMPLOYEE_PAGE_SIZE ? null : String(size) },
                { resetPage: true },
              );
            }}
          />
        </div>
      ) : null}

      <EmployeeImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <EmployeeExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        currentView={filtered}
        everyone={everyone}
      />

      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={formEmployee} />

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title={`Archive ${archiveTarget?.fullName ?? 'employee'}?`}
        description="Their leave history is kept and appears in reports, but they won't be available when allocating days or recording leave. You can restore them at any time."
        confirmLabel="Archive employee"
        onConfirm={confirmArchive}
      />
    </PageContainer>
  );
}
