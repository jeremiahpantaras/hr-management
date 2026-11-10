/** Workbook constants (UI spec §14). Sheet names are ≤ 31 characters with none of `[]:*?/\`. */
export const SHEET_NAMES = {
  info: 'Report Info',
  summary: 'Employee Summary',
  breakdown: 'Leave Breakdown',
  transactions: 'Transactions',
} as const;

/** Halves display correctly (`2.5`, `10.0`). */
export const NUMBER_FORMAT = '#,##0.0';
export const DATE_FORMAT = 'yyyy-mm-dd';
export const DATETIME_FORMAT = 'yyyy-mm-dd hh:mm';

export const SUMMARY_HEADERS = [
  'Employee ID',
  'Complete Name',
  'Position',
  'Department',
  'Employment Status',
  'Leave Year',
  'Total Leave Credits',
  'Total Leave Used',
  'Total Unused Leave',
  'Record Status',
] as const;

export const BREAKDOWN_HEADERS = [
  'Employee ID',
  'Complete Name',
  'Leave Year',
  'Leave Type',
  'Total Credits',
  'Total Used',
  'Remaining Credits',
] as const;

export const TRANSACTION_HEADERS = [
  'Employee ID',
  'Employee Name',
  'Position',
  'Leave Type',
  'Transaction Type',
  'Date From',
  'Date To',
  'Number of Days',
  'Remarks',
  'Recorded By',
  'Date Recorded',
  'Leave Year',
  'Effect on Available Credits',
  'Status',
  'Reference ID',
] as const;

/** `2026-02-10` → a local-midnight `Date`, so Excel shows the same calendar date in any zone. */
export function isoToLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}
