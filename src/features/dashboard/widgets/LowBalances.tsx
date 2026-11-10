import { Link } from 'react-router';

import { StatusBadge } from '@/components/data/StatusBadge';
import { LOW_BALANCE_THRESHOLD } from '@/domain/constants';
import { formatDays } from '@/domain/days';
import { lowBalances } from '@/domain/summary';
import { useYearBalances } from '@/features/leave-credits/hooks/useBalances';
import { WidgetCard } from '@/features/dashboard/widgets/WidgetCard';
import { useEmployees } from '@/features/employees/hooks/useEmployees';

const SHOWN = 10;

/**
 * Low & depleted balances (UI spec §6.4, Q-04): per employee, available ≤ threshold.
 * Computed from the year's balances; archived employees and zero-credit balances are filtered out.
 */
export function LowBalances({ year }: { readonly year: number }) {
  const candidates = useYearBalances(year);
  const employees = useEmployees();

  const activeIds = new Set((employees.data ?? []).filter((e) => !e.isArchived).map((e) => e.id));
  const rows = lowBalances(candidates.data ?? [], activeIds).slice(0, SHOWN);
  const employeeName = (id: string) => employees.data?.find((e) => e.id === id)?.fullName ?? id;

  return (
    <WidgetCard
      title="Low & depleted balances"
      loading={candidates.isPending || employees.isPending}
      error={candidates.isError ? candidates.error : employees.isError ? employees.error : null}
      onRetry={() => {
        void candidates.refetch();
        void employees.refetch();
      }}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No low balances. Everyone has more than {LOW_BALANCE_THRESHOLD} days available.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map(({ balance, status }) => (
            <li key={balance.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link
                to={`/employees/${balance.employeeId}?year=${String(year)}`}
                className="min-w-0 truncate font-medium text-fg hover:text-primary hover:underline"
              >
                {employeeName(balance.employeeId)}
              </Link>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-fg-muted tabular-nums">
                  {formatDays(balance.availableCredits)} left
                </span>
                {status === 'depleted' ? (
                  <StatusBadge tone="danger">Depleted</StatusBadge>
                ) : (
                  <StatusBadge tone="warning">Low</StatusBadge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
