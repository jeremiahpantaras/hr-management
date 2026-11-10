import { format } from 'date-fns';
import * as XLSX from 'xlsx';

import { EMPLOYMENT_STATUSES } from '@/domain/constants';
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS } from '@/domain/employeeImport';
import type { Employee } from '@/types/models';
import { downloadBytes } from '@/utils/excel/download';
import {
  PAPER_LABELS,
  applyPrintLayout,
  type Orientation,
  type PaperSize,
} from '@/utils/excel/xlsxPatch';

/**
 * Employee spreadsheets: export (with a print layout for Letter or A4), the import template, and
 * reading an uploaded file. This module (with SheetJS and fflate) is only ever loaded by a dynamic
 * `import()` when the user opens Export or Import, so it stays out of the initial bundle.
 */

export const EXPORT_HEADERS = [...IMPORT_COLUMNS, 'Record Status'] as const;
const SHEET_NAME = 'Employees';
const MARGINS = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

export interface ExportOptions {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
}

/** Column widths in characters; they sum to a width that fits Letter and A4 landscape at 100 %. */
const WIDTHS = [16, 32, 28, 22, 20, 14];

function employeesSheet(rows: readonly (readonly (string | null)[])[], headers: readonly string[]) {
  const sheet = XLSX.utils.aoa_to_sheet([[...headers], ...rows.map((row) => [...row])]);
  sheet['!cols'] = headers.map((_, index) => ({ wch: WIDTHS[index] ?? 18 }));
  sheet['!margins'] = MARGINS;
  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(rows.length, 1), c: headers.length - 1 },
    }),
  };
  return sheet;
}

function withPrintTitles(workbook: XLSX.WorkBook): void {
  workbook.Workbook = {
    Names: [{ Name: '_xlnm.Print_Titles', Ref: `${SHEET_NAME}!$1:$1`, Sheet: 0 }],
  };
}

function toBytes(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** The employees as a printable workbook. Text cells stay text (a name like `=1+1` is not a formula). */
export function buildEmployeesXlsx(
  employees: readonly Employee[],
  options: ExportOptions,
  generatedAt: Date,
): Uint8Array {
  const rows = employees.map((e) => [
    e.employeeNumber,
    e.fullName,
    e.position,
    e.department,
    e.employmentStatus,
    e.isArchived ? 'Archived' : 'Active',
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, employeesSheet(rows, EXPORT_HEADERS), SHEET_NAME);
  withPrintTitles(workbook);
  workbook.Props = { Title: 'Employees', CreatedDate: generatedAt };
  return applyPrintLayout(
    toBytes(workbook),
    {
      paper: options.paper,
      orientation: options.orientation,
      footerLeft: 'HR Leave Monitor — Employees',
      footerRight: `Printed ${format(generatedAt, 'yyyy-MM-dd')}`,
    },
    [{ header: true }],
  );
}

const INSTRUCTIONS = [
  ['How to fill in this template'],
  [''],
  [
    '1. Fill the "Employees" sheet — one employee per row, starting under the header row. Keep the header row.',
  ],
  [
    '2. Employee ID (required): letters, numbers, dots, dashes or underscores, up to 30 characters, e.g. EMP-0042. It must be unique (EMP-1 and emp-1 count as the same).',
  ],
  ['3. Complete Name (required): up to 120 characters.'],
  ['4. Position (required): up to 80 characters.'],
  ['5. Location (optional): up to 80 characters.'],
  [`6. Employment Status (required): one of ${EMPLOYMENT_STATUSES.join(', ')}.`],
  [
    `7. At most ${String(MAX_IMPORT_ROWS)} employees per file. Rows that have a problem are shown before anything is imported, and are skipped.`,
  ],
  [
    '8. Importing never changes or deletes existing employees — an Employee ID that already exists is skipped.',
  ],
];

/** An empty import template: the header row (with a status dropdown) plus an instructions sheet. */
export function buildTemplateXlsx(paper: PaperSize, generatedAt: Date): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, employeesSheet([], IMPORT_COLUMNS), SHEET_NAME);
  const instructions = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
  instructions['!cols'] = [{ wch: 120 }];
  instructions['!margins'] = MARGINS;
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  withPrintTitles(workbook);
  return applyPrintLayout(
    toBytes(workbook),
    {
      paper,
      orientation: 'landscape',
      footerLeft: 'HR Leave Monitor — Employee import template',
      footerRight: `Printed ${format(generatedAt, 'yyyy-MM-dd')}`,
    },
    [
      {
        header: true,
        list: { sqref: `E2:E${String(MAX_IMPORT_ROWS + 1)}`, items: EMPLOYMENT_STATUSES },
        textColumns: [0],
      },
      { header: false },
    ],
  );
}

/**
 * The FIRST sheet of an uploaded workbook as rows of cells. Formulas are not evaluated (the cached
 * value is read); the row count is capped while parsing so an enormous sheet cannot hang the page.
 */
export function readFirstSheet(bytes: Uint8Array): unknown[][] {
  // An .xlsx is a zip ("PK"). SheetJS would happily read anything else as CSV text, so refuse early.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('Not an .xlsx workbook.');
  }
  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
    sheetRows: MAX_IMPORT_ROWS * 4,
  });
  const name = workbook.SheetNames[0];
  const sheet = name === undefined ? undefined : workbook.Sheets[name];
  if (!sheet) throw new Error('The workbook has no sheets.');
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  });
}

export function exportFileName(options: ExportOptions, generatedAt: Date): string {
  return `Employees_${PAPER_LABELS[options.paper]}_${format(generatedAt, 'yyyyMMdd-HHmm')}.xlsx`;
}

export function templateFileName(paper: PaperSize): string {
  return `Employee-import-template_${PAPER_LABELS[paper]}.xlsx`;
}

export function downloadEmployees(employees: readonly Employee[], options: ExportOptions): string {
  const now = new Date();
  const fileName = exportFileName(options, now);
  downloadBytes(fileName, buildEmployeesXlsx(employees, options, now));
  return fileName;
}

export function downloadTemplate(paper: PaperSize): string {
  const fileName = templateFileName(paper);
  downloadBytes(fileName, buildTemplateXlsx(paper, new Date()));
  return fileName;
}
