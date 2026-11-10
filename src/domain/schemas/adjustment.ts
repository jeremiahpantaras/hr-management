import { z } from 'zod';

import { DAY_STEP, REMARKS_MAX_LENGTH, REVERSAL_REASON_MIN_LENGTH } from '@/domain/constants';

/**
 * Edit an employee's allocated days (UI: "Edit days"). The form holds strings; the schema checks the
 * shape and outputs numbers. "Not below the days already used" and "must change" depend on the
 * current balance, so the dialog checks them against it (and the ledger builder enforces them).
 */
export const adjustmentSchema = z.object({
  newTotal: z
    .string()
    .trim()
    .min(1, 'Enter the new total days.')
    .refine((value) => Number.isFinite(Number(value)), 'Enter the new total days.')
    .refine((value) => Number(value) >= 0, 'The total can’t be negative.')
    .refine((value) => Number.isInteger(Number(value) / DAY_STEP), 'Use whole or half days (0.5).')
    .transform(Number),
  reason: z
    .string()
    .trim()
    .min(REVERSAL_REASON_MIN_LENGTH, 'Enter a reason (at least 3 characters).')
    .max(
      REMARKS_MAX_LENGTH,
      `The reason is too long (${String(REMARKS_MAX_LENGTH)} characters max).`,
    ),
});

export type AdjustmentFormValues = z.input<typeof adjustmentSchema>;
export type AdjustmentInput = z.output<typeof adjustmentSchema>;
