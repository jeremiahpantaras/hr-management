import { z } from 'zod';

import { DAY_STEP, MAX_DAYS_PER_ENTRY, REMARKS_MAX_LENGTH } from '@/domain/constants';

/**
 * Shared field schemas for the leave forms. Form fields hold strings (that is what inputs give
 * back); the schema validates them and outputs numbers. Messages: UI spec §12.
 */

/** A day amount typed as text → number. Checks run in this order; the first failure is shown. */
export function daysField(requiredMessage: string, subject: 'Days') {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .refine((value) => Number.isFinite(Number(value)), requiredMessage)
    .refine((value) => Number(value) > 0, `${subject} must be greater than 0.`)
    .refine((value) => Number.isInteger(Number(value) / DAY_STEP), 'Use whole or half days (0.5).')
    .refine(
      (value) => Number(value) <= MAX_DAYS_PER_ENTRY,
      `The maximum is ${String(MAX_DAYS_PER_ENTRY)} per entry.`,
    )
    .transform(Number);
}

/** Optional remarks: blank → `null`. */
export const remarksField = z
  .string()
  .trim()
  .max(REMARKS_MAX_LENGTH, `Remarks are too long (${String(REMARKS_MAX_LENGTH)} characters max).`)
  .transform((value) => (value === '' ? null : value));

export const yearField = z
  .string()
  .min(1, 'Select a leave year.')
  .regex(/^\d{4}$/, 'Select a leave year.')
  .transform(Number);
