import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { YearSelect } from '@/components/data/YearSelect';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { sumTotals } from '@/domain/summary';
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboard';
import { BalanceOverview } from '@/features/dashboard/widgets/BalanceOverview';
import { LowBalances } from '@/features/dashboard/widgets/LowBalances';
import { RecentAllocations } from '@/features/dashboard/widgets/RecentAllocations';
import { RecentTransactions } from '@/features/dashboard/widgets/RecentTransactions';
import { StatCards } from '@/features/dashboard/widgets/StatCards';
import { employeeKeys } from '@/features/employees/hooks/useEmployees';
import { AllocationDialog } from '@/features/leave-credits/AllocationDialog';
import { balanceKeys, useYearBalances } from '@/features/leave-credits/hooks/useBalances';
import { useYearParam } from '@/hooks/useYearParam';

/** Dashboard (UI spec §6.4, FR-DASH-01…08): the selected year's figures, one widget per concern. */
export function DashboardPage() {
  const [year, setYear] = useYearParam();
  const queryClient = useQueryClient();
  const [allocateOpen, setAllocateOpen] = useState(false);
  const balances = useYearBalances(year);
  const noCredits = balances.isSuccess && sumTotals(balances.data).totalCredits === 0;

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    void queryClient.invalidateQueries({ queryKey: balanceKeys.all });
    void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Leave overview for the selected year."
        actions={
          <>
            <YearSelect value={year} onChange={setYear} />
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-fg-muted">
        Leave figures for {year} · includes archived employees&apos; records
      </p>

      <div className="flex flex-col gap-6">
        <StatCards year={year} />

        {noCredits ? (
          <Card>
            <EmptyState
              title={`No leave credits have been allocated for ${String(year)}.`}
              description="Allocate credits to employees to start tracking leave."
              action={
                <Button
                  onClick={() => {
                    setAllocateOpen(true);
                  }}
                >
                  <Plus aria-hidden="true" />
                  Allocate credits
                </Button>
              }
            />
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <LowBalances year={year} />
          <RecentAllocations year={year} />
        </div>
        <RecentTransactions year={year} />
        <BalanceOverview year={year} />
      </div>

      <AllocationDialog open={allocateOpen} onOpenChange={setAllocateOpen} year={year} />
    </PageContainer>
  );
}
