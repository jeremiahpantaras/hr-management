import type { ReactNode } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { Button } from '@/components/ui/button';
import { formatDays } from '@/domain/days';
import { effectLabel, isReversible } from '@/domain/ledgerDisplay';
import { LedgerStatus, TransactionTypeBadge } from '@/features/leave-history/LedgerBadges';
import type { LeaveTransaction } from '@/types/models';
import { formatDateRange, formatTimestamp } from '@/utils/format';

interface LedgerTableProps {
  readonly caption: string;
  readonly rows: readonly LeaveTransaction[];
  /** `usage` hides the type column (every row is a usage); `history` shows all entry kinds. */
  readonly variant: 'usage' | 'history';
  readonly loading: boolean;
  readonly error?: { message: string; code?: string; onRetry?: () => void } | null;
  readonly empty: ReactNode;
  readonly onRowClick: (entry: LeaveTransaction) => void;
  readonly onReverse: (entry: LeaveTransaction) => void;
}

/** The ledger list shared by Leave Usage and Leave History (UI spec §6.9, §6.11). */
export function LedgerTable({
  caption,
  rows,
  variant,
  loading,
  error = null,
  empty,
  onRowClick,
  onReverse,
}: LedgerTableProps) {
  const columns: DataTableColumn<LeaveTransaction>[] = [
    {
      id: 'recorded',
      header: 'Date recorded',
      cell: (e) => (e.createdAt ? formatTimestamp(e.createdAt) : '—'),
    },
    {
      id: 'employee',
      header: 'Employee',
      isRowHeader: true,
      cell: (e) => (
        <span className={e.reversedByTransactionId ? 'text-fg-muted line-through' : undefined}>
          {e.employeeNameSnapshot}
        </span>
      ),
    },
  ];
  if (variant === 'history') {
    columns.push({ id: 'type', header: 'Type', cell: (e) => <TransactionTypeBadge entry={e} /> });
  }
  columns.push({
    id: 'dates',
    header: variant === 'usage' ? 'Leave dates' : 'Leave date(s)',
    cell: (e) => (e.dateFrom && e.dateTo ? formatDateRange(e.dateFrom, e.dateTo) : '—'),
  });
  columns.push({
    id: 'days',
    header: 'Days',
    align: 'right',
    cell: (e) => <span className="tabular-nums">{formatDays(e.days)}</span>,
  });
  if (variant === 'history') {
    columns.push(
      {
        id: 'effect',
        header: 'Effect on balance',
        priority: 'low',
        cell: (e) => <span className="tabular-nums">{effectLabel(e)}</span>,
      },
      {
        // What the employee had left for that year right after this entry was recorded.
        id: 'remaining',
        header: 'Remaining days',
        align: 'right',
        cell: (e) => (
          <span className="tabular-nums">
            {formatDays(e.resultingTotalCredits - e.resultingTotalUsed)}
          </span>
        ),
      },
    );
  }
  columns.push(
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
            aria-label={`Reverse ${e.transactionType.toLowerCase()} for ${e.employeeNameSnapshot}`}
            onClick={() => {
              onReverse(e);
            }}
          >
            Reverse…
          </Button>
        ) : null,
    },
  );

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(e) => e.id}
      loading={loading}
      error={error}
      empty={empty}
      onRowClick={onRowClick}
    />
  );
}
