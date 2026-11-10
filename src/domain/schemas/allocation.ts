import { z } from 'zod';

import { daysField, remarksField, yearField } from '@/domain/schemas/days';

export const allocationSchema = z.object({
  employeeId: z.string().min(1, 'Select an employee.'),
  year: yearField,
  days: daysField('Enter the number of days.', 'Days'),
  remarks: remarksField,
});

/** What the form holds while editing (strings). */
export type AllocationFormValues = z.input<typeof allocationSchema>;
/** What is validated and sent to the service. */
export type AllocationInput = z.output<typeof allocationSchema>;
