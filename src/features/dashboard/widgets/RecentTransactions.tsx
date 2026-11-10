import { effectLabel } from '@/domain/ledgerDisplay';
import { TransactionTypeBadge } from '@/features/leave-history/LedgerBadges';
import { useRecentTransactions } from '@/features/dashboard/hooks/useDashboard';
import { WidgetCard } from '@/features/dashboard/widgets/WidgetCard';
import { formatTimestamp } from '@/utils/format';

/** The 8 newest ledger entries of the year (UI spec §6.4, FR-DASH-03). */
export function RecentTransactions({ year }: { readonly year: number }) {
  const query = useRecentTransactions(year, 'ALL');
  const rows = query.data ?? [];
  return (
    <WidgetCard
      title="Recent leave transactions"
      viewAll={{ to: `/leave-history?year=${String(year)}`, label: 'View all' }}
      loading={query.isPending}
      error={query.isError ? query.error : null}
      onRetry={() => void query.refetch()}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">No leave recorded for {year}.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-fg">{entry.employeeNameSnapshot}</span>
                <span className="truncate text-caption text-fg-muted">
                  {entry.leaveTypeNameSnapshot}
                  {entry.createdAt ? ` · ${formatTimestamp(entry.createdAt)}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-fg tabular-nums">{effectLabel(entry)}</span>
                <TransactionTypeBadge entry={entry} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
