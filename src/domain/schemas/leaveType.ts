import { z } from 'zod';

import { LEAVE_TYPE_FIELD_LIMITS } from '@/domain/constants';

export const leaveTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a leave type name.')
    .max(LEAVE_TYPE_FIELD_LIMITS.name, 'Name is too long (60 characters max).'),
  /** Optional: blank → `null`. */
  description: z
    .string()
    .trim()
    .max(LEAVE_TYPE_FIELD_LIMITS.description, 'Description is too long (200 characters max).')
    .transform((value) => (value === '' ? null : value)),
});

export type LeaveTypeFormValues = z.input<typeof leaveTypeSchema>;
export type LeaveTypeInput = z.output<typeof leaveTypeSchema>;

/** BR-LT-03 / A-05: names are unique ignoring case, checked against the cached list. */
export function isDuplicateLeaveTypeName(
  name: string,
  existing: readonly { readonly id: string; readonly name: string }[],
  ignoreId?: string,
): boolean {
  const wanted = name.trim().toLowerCase();
  return existing.some((type) => type.id !== ignoreId && type.name.trim().toLowerCase() === wanted);
}
