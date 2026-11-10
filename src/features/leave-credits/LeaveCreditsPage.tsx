import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { YearSelect } from '@/components/data/YearSelect';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AllocationDialog,
  type AllocationDefaults,
} from '@/features/leave-credits/AllocationDialog';
import { AllocationHistory } from '@/features/leave-credits/AllocationHistory';
import { EditDaysDialog, type EditDaysTarget } from '@/features/leave-credits/EditDaysDialog';
import { BalancesTable } from '@/features/leave-credits/BalancesTable';
import { ReverseDialog } from '@/features/leave-history/ReverseDialog';
import { useYearParam } from '@/hooks/useYearParam';
import type { Employee, LeaveTransaction } from '@/types/models';

/** Leave Days (UI spec §6.7): year totals per employee, and the allocation history. */
export function LeaveCreditsPage() {
  const [year, setYear] = useYearParam();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'balances';

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [allocateDefaults, setAllocateDefaults] = useState<AllocationDefaults | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditDaysTarget | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<LeaveTransaction | null>(null);

  function openAllocate(employee?: Employee): void {
    setAllocateDefaults(employee ? { employeeId: employee.id } : undefined);
    setAllocateOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Leave Days"
        description="Assign and review leave days by employee and year."
        actions={
          <>
            <YearSelect value={year} onChange={setYear} />
            <Button
              onClick={() => {
                openAllocate();
              }}
            >
              <Plus aria-hidden="true" />
              Allocate days
            </Button>
          </>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-fg-muted">
        Leave days for {year} · includes archived employees&apos; records
      </p>

      <Tabs
        value={tab}
        onValueChange={(next) => {
          setParams(
            (previous) => {
              const updated = new URLSearchParams(previous);
              if (next === 'history') updated.set('tab', 'history');
              else updated.delete('tab');
              return updated;
            },
            { replace: true },
          );
        }}
      >
        <TabsList aria-label="Leave day views">
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="history">Allocation history</TabsTrigger>
        </TabsList>
        <TabsContent value="balances" className="mt-4">
          <BalancesTable
            year={year}
            onAllocate={openAllocate}
            onEdit={(target) => {
              setEditTarget(target);
              setEditOpen(true);
            }}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <AllocationHistory
            year={year}
            onAllocate={() => {
              openAllocate();
            }}
            onReverse={(entry) => {
              setReverseTarget(entry);
              setReverseOpen(true);
            }}
          />
        </TabsContent>
      </Tabs>

      <AllocationDialog
        open={allocateOpen}
        onOpenChange={setAllocateOpen}
        year={year}
        defaults={allocateDefaults}
      />
      <EditDaysDialog open={editOpen} onOpenChange={setEditOpen} year={year} target={editTarget} />
      <ReverseDialog open={reverseOpen} onOpenChange={setReverseOpen} entry={reverseTarget} />
    </PageContainer>
  );
}
