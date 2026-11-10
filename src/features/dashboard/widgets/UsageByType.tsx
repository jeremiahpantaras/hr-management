import { ProgressBar } from '@/components/data/ProgressBar';
import { StatusBadge } from '@/components/data/StatusBadge';
import { formatDays } from '@/domain/days';
import { useLeaveTypes } from '@/features/leave-types/hooks/useLeaveTypes';
import { useYearBalances } from '@/features/leave-credits/hooks/useBalances';
import { sumTotals } from '@/domain/summary';
import { WidgetCard } from '@/features/dashboard/widgets/WidgetCard';

/** Leave usage by type (UI spec §6.4): credits, used and available, as CSS progress bars (R-05). */
export function UsageByType({ year }: { readonly year: number }) {
  const types = useLeaveTypes();
  const balances = useYearBalances(year);

  // Per leave type, from the year's balances. Active types always; inactive ones only when they
  // hold credits that year (BR-LT-02).
  const rows = (types.data ?? [])
    .map((leaveType) => ({
      leaveType,
      aggregate: sumTotals((balances.data ?? []).filter((b) => b.leaveTypeId === leaveType.id)),
    }))
    .filter((row) => row.leaveType.isActive || row.aggregate.totalCredits > 0);
  const loading = types.isPending || balances.isPending;

  return (
    <WidgetCard
      title="Leave usage by type"
      loading={loading}
      error={types.isError ? types.error : balances.isError ? balances.error : null}
      onRetry={() => {
        void types.refetch();
        void balances.refetch();
      }}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">No leave types yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map(({ leaveType, aggregate }) => {
            const credits = aggregate.totalCredits;
            const used = aggregate.totalUsed;
            return (
              <li key={leaveType.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    {leaveType.name}
                    {leaveType.isActive ? null : <StatusBadge>Inactive</StatusBadge>}
                  </span>
                  <span className="text-fg-muted tabular-nums">
                    {formatDays(used)} / {formatDays(credits)} used · {formatDays(credits - used)}{' '}
                    left
                  </span>
                </div>
                <ProgressBar value={used} max={credits} label={`${leaveType.name} used`} />
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
