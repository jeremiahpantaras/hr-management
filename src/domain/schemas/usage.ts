import { z } from 'zod';

import { inclusiveDays, isInYear, isRealDate } from '@/domain/dates';
import { daysField, remarksField, yearField } from '@/domain/schemas/days';

export const usageSchema = z
  .object({
    employeeId: z.string().min(1, 'Select an employee.'),
    year: yearField,
    dateFrom: z.string().min(1, 'Enter the start date.'),
    dateTo: z.string().min(1, 'Enter the end date.'),
    days: daysField('Enter the number of days.', 'Days'),
    remarks: remarksField,
  })
  .superRefine((value, ctx) => {
    const yearText = String(value.year);
    for (const field of ['dateFrom', 'dateTo'] as const) {
      const date = value[field];
      if (date === '') continue;
      if (!isRealDate(date) || !isInYear(date, value.year)) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `Leave must fall within ${yearText}.`,
        });
      }
    }
    if (isRealDate(value.dateFrom) && isRealDate(value.dateTo) && value.dateTo < value.dateFrom) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateTo'],
        message: "The end date can't be before the start date.",
      });
      return;
    }
    if (isRealDate(value.dateFrom) && isRealDate(value.dateTo)) {
      const calendarDays = inclusiveDays(value.dateFrom, value.dateTo);
      if (value.days > calendarDays) {
        ctx.addIssue({
          code: 'custom',
          path: ['days'],
          message: `Days can't exceed the ${String(calendarDays)} calendar days in this range.`,
        });
      }
    }
  });

export type UsageFormValues = z.input<typeof usageSchema>;
export type UsageInput = z.output<typeof usageSchema>;
