import { Download, History } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import type { TransactionType } from '@/domain/constants';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import { filterLoadedRows, hasLoadedRowFilters } from '@/domain/ledgerFilters';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { flattenLedger, useLedgerList } from '@/features/leave-history/hooks/useLedger';
import { LedgerDetailSheet } from '@/features/leave-history/LedgerDetailSheet';
import { EMPTY_FILTERS, type LedgerFilterState } from '@/features/leave-history/ledgerFilterState';
import { LedgerExportDialog } from '@/features/leave-history/LedgerExportDialog';
import { LedgerFilters } from '@/features/leave-history/LedgerFilters';
import { LedgerTable } from '@/features/leave-history/LedgerTable';
import { ReverseDialog } from '@/features/leave-history/ReverseDialog';
import type { LeaveTransaction } from '@/types/models';

interface LedgerListProps {
  readonly year: number;
  readonly variant: 'usage' | 'history';
  /** Fixed server filter (Leave Usage always shows USAGE entries). */
  readonly fixedType?: TransactionType;
  /** Scope the list to one employee (the employee page); the employee filter is then hidden. */
  readonly lockedEmployeeId?: string;
  readonly caption: string;
  readonly emptyTitle: string;
  readonly emptyAction?: { readonly label: string; readonly onClick: () => void };
  /** Called after a reversal so the page can start the reverse-and-re-enter flow (BR-COR-06). */
  readonly onReversed?: (entry: LeaveTransaction, thenReEnter: boolean) => void;
}

/**
 * Filters + table + cursor pagination + detail sheet + reverse dialog (UI spec §6.9, §6.11).
 * Employee and entry type filter on the server; text search and the leave-date range
 * apply to the rows loaded so far — the page says so and offers "Load all" (DB §8.5).
 */
export function LedgerList({
  year,
  variant,
  fixedType,
  lockedEmployeeId,
  caption,
  emptyTitle,
  emptyAction,
  onReversed,
}: LedgerListProps) {
  const [filters, setFilters] = useState<LedgerFilterState>(EMPTY_FILTERS);
  const employees = useEmployees();

  const serverType = fixedType ?? (filters.transactionType as TransactionType | '');
  const query = useLedgerList({
    year,
    ...(lockedEmployeeId
      ? { employeeId: lockedEmployeeId }
      : filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
    ...(serverType ? { transactionType: serverType } : {}),
  });
  const loaded = useMemo(() => flattenLedger(query.data), [query.data]);
  const clientFilters = useMemo(
    () => ({ text: filters.text, dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
    [filters.text, filters.dateFrom, filters.dateTo],
  );
  const rows = useMemo(() => filterLoadedRows(loaded, clientFilters), [loaded, clientFilters]);
  const searching = hasLoadedRowFilters(clientFilters);
  const anyFilter = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const [loadingAll, setLoadingAll] = useState(false);
  async function loadAll(): Promise<void> {
    setLoadingAll(true);
    try {
      let more = query.hasNextPage;
      while (more) {
        const result = await query.fetchNextPage();
        if (result.isError) break;
        more = result.hasNextPage;
      }
    } finally {
      setLoadingAll(false);
    }
  }

  const [detail, setDetail] = useState<LeaveTransaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<LeaveTransaction | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const error = query.isError
    ? {
        message: appErrorMessage(query.error),
        code: errorCodeLabel(query.error),
        onRetry: () => void query.refetch(),
      }
    : null;

  return (
    <div className="flex flex-col gap-3">
      {variant === 'history' ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            disabled={query.isPending || query.isError}
            onClick={() => {
              setExportOpen(true);
            }}
          >
            <Download aria-hidden="true" />
            Export
          </Button>
        </div>
      ) : null}
      <LedgerFilters
        value={filters}
        onChange={setFilters}
        employees={employees.data ?? []}
        employeesLoading={employees.isPending}
        showTypeFilter={variant === 'history'}
        hideEmployeeFilter={lockedEmployeeId !== undefined}
      />

      {searching ? (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          Searching loaded rows only.
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              size="sm"
              loading={loadingAll}
              onClick={() => void loadAll()}
            >
              Load all for {year}
            </Button>
          ) : (
            <span>All {String(year)} rows for these filters are loaded.</span>
          )}
        </p>
      ) : null}

      <div className="rounded-card border bg-surface shadow-card">
        <LedgerTable
          caption={caption}
          variant={variant}
          rows={rows}
          loading={query.isPending}
          error={error}
          empty={
            <EmptyState
              icon={History}
              title={anyFilter ? 'No entries match your filters.' : emptyTitle}
              action={
                !anyFilter && emptyAction ? (
                  <Button onClick={emptyAction.onClick}>{emptyAction.label}</Button>
                ) : undefined
              }
            />
          }
          onRowClick={(entry) => {
            setDetail(entry);
            setDetailOpen(true);
          }}
          onReverse={(entry) => {
            setReverseTarget(entry);
            setReverseOpen(true);
          }}
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

      <LedgerDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        entry={detail}
        employee={employees.data?.find((e) => e.id === detail?.employeeId)}
        loaded={loaded}
        onOpenEntry={setDetail}
      />
      <LedgerExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        year={year}
        filtered={anyFilter}
        filters={{
          ...(lockedEmployeeId
            ? { employeeId: lockedEmployeeId }
            : filters.employeeId
              ? { employeeId: filters.employeeId }
              : {}),
          transactionType: serverType,
          ...clientFilters,
        }}
      />
      <ReverseDialog
        open={reverseOpen}
        onOpenChange={setReverseOpen}
        entry={reverseTarget}
        onReversed={onReversed}
      />
    </div>
  );
}
