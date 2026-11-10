import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext, type AuthContextValue } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import {
  employeeKeys,
  useArchiveEmployee,
  useCreateEmployee,
  useEmployee,
  useEmployeeOptions,
  useEmployees,
  useRestoreEmployee,
  useUpdateEmployee,
} from '@/features/employees/hooks/useEmployees';
import * as service from '@/services/employees.service';
import type { Employee } from '@/types/models';

vi.mock('@/services/employees.service');

const make = (id: string, name: string, archived = false): Employee => ({
  id,
  employeeNumber: id.toUpperCase(),
  employeeNumberKey: id.toUpperCase(),
  fullName: name,
  position: 'Staff',
  department: null,
  employmentStatus: 'Regular',
  isArchived: archived,
  archivedAt: null,
  archivedBy: null,
  createdAt: null,
  createdBy: 'hr1',
  updatedAt: null,
  updatedBy: 'hr1',
});
const zed = make('e3', 'Zed Last');
const ana = make('e1', 'Ana First');
const old = make('e2', 'Mid Archived', true);

let queryClient: QueryClient;
function wrapper(auth: Partial<AuthContextValue> = SIGNED_IN_VALUE) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={makeAuthValue(auth)}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}

const input = {
  employeeNumber: 'EMP-1',
  fullName: 'X',
  position: 'Y',
  department: null,
  employmentStatus: 'Regular',
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(service.listEmployees).mockResolvedValue([zed, old, ana]);
  vi.mocked(service.getEmployee).mockResolvedValue(ana);
  vi.mocked(service.createEmployee).mockResolvedValue('new');
  vi.mocked(service.updateEmployee).mockResolvedValue(undefined);
  vi.mocked(service.archiveEmployee).mockResolvedValue(undefined);
  vi.mocked(service.restoreEmployee).mockResolvedValue(undefined);
});

describe('queries', () => {
  it('useEmployees caches the whole directory under one key', async () => {
    const { result } = renderHook(() => useEmployees(), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toHaveLength(3);
    expect(queryClient.getQueryData(employeeKeys.all)).toHaveLength(3);
    expect(service.listEmployees).toHaveBeenCalledTimes(1);
  });

  it('useEmployee reads from the list cache without another request', async () => {
    const w = wrapper();
    const list = renderHook(() => useEmployees(), { wrapper: w });
    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });

    const one = renderHook(() => useEmployee('e1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
            {children}
          </AuthContext.Provider>
        </QueryClientProvider>
      ),
    });
    expect(one.result.current.data).toMatchObject({ id: 'e1', fullName: 'Ana First' });
    expect(service.getEmployee).not.toHaveBeenCalled();
  });

  it('useEmployee fetches when it is not cached, and reports a missing record as null', async () => {
    vi.mocked(service.getEmployee).mockResolvedValue(null);
    const { result } = renderHook(() => useEmployee('ghost'), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBeNull();
    expect(service.getEmployee).toHaveBeenCalledWith('ghost');
  });
});

describe('employee pickers (BR-EMP-04, TC-EMP-12)', () => {
  it('exclude archived employees by default and sort by name', async () => {
    const { result } = renderHook(() => useEmployeeOptions(), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.employees.map((e) => e.fullName)).toEqual(['Ana First', 'Zed Last']);
  });

  it('can include archived employees on request (e.g. report filters)', async () => {
    const { result } = renderHook(() => useEmployeeOptions({ includeArchived: true }), {
      wrapper: wrapper(),
    });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.employees.map((e) => e.fullName)).toEqual([
      'Ana First',
      'Mid Archived',
      'Zed Last',
    ]);
  });

  it('are empty while loading', () => {
    vi.mocked(service.listEmployees).mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useEmployeeOptions(), { wrapper: wrapper() });
    expect(result.current.employees).toEqual([]);
    expect(result.current.isPending).toBe(true);
  });
});

describe('mutations stamp the signed-in user and refresh the cache', () => {
  it.each([
    [
      'create',
      () => useCreateEmployee(),
      (m: ReturnType<typeof useCreateEmployee>) => m.mutateAsync(input),
      () => expect(service.createEmployee).toHaveBeenCalledWith(input, 'hr1'),
    ],
    [
      'update',
      () => useUpdateEmployee(),
      (m: ReturnType<typeof useUpdateEmployee>) => m.mutateAsync({ employeeId: 'e1', input }),
      () => expect(service.updateEmployee).toHaveBeenCalledWith('e1', input, 'hr1'),
    ],
    [
      'archive',
      () => useArchiveEmployee(),
      (m: ReturnType<typeof useArchiveEmployee>) => m.mutateAsync('e1'),
      () => expect(service.archiveEmployee).toHaveBeenCalledWith('e1', 'hr1'),
    ],
    [
      'restore',
      () => useRestoreEmployee(),
      (m: ReturnType<typeof useRestoreEmployee>) => m.mutateAsync('e1'),
      () => expect(service.restoreEmployee).toHaveBeenCalledWith('e1', 'hr1'),
    ],
  ] as const)('%s', async (_name, useHook, run, assertCall) => {
    const w = wrapper();
    const list = renderHook(() => useEmployees(), { wrapper: w });
    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });
    const hook = renderHook(() => useHook() as never, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
            {children}
          </AuthContext.Provider>
        </QueryClientProvider>
      ),
    });

    await act(async () => {
      await (run as (m: unknown) => Promise<unknown>)(hook.result.current);
    });

    assertCall();
    await waitFor(() => {
      expect(service.listEmployees).toHaveBeenCalledTimes(2);
    }); // invalidated → refetched
  });

  it('refuse to run without a signed-in user, and never reach the service', async () => {
    const { result } = renderHook(() => useCreateEmployee(), {
      wrapper: wrapper({ status: 'signedOut', user: null }),
    });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });
    expect(service.createEmployee).not.toHaveBeenCalled();
  });

  it('a failed mutation does NOT refresh the cache and surfaces the AppError', async () => {
    vi.mocked(service.createEmployee).mockRejectedValue(new AppError('DUPLICATE_EMPLOYEE_NUMBER'));
    const w = wrapper();
    const list = renderHook(() => useEmployees(), { wrapper: w });
    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });
    const hook = renderHook(() => useCreateEmployee(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={makeAuthValue(SIGNED_IN_VALUE)}>
            {children}
          </AuthContext.Provider>
        </QueryClientProvider>
      ),
    });
    await act(async () => {
      await expect(hook.result.current.mutateAsync(input)).rejects.toMatchObject({
        code: 'DUPLICATE_EMPLOYEE_NUMBER',
      });
    });
    expect(service.listEmployees).toHaveBeenCalledTimes(1);
  });
});
