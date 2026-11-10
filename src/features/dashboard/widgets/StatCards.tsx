import { CalendarCheck, CalendarMinus, CalendarPlus, UserCheck, Users } from 'lucide-react';

import { StatCard } from '@/components/data/StatCard';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Card } from '@/components/ui/card';
import { formatDays } from '@/domain/days';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { useYearBalances } from '@/features/leave-credits/hooks/useBalances';
import { sumTotals } from '@/domain/summary';

/**
 * The five headline figures (UI spec §6.4). Employee counts come from the cached list; the three
 * credit figures are summed from the selected year's balances (BR-CALC-03).
 */
export function StatCards({ year }: { readonly year: number }) {
  const employees = useEmployees();
  const aggregate = useYearBalances(year);

  const total = employees.data?.length ?? 0;
  const active = (employees.data ?? []).filter((e) => !e.isArchived).length;
  const totals = sumTotals(aggregate.data ?? []); // BR-CALC-04: the one summing function
  const credits = totals.totalCredits;
  const used = totals.totalUsed;
  const unused = credits - used; // BR-CALC-02
  const usedPercent = credits > 0 ? Math.round((used / credits) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {employees.isError || aggregate.isError ? (
        <Card>
          <ErrorState
            message={appErrorMessage(employees.isError ? employees.error : aggregate.error)}
            code={errorCodeLabel(employees.isError ? employees.error : aggregate.error)}
            onRetry={() => {
              void employees.refetch();
              void aggregate.refetch();
            }}
          />
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Employees"
          icon={Users}
          value={String(total)}
          caption="All records"
          loading={employees.isPending}
        />
        <StatCard
          label="Active Employees"
          icon={UserCheck}
          value={String(active)}
          caption={`of ${String(total)} total`}
          loading={employees.isPending}
        />
        <StatCard
          label="Total Days"
          icon={CalendarPlus}
          value={formatDays(credits)}
          caption={String(year)}
          loading={aggregate.isPending}
        />
        <StatCard
          label="Total Used"
          icon={CalendarMinus}
          value={formatDays(used)}
          caption={credits > 0 ? `${String(usedPercent)}% of days` : String(year)}
          progress={{ value: used, max: credits, label: 'Share of days used' }}
          loading={aggregate.isPending}
        />
        <StatCard
          label="Total Unused"
          icon={CalendarCheck}
          value={formatDays(unused)}
          caption={String(year)}
          loading={aggregate.isPending}
        />
      </div>
    </div>
  );
}
