import { z } from 'zod';

import { LEAVE_YEAR_RULES_MAX, LEAVE_YEAR_RULES_MIN } from '@/domain/constants';

/** Report filters (UI spec §6.12): the year is required; everything else is optional. */
export const reportFiltersSchema = z.object({
  year: z
    .number({ error: 'Select a leave year.' })
    .int('Select a leave year.')
    .min(LEAVE_YEAR_RULES_MIN, 'Select a leave year.')
    .max(LEAVE_YEAR_RULES_MAX, 'Select a leave year.'),
  employeeId: z.string().nullable(),
  leaveTypeId: z.string().nullable(),
  includeArchived: z.boolean(),
});
export type ReportFiltersInput = z.infer<typeof reportFiltersSchema>;
