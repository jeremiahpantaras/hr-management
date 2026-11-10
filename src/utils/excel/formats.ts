import { MONTH_LABELS } from '@/domain/report';

/** The sheet of the leave credits report. A name is ≤ 31 characters with none of `[]:*?/\`. */
export const SHEET_NAME = 'Leave Credits';

export const BAND_INFORMATION = "EMPLOYEE'S INFORMATION";
export const BAND_USED = 'USED CREDITS AND DATE';

/** Row 3 of the sheet, exactly as in the company's own spreadsheet. */
export const COLUMN_HEADERS = [
  'NAME',
  'POSITION',
  'LOCATION',
  'TOTAL NO. OF UNUSED LEAVE CREDITS',
  ...MONTH_LABELS,
  'TOTAL OF USED LEAVE',
  'TOTAL REMAINING LEAVES',
] as const;

/** Column positions (0-based). */
export const COL = {
  name: 0,
  position: 1,
  location: 2,
  credits: 3,
  firstMonth: 4,
  lastMonth: 15,
  used: 16,
  remaining: 17,
} as const;

export const COLUMN_COUNT = COLUMN_HEADERS.length;
/** Rows 1–3 hold the title, the two bands and the column headers; data starts on row 4. */
export const HEADER_ROWS = 3;
