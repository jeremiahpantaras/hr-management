import { z } from 'zod';

import { LEAVE_YEAR_RULES_MAX, LEAVE_YEAR_RULES_MIN } from '@/domain/constants';
import { REPORT_TITLE_MAX_LENGTH } from '@/domain/report';

/** Report filters: the year and the "as of" month are required; the rest is optional. */
export const reportFiltersSchema = z.object({
  year: z
    .number({ error: 'Select a leave year.' })
    .int('Select a leave year.')
    .min(LEAVE_YEAR_RULES_MIN, 'Select a leave year.')
    .max(LEAVE_YEAR_RULES_MAX, 'Select a leave year.'),
  asOfMonth: z
    .number({ error: 'Select a month.' })
    .int('Select a month.')
    .min(1, 'Select a month.')
    .max(12, 'Select a month.'),
  title: z
    .string()
    .max(
      REPORT_TITLE_MAX_LENGTH,
      `The title is too long (${String(REPORT_TITLE_MAX_LENGTH)} characters max).`,
    ),
  employeeId: z.string().nullable(),
  includeArchived: z.boolean(),
});
export type ReportFiltersInput = z.infer<typeof reportFiltersSchema>;
