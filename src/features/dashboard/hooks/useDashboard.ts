import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { STALE_TIME_MS, type TransactionType } from '@/domain/constants';
import { listLedgerPage } from '@/services/leaveLedger.service';
import type { LeaveTransaction } from '@/types/models';

/**
 * Dashboard queries (DB design §8.7). Keys live under `['dashboard']`, which every ledger write
 * invalidates (Architecture §6.4). The year's totals, per-type usage and low balances are NOT separate
 * queries: they are computed in the browser from the year's balance documents (one plain
 * `year ==` read, shared with the Reports page). Firestore's `sum()` aggregation needs a composite
 * index that only production enforces — the first real run hit exactly that (HTTP 400) — and DB §8.7
 * documents this as the fallback ("the domain function is the same either way", D-09).
 */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  recent: (year: number, type: TransactionType | 'ALL') =>
    ['dashboard', 'recent', year, type] as const,
};

export function useRecentTransactions(
  year: number,
  type: TransactionType | 'ALL',
  size = 8,
): UseQueryResult<readonly LeaveTransaction[], Error> {
  return useQuery({
    queryKey: dashboardKeys.recent(year, type),
    queryFn: async () => {
      const page = await listLedgerPage({
        year,
        pageSize: size,
        ...(type === 'ALL' ? {} : { transactionType: type }),
      });
      return page.items;
    },
    staleTime: STALE_TIME_MS.dashboard,
  });
}
