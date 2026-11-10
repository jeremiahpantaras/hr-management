import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { STALE_TIME_MS } from '@/domain/constants';
import {
  getBalance,
  getBalancesForEmployeeYear,
  getBalancesForEmployees,
  getYearBalances,
} from '@/services/leaveBalances.service';
import type { LeaveBalance } from '@/types/models';

/** Balance query keys (Architecture §6.2). Balances are fresh for 60 s (README §4). */
export const balanceKeys = {
  all: ['balances'] as const,
  one: (employeeId: string, year: number) => ['balances', 'one', employeeId, year] as const,
  employeeYear: (employeeId: string, year: number) =>
    ['balances', 'employee', employeeId, year] as const,
  forEmployees: (ids: readonly string[], year: number) =>
    ['balances', 'page', year, [...ids].sort().join(',')] as const,
  year: (year: number) => ['balances', 'year', year] as const,
};

export function useBalance(
  employeeId: string | null,
  year: number,
): UseQueryResult<LeaveBalance | null, Error> {
  return useQuery({
    queryKey: balanceKeys.one(employeeId ?? '', year),
    queryFn: () => getBalance(employeeId ?? '', year),
    enabled: Boolean(employeeId),
    staleTime: 0, // the allocation preview must show the current balance
  });
}

export function useEmployeeYearBalances(
  employeeId: string,
  year: number,
): UseQueryResult<LeaveBalance[], Error> {
  return useQuery({
    queryKey: balanceKeys.employeeYear(employeeId, year),
    queryFn: () => getBalancesForEmployeeYear(employeeId, year),
    staleTime: STALE_TIME_MS.balances,
  });
}

/** Balances for one page of employees (≤ 25, within the `in` limit chunking anyway). */
export function useBalancesForEmployees(
  employeeIds: readonly string[],
  year: number,
): UseQueryResult<LeaveBalance[], Error> {
  return useQuery({
    queryKey: balanceKeys.forEmployees(employeeIds, year),
    queryFn: () => getBalancesForEmployees(employeeIds, year),
    enabled: employeeIds.length > 0,
    staleTime: STALE_TIME_MS.balances,
  });
}

export function useYearBalances(
  year: number,
  enabled = true,
): UseQueryResult<LeaveBalance[], Error> {
  return useQuery({
    queryKey: balanceKeys.year(year),
    queryFn: () => getYearBalances(year),
    staleTime: STALE_TIME_MS.balances,
    enabled,
  });
}
