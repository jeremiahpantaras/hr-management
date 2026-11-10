import { format } from 'date-fns';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';

import type { ReportModel, ReportRow } from '@/domain/report';
import { applyCellStyles, patchStylesWith, type StyleSpec } from '@/utils/excel/cellStyles';
import { downloadBytes } from '@/utils/excel/download';
import { leaveCreditsFileName } from '@/utils/excel/fileName';
import {
  BAND_INFORMATION,
  BAND_USED,
  COL,
  COLUMN_COUNT,
  COLUMN_HEADERS,
  HEADER_ROWS,
  SHEET_NAME,
} from '@/utils/excel/formats';
import {
  patchWorksheetXml,
  type Orientation,
  type PaperSize,
  type PrintLayout,
} from '@/utils/excel/xlsxPatch';

/**
 * The leave credits report as a one-sheet workbook laid out like the company's own spreadsheet:
 *
 *   row 1  title ("… AS OF AUGUST 2026"), merged across
 *   row 2  two coloured bands — EMPLOYEE'S INFORMATION (blue) and USED CREDITS AND DATE (red)
 *   row 3  column headers
 *   row 4+ one employee per row; an employee with every credit used gets a dark row, white text
 *
 * SheetJS writes the data and the merges; `cellStyles` adds the colours, fonts and borders, and
 * `xlsxPatch` adds the paper size (Letter / A4), fit-to-width, repeated header rows and page footer.
 * This module (with SheetJS and fflate) is only loaded by a dynamic `import()` when the user exports.
 */

export interface LeaveCreditsOptions {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
}

const BLACK = 'FF000000';
const WHITE = 'FFFFFFFF';
const BLUE = 'FF0070C0';
const RED = 'FFC00000';
const MAGENTA = 'FFD6007F';
const DARK = 'FF404040';

/** Column widths in characters; they add up to a width that prints cleanly on one page. */
const WIDTHS = [30, 26, 18, 16, ...new Array<number>(12).fill(5.5), 11, 13];

const text = (color: string, bold = false) => ({ size: 10, bold, color });
const STYLES = {
  title: { font: { size: 16, bold: true, color: BLACK }, horizontal: 'center' },
  bandBlue: {
    font: { size: 12, bold: true, color: WHITE },
    fill: BLUE,
    border: true,
    horizontal: 'center',
  },
  bandRed: {
    font: { size: 12, bold: true, color: WHITE },
    fill: RED,
    border: true,
    horizontal: 'center',
  },
  head: { font: text(BLACK, true), border: true, horizontal: 'center', wrap: true },
  name: { font: text(BLACK, true), border: true, horizontal: 'left' },
  text: { font: text(BLACK), border: true, horizontal: 'left' },
  credits: { font: text(RED, true), border: true, horizontal: 'center' },
  month: { font: text(BLACK), border: true, horizontal: 'center' },
  used: { font: text(BLUE, true), border: true, horizontal: 'center' },
  remaining: { font: text(MAGENTA, true), border: true, horizontal: 'center' },
  darkName: { font: text(WHITE, true), fill: DARK, border: true, horizontal: 'left' },
  darkText: { font: text(WHITE), fill: DARK, border: true, horizontal: 'left' },
  darkMonth: { font: text(WHITE), fill: DARK, border: true, horizontal: 'center' },
  darkBold: { font: text(WHITE, true), fill: DARK, border: true, horizontal: 'center' },
} as const satisfies Record<string, StyleSpec>;
type StyleName = keyof typeof STYLES;

/** The style of one cell of the sheet (0-based row and column). */
function styleName(row: number, column: number, fullyUsed: readonly boolean[]): StyleName | null {
  if (row === 0) return 'title';
  if (row === 1) return column < COL.credits ? 'bandBlue' : 'bandRed';
  if (row === 2) return 'head';
  const dark = fullyUsed[row - HEADER_ROWS] === true;
  if (column === COL.name) return dark ? 'darkName' : 'name';
  if (column === COL.position || column === COL.location) return dark ? 'darkText' : 'text';
  if (dark) return column >= COL.firstMonth && column <= COL.lastMonth ? 'darkMonth' : 'darkBold';
  if (column === COL.credits) return 'credits';
  if (column === COL.used) return 'used';
  if (column === COL.remaining) return 'remaining';
  return 'month';
}

