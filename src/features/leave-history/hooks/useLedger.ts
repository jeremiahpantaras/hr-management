import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { STALE_TIME_MS, type TransactionType } from '@/domain/constants';
import { AppError } from '@/domain/errors';
import { useAuth } from '@/features/auth/useAuth';
import {
  findUsageForOverlap,
  getLedgerYear,
  listLedgerPage,
  recordAllocation,
  recordUsage,
  reverseEntry,
  type AllocationRequest,
  type LedgerCursor,
  type LedgerPage,
  type LedgerResult,
  type UsageRequest,
} from '@/services/leaveLedger.service';
import type { Actor, LeaveTransaction } from '@/types/models';

/**
 * Ledger and balance query keys (Architecture §6.2). A successful ledger write invalidates the
 * three prefixes that can show its effect: balances, ledger lists and the dashboard (§6.4).
 */
export const ledgerKeys = {
  all: ['ledger'] as const,
  list: (filters: LedgerFilters) => ['ledger', 'list', filters] as const,
  year: (year: number, employeeId?: string) =>
    ['ledger', 'year', year, employeeId ?? null] as const,
  usage: (employeeId: string, year: number) => ['ledger', 'usage', employeeId, year] as const,
};
export const balanceKeysRoot = ['balances'] as const;
export const dashboardKeysRoot = ['dashboard'] as const;

export interface LedgerFilters {
  readonly year: number;
  readonly employeeId?: string;
  readonly transactionType?: TransactionType;
}

/** The signed-in user as a ledger actor ("Recorded by" snapshot). Throws if there is none. */
export function useActor(): Actor | null {
  const { user, profile } = useAuth();
  return user && profile ? { uid: user.uid, name: profile.fullName } : null;
}

function requireActor(actor: Actor | null): Actor {
  if (actor === null) throw new AppError('PERMISSION_DENIED');
  return actor;
}

/** Cursor-paged ledger list, newest first, filtered on the server (DB §8.5). */
export function useLedgerList(
  filters: LedgerFilters,
  options: { enabled?: boolean } = {},
): UseInfiniteQueryResult<InfiniteData<LedgerPage, LedgerCursor | null>, Error> {
  return useInfiniteQuery({
    queryKey: ledgerKeys.list(filters),
    queryFn: ({ pageParam }) => listLedgerPage({ ...filters, cursor: pageParam }),
    initialPageParam: null as LedgerCursor | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    staleTime: STALE_TIME_MS.ledger,
    enabled: options.enabled ?? true,
  });
}

/** Flattens loaded pages into one list. */
export function flattenLedger(
  data: InfiniteData<LedgerPage, LedgerCursor | null> | undefined,
): LeaveTransaction[] {
  return data ? data.pages.flatMap((page) => [...page.items]) : [];
}

/** The employee's USAGE entries for a year (overlap warning). */
export function useUsageForOverlap(
  employeeId: string | null,
  year: number,
): UseQueryResult<LeaveTransaction[], Error> {
  return useQuery({
    queryKey: ledgerKeys.usage(employeeId ?? '', year),
    queryFn: () => findUsageForOverlap(employeeId ?? '', year),
    enabled: employeeId !== null && employeeId !== '',
    staleTime: 0, // always re-check at submit time
  });
}

/** The whole year's ledger (reports; "Load all"). */
export function useLedgerYear(year: number, employeeId?: string, enabled = true) {
  return useQuery({
    queryKey: ledgerKeys.year(year, employeeId),
    queryFn: () => getLedgerYear(year, employeeId),
    staleTime: STALE_TIME_MS.ledger,
    enabled,
  });
}

function useInvalidateLedgerEffects() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: balanceKeysRoot }),
      queryClient.invalidateQueries({ queryKey: ledgerKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardKeysRoot }),
    ]);
  };
}

export type AllocationVariables = Omit<AllocationRequest, 'actor'>;
export type UsageVariables = Omit<UsageRequest, 'actor'>;

export function useRecordAllocation(): UseMutationResult<LedgerResult, Error, AllocationVariables> {
  const actor = useActor();
  const invalidate = useInvalidateLedgerEffects();
  return useMutation({
    mutationFn: (variables: AllocationVariables) =>
      recordAllocation({ ...variables, actor: requireActor(actor) }),
    onSuccess: invalidate,
  });
}

export function useRecordUsage(): UseMutationResult<LedgerResult, Error, UsageVariables> {
  const actor = useActor();
  const invalidate = useInvalidateLedgerEffects();
  return useMutation({
    mutationFn: (variables: UsageVariables) =>
      recordUsage({ ...variables, actor: requireActor(actor) }),
    onSuccess: invalidate,
  });
}

export function useReverseEntry(): UseMutationResult<
  LedgerResult,
  Error,
  { readonly originalTransactionId: string; readonly reason: string }
> {
  const actor = useActor();
  const invalidate = useInvalidateLedgerEffects();
  return useMutation({
    mutationFn: (variables: { originalTransactionId: string; reason: string }) =>
      reverseEntry({ ...variables, actor: requireActor(actor) }),
    onSuccess: invalidate,
  });
}
