import { z } from 'zod';

import { REMARKS_MAX_LENGTH, REVERSAL_REASON_MIN_LENGTH } from '@/domain/constants';

export const reversalSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(REVERSAL_REASON_MIN_LENGTH, 'Enter a reason (at least 3 characters).')
    .max(
      REMARKS_MAX_LENGTH,
      `Remarks are too long (${String(REMARKS_MAX_LENGTH)} characters max).`,
    ),
  /** USAGE only: open a pre-filled form after reversing (BR-COR-06). */
  thenReEnter: z.boolean(),
});

export type ReversalFormValues = z.input<typeof reversalSchema>;
export type ReversalInput = z.output<typeof reversalSchema>;
