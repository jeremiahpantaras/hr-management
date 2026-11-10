import { YearSelect } from '@/components/data/YearSelect';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { LedgerList } from '@/features/leave-history/LedgerList';
import { useReplacementFlow } from '@/features/leave-usage/useReplacementFlow';
import { useYearParam } from '@/hooks/useYearParam';

/** Leave History (UI spec §6.11, FR-LU-08): the whole ledger for a year, with reversal. */
export function LeaveHistoryPage() {
  const [year, setYear] = useYearParam();
  const replacement = useReplacementFlow(year);
  return (
    <PageContainer>
      <PageHeader
        title="Leave History"
        description="Every allocation, leave usage and reversal."
        actions={<YearSelect value={year} onChange={setYear} />}
      />
      {replacement.node}
      <LedgerList
        year={year}
        variant="history"
        caption={`Leave history ${String(year)}`}
        emptyTitle={`No leave recorded for ${String(year)}.`}
        onReversed={replacement.onReversed}
      />
    </PageContainer>
  );
}
