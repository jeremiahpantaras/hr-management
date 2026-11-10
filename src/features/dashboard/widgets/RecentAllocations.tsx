import { effectLabel } from '@/domain/ledgerDisplay';
import { useRecentTransactions } from '@/features/dashboard/hooks/useDashboard';
import { WidgetCard } from '@/features/dashboard/widgets/WidgetCard';
import { formatTimestamp } from '@/utils/format';

/** The 8 newest credit allocations of the year (UI spec §6.4, FR-DASH-04). */
export function RecentAllocations({ year }: { readonly year: number }) {
  const query = useRecentTransactions(year, 'ALLOCATION');
  const rows = query.data ?? [];
  return (
    <WidgetCard
      title="Recent credit allocations"
      viewAll={{ to: `/leave-credits?tab=history&year=${String(year)}`, label: 'View all' }}
      loading={query.isPending}
      error={query.isError ? query.error : null}
      onRetry={() => void query.refetch()}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">No credit allocations recorded for {year}.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-fg">{entry.employeeNameSnapshot}</span>
                <span className="truncate text-caption text-fg-muted">
                  {entry.leaveTypeNameSnapshot} · by {entry.createdByName}
                  {entry.createdAt ? ` · ${formatTimestamp(entry.createdAt)}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-fg tabular-nums">{effectLabel(entry)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
