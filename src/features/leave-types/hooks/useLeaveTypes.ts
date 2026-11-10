import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { STALE_TIME_MS } from '@/domain/constants';
import { AppError } from '@/domain/errors';
import type { LeaveTypeInput } from '@/domain/schemas/leaveType';
import { useAuth } from '@/features/auth/useAuth';
import {
  addStarterLeaveTypes,
  createLeaveType,
  listLeaveTypes,
  setLeaveTypeActive,
  updateLeaveType,
} from '@/services/leaveTypes.service';
import type { LeaveType } from '@/types/models';

/** Leave types are few: fetched once, cached 5 minutes, sorted by name (D-09). */
export const leaveTypeKeys = { all: ['leaveTypes'] as const };

export function useLeaveTypes(): UseQueryResult<LeaveType[], Error> {
  return useQuery({
    queryKey: leaveTypeKeys.all,
    queryFn: listLeaveTypes,
    staleTime: STALE_TIME_MS.leaveTypes,
  });
}

/** The types offered by pickers for NEW entries — deactivated ones are excluded (BR-LT-02). */
export function useActiveLeaveTypes() {
  const query = useLeaveTypes();
  const active = useMemo(() => (query.data ?? []).filter((type) => type.isActive), [query.data]);
  return { leaveTypes: active, isPending: query.isPending, isError: query.isError };
}

function useActorUid(): string {
  const { user } = useAuth();
  return user?.uid ?? '';
}
function requireActor(uid: string): string {
  if (uid === '') throw new AppError('PERMISSION_DENIED');
  return uid;
}

export function useCreateLeaveType(): UseMutationResult<string, Error, LeaveTypeInput> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: (input: LeaveTypeInput) => createLeaveType(input, requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leaveTypeKeys.all }),
  });
}

export function useUpdateLeaveType(): UseMutationResult<
  void,
  Error,
  { readonly leaveTypeId: string; readonly input: LeaveTypeInput }
> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: ({ leaveTypeId, input }) => updateLeaveType(leaveTypeId, input, requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leaveTypeKeys.all }),
  });
}

export function useSetLeaveTypeActive(): UseMutationResult<
  void,
  Error,
  { readonly leaveTypeId: string; readonly isActive: boolean }
> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: ({ leaveTypeId, isActive }) =>
      setLeaveTypeActive(leaveTypeId, isActive, requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leaveTypeKeys.all }),
  });
}

export function useAddStarterLeaveTypes(): UseMutationResult<number, Error, void> {
  const queryClient = useQueryClient();
  const uid = useActorUid();
  return useMutation({
    mutationFn: () => addStarterLeaveTypes(requireActor(uid)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leaveTypeKeys.all }),
  });
}
