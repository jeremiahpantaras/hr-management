import { z } from 'zod';

import {
  EMPLOYEE_FIELD_LIMITS,
  EMPLOYEE_NUMBER_PATTERN,
  EMPLOYMENT_STATUSES,
} from '@/domain/constants';

/** Messages are the exact copy from planning/UI_UX_DESIGN_SPECIFICATION.md §12. */
export const employeeSchema = z.object({
  employeeNumber: z
    .string()
    .trim()
    .min(1, 'Enter the employee ID.')
    .regex(EMPLOYEE_NUMBER_PATTERN, 'Use letters, numbers, dots, dashes or underscores (max 30).'),
  fullName: z
    .string()
    .trim()
    .min(1, "Enter the employee's complete name.")
    .max(EMPLOYEE_FIELD_LIMITS.fullName, 'Name is too long (120 characters max).'),
  position: z
    .string()
    .trim()
    .min(1, 'Enter a position.')
    .max(EMPLOYEE_FIELD_LIMITS.position, 'Position is too long (80 characters max).'),
  /** Optional: a blank department is stored as `null`, never as an empty string. */
  department: z
    .string()
    .trim()
    .max(EMPLOYEE_FIELD_LIMITS.department, 'Department is too long (80 characters max).')
    .transform((value) => (value === '' ? null : value)),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES, { error: 'Select an employment status.' }),
});

/** What the form holds (department is a string while editing). */
export type EmployeeFormValues = z.input<typeof employeeSchema>;
/** What is validated and saved (department is `string | null`). */
export type EmployeeInput = z.output<typeof employeeSchema>;
