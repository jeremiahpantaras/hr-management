import { format } from 'date-fns';

/** Keeps only `[A-Za-z0-9._-]` so an Employee ID can never produce an unsafe file name. */
export function sanitizeFilePart(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '');
  return cleaned === '' ? 'employee' : cleaned;
}

/**
 * UI spec §14: overall `HR-Leave-Report_{year}_{yyyyMMdd-HHmm}.xlsx`; individual
 * `Leave-Report_{employeeNumber}_{year}_{yyyyMMdd-HHmm}.xlsx`.
 */
export function reportFileName(
  year: number,
  generatedAt: Date,
  employeeNumber?: string | null,
): string {
  const stamp = format(generatedAt, 'yyyyMMdd-HHmm');
  return employeeNumber
    ? `Leave-Report_${sanitizeFilePart(employeeNumber)}_${String(year)}_${stamp}.xlsx`
    : `HR-Leave-Report_${String(year)}_${stamp}.xlsx`;
}
