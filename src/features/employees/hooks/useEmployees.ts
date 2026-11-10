import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { STALE_TIME_MS } from '@/domain/constants';
import { selectableEmployees } from '@/domain/employeeList';
import { AppError } from '@/domain/errors';
import type { EmployeeInput } from '@/domain/schemas/employee';
import { useAuth } from '@/features/auth/useAuth';
import {
  archiveEmployee,
  createEmployee,
  archiveEmployeesBulk,
  createEmployeesBulk,
  deleteEmployeesBulk,
  findEmployeesWithLeaveRecords,
  restoreEmployeesBulk,
  type BulkActionResult,
  type BulkCreateItem,
  type BulkCreateResult,
  getEmployee,
  listEmployees,
  restoreEmployee,
  updateEmployee,
} from '@/services/employees.service';
import type { Employee } from '@/types/models';

/**
 * Query keys (Architecture §6.2). The whole directory is fetched once and cached for 5 minutes
 * (D-09); a single employee is derived from that cache when possible. Every mutation invalidates
 * the `['employees']` prefix, which covers both the list and individual records.
 */
export const employeeKeys = {
  all: ['employees'] as const,
  one: (employeeId: string) => ['employees', 'one', employeeId] as const,
};

export function useEmployees(): UseQueryResult<Employee[], Error> {
  return useQuery({
    queryKey: employeeKeys.all,
    queryFn: listEmployees,
    staleTime: STALE_TIME_MS.employees,
  });
}

/** One employee. Served from the list cache when available (no extra read), else fetched. */
export function useEmployee(employeeId: string): UseQueryResult<Employee | null, Error> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: employeeKeys.one(employeeId),
    queryFn: () => getEmployee(employeeId),
    staleTime: STALE_TIME_MS.employees,
    initialData: () =>
      queryClient.getQueryData<Employee[]>(employeeKeys.all)?.find((e) => e.id === employeeId),
    initialDataUpdatedAt: () => queryClient.getQueryState(employeeKeys.all)?.dataUpdatedAt,
  });
}

/** Options for employee pickers: archived employees are excluded by default (BR-EMP-04). */
export function useEmployeeOptions(options: { includeArchived?: boolean } = {}) {
  const query = useEmployees();
  const includeArchived = options.includeArchived === true;
  const employees = useMemo(
    () => selectableEmployees(query.data ?? [], { includeArchived }),
    [query.data, includeArchived],
  );
  return { employees, isPending: query.isPending, isError: query.isError, refetch: query.refetch };
}

/** The signed-in user's uid — required to stamp `createdBy` / `updatedBy` (rules check it). */
function useActorUid(): string {
  const { user } = useAuth();
  return user?.uid ?? '';
}

function requireActor(uid: string): string {
  if (uid === '') throw new AppError('PERMISSION_DENIED');
  return uid;
}

export function useCreateEmployee(): UseMutationResult<string, Error, EmployeeInput> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: (input: EmployeeInput) => createEmployee(input, requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useUpdateEmployee(): UseMutationResult<
  void,
  Error,
  { readonly employeeId: string; readonly input: EmployeeInput }
> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: ({ employeeId, input }) => updateEmployee(employeeId, input, requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useArchiveEmployee(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: (employeeId: string) => archiveEmployee(employeeId, requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export function useRestoreEmployee(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: (employeeId: string) => restoreEmployee(employeeId, requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

/** Bulk import: creates the given employees (a few at a time) and refreshes the directory once. */
export function useImportEmployees(): UseMutationResult<
  BulkCreateResult[],
  Error,
  {
    readonly items: readonly BulkCreateItem[];
    readonly onProgress?: (done: number, total: number) => void;
  }
> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: ({ items, onProgress }) =>
      createEmployeesBulk(items, requireActor(uid), { onProgress }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

export type BulkEmployeeAction = 'archive' | 'restore' | 'delete';

/**
 * Archive / restore / permanently delete several employees at once. The directory is refreshed once,
 * whatever the outcome, so the table never shows stale rows.
 */
export function useBulkEmployeeAction(): UseMutationResult<
  BulkActionResult[],
  Error,
  {
    readonly action: BulkEmployeeAction;
    readonly ids: readonly string[];
    readonly onProgress?: (done: number, total: number) => void;
  }
> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: ({ action, ids, onProgress }) => {
      const actor = requireActor(uid);
      if (action === 'archive') return archiveEmployeesBulk(ids, actor, { onProgress });
      if (action === 'restore') return restoreEmployeesBulk(ids, actor, { onProgress });
      return deleteEmployeesBulk(ids, { onProgress });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: employeeKeys.all }),
  });
}

/** Which of the given employees have leave records (and so cannot be deleted). */
export function useCheckDeletable(): UseMutationResult<Set<string>, Error, readonly string[]> {
  return useMutation({
    mutationFn: (ids: readonly string[]) => findEmployeesWithLeaveRecords(ids),
  });
}
