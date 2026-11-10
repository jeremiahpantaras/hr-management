import { History } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import { effectLabel, isReversible } from '@/domain/ledgerDisplay';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { flattenLedger, useLedgerList } from '@/features/leave-history/hooks/useLedger';
import { LedgerStatus } from '@/features/leave-history/LedgerBadges';
import type { LeaveTransaction } from '@/types/models';
import { formatTimestamp } from '@/utils/format';

interface AllocationHistoryProps {
  readonly year: number;
  readonly onAllocate: () => void;
  readonly onReverse: (entry: LeaveTransaction) => void;
}

/** Leave Credits → Allocation history (UI spec §6.7): the year's ALLOCATION entries, newest first. */
export function AllocationHistory({ year, onAllocate, onReverse }: AllocationHistoryProps) {
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const employees = useEmployees();

  const query = useLedgerList({
    year,
    transactionType: 'ALLOCATION',
    ...(employeeId ? { employeeId } : {}),
  });
  const rows = useMemo(() => flattenLedger(query.data), [query.data]);
  const hasFilters = employeeId !== null;

  const columns: readonly DataTableColumn<LeaveTransaction>[] = [
    {
      id: 'recorded',
      header: 'Date recorded',
      cell: (e) => (e.createdAt ? formatTimestamp(e.createdAt) : '—'),
    },
    { id: 'employee', header: 'Employee', isRowHeader: true, cell: (e) => e.employeeNameSnapshot },
    {
      id: 'credits',
      header: 'Credits added',
      align: 'right',
      cell: (e) => <span className="tabular-nums">{effectLabel(e)}</span>,
    },
    { id: 'remarks', header: 'Remarks', priority: 'low', cell: (e) => e.remarks ?? '—' },
    { id: 'by', header: 'Recorded by', priority: 'low', cell: (e) => e.createdByName },
    { id: 'status', header: 'Status', cell: (e) => <LedgerStatus entry={e} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (e) =>
        isReversible(e) ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Reverse allocation for ${e.employeeNameSnapshot}`}
            onClick={() => {
              onReverse(e);
            }}
          >
            Reverse…
          </Button>
        ) : null,
    },
  ];

  const error = query.isError
    ? {
        message: appErrorMessage(query.error),
        code: errorCodeLabel(query.error),
        onRetry: () => void query.refetch(),
      }
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <EmployeeCombobox
            employees={employees.data ?? []}
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="All employees"
            loading={employees.isPending}
            aria-label="Filter by employee"
          />
        </div>
        {hasFilters ? (
          <Button
            variant="ghost"
            onClick={() => {
              setEmployeeId(null);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
      <div className="rounded-card border bg-surface shadow-card">
        <DataTable
          caption={`Allocation history ${String(year)}`}
          columns={columns}
          rows={rows}
          getRowId={(e) => e.id}
          loading={query.isPending}
          error={error}
          empty={
            <EmptyState
              icon={History}
              title={
                hasFilters
                  ? 'No allocations match your filters.'
                  : `No credit allocations recorded for ${String(year)}.`
              }
              action={
                hasFilters ? undefined : <Button onClick={onAllocate}>Allocate credits</Button>
              }
            />
          }
        />
        {!query.isPending && !error ? (
          <Pagination
            mode="cursor"
            loadedCount={rows.length}
            hasMore={query.hasNextPage}
            loading={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
          />
        ) : null}
      </div>
    </div>
  );
}
