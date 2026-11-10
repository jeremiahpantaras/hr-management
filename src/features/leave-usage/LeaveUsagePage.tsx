import { Plus } from 'lucide-react';
import { useState } from 'react';

import { YearSelect } from '@/components/data/YearSelect';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { LedgerList } from '@/features/leave-history/LedgerList';
import { RecordUsageDialog } from '@/features/leave-usage/RecordUsageDialog';
import { useReplacementFlow } from '@/features/leave-usage/useReplacementFlow';
import { useYearParam } from '@/hooks/useYearParam';

/** Leave Usage (UI spec §6.9, FR-LU-*): the year's recorded leave, and the record-usage form. */
export function LeaveUsagePage() {
  const [year, setYear] = useYearParam();
  const [recordOpen, setRecordOpen] = useState(false);
  const replacement = useReplacementFlow(year);

  function openRecord(): void {
    setRecordOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Leave Usage"
        description="Record and review leave taken by employees."
        actions={
          <>
            <YearSelect value={year} onChange={setYear} />
            <Button onClick={openRecord}>
              <Plus aria-hidden="true" />
              Record leave usage
            </Button>
          </>
        }
      />
      {replacement.node}
      <LedgerList
        year={year}
        variant="usage"
        fixedType="USAGE"
        caption={`Leave usage ${String(year)}`}
        emptyTitle={`No leave recorded for ${String(year)}.`}
        emptyAction={{ label: 'Record leave usage', onClick: openRecord }}
        onReversed={replacement.onReversed}
      />
      <RecordUsageDialog open={recordOpen} onOpenChange={setRecordOpen} year={year} />
    </PageContainer>
  );
}