const monthCell = (value: number): number | string => (value === 0 ? '' : value);

function dataRow(row: ReportRow): (string | number)[] {
  return [
    row.name,
    row.position,
    row.location,
    row.totalCredits,
    ...row.months.map(monthCell),
    row.totalUsed,
    row.remaining,
  ];
}

function buildSheet(report: ReportModel): XLSX.WorkSheet {
  const blank = (): string[] => new Array<string>(COLUMN_COUNT).fill('');
  const title = blank();
  title[0] = report.heading;
  const bands = blank();
  bands[0] = BAND_INFORMATION;
  bands[COL.credits] = BAND_USED;

  const aoa: (string | number)[][] = [
    title,
    bands,
    [...COLUMN_HEADERS],
    ...report.rows.map(dataRow),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLUMN_COUNT - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COL.credits - 1 } },
    { s: { r: 1, c: COL.credits }, e: { r: 1, c: COLUMN_COUNT - 1 } },
  ];
  sheet['!cols'] = WIDTHS.map((wch) => ({ wch }));
  sheet['!rows'] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 48 }, ...report.rows.map(() => ({ hpt: 20 }))];
  sheet['!margins'] = { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  return sheet;
}

/** Replaces the sheet's single view with one that freezes the three header rows. */
export function freezeHeaderRows(xml: string): string {
  return xml.replace(
    /<sheetViews>[\s\S]*?<\/sheetViews>/,
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${String(HEADER_ROWS)}" topLeftCell="A${String(HEADER_ROWS + 1)}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${String(HEADER_ROWS + 1)}" sqref="A${String(HEADER_ROWS + 1)}"/></sheetView></sheetViews>`,
  );
}

/** The report as `.xlsx` bytes. */
export function buildLeaveCreditsXlsx(
  report: ReportModel,
  options: LeaveCreditsOptions,
): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSheet(report), SHEET_NAME);
  workbook.Workbook = {
    Names: [
      { Name: '_xlnm.Print_Titles', Ref: `'${SHEET_NAME}'!$1:$${String(HEADER_ROWS)}`, Sheet: 0 },
    ],
  };
  workbook.Props = {
    Title: report.heading,
    Author: report.generatedBy,
    CreatedDate: report.generatedAt,
  };
  const written = new Uint8Array(
    XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
  );

  const files = unzipSync(written);
  const stylesFile = files['xl/styles.xml'];
  const sheetFile = files['xl/worksheets/sheet1.xml'];
  if (!stylesFile || !sheetFile) throw new Error('Not a workbook written by SheetJS');

  const styled = patchStylesWith(strFromU8(stylesFile), STYLES);
  files['xl/styles.xml'] = strToU8(styled.xml);

  const fullyUsed = report.rows.map((row) => row.fullyUsed);
  let sheetXml = applyCellStyles(strFromU8(sheetFile), (row, column) => {
    const name = styleName(row, column, fullyUsed);
    return name === null ? undefined : styled.index[name];
  });
  const layout: PrintLayout = {
    paper: options.paper,
    orientation: options.orientation,
    footerLeft: `HR Leave Monitor — ${report.heading}`,
    footerRight: `Printed ${format(report.generatedAt, 'yyyy-MM-dd')}`,
  };
  sheetXml = patchWorksheetXml(sheetXml, layout, { header: false });
  files['xl/worksheets/sheet1.xml'] = strToU8(freezeHeaderRows(sheetXml));
  return zipSync(files, { level: 6 });
}

export function downloadLeaveCredits(report: ReportModel, options: LeaveCreditsOptions): string {
  const fileName = leaveCreditsFileName(report.heading, options.paper);
  downloadBytes(fileName, buildLeaveCreditsXlsx(report, options));
  return fileName;
}
