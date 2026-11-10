import { format } from 'date-fns';
import * as XLSX from 'xlsx';

import { statusText } from '@/domain/ledgerExport';
import { effectLabel, transactionKind } from '@/domain/ledgerDisplay';
import type { LeaveTransaction } from '@/types/models';
import { downloadBytes } from '@/utils/excel/download';
import {
  PAPER_LABELS,
  applyPrintLayout,
  type Orientation,
  type PaperSize,
} from '@/utils/excel/xlsxPatch';

/**
 * Leave history as a printable workbook (Letter or A4): one row per ledger entry, newest first,
 * header row repeated on every page, "Page x of y" footer. Only loaded by a dynamic `import()` when
 * the user exports, so SheetJS stays out of the initial bundle.
 */

export const HISTORY_HEADERS = [
  'Date Recorded',
  'Employee ID',
  'Employee Name',
  'Type',
  'Leave From',
  'Leave To',
  'Days',
  'Effect on Balance',
  'Remaining Days',
  'Remarks',
  'Recorded By',
  'Status',
] as const;

const SHEET_NAME = 'Leave History';
const WIDTHS = [18, 14, 28, 12, 12, 12, 8, 20, 10, 36, 22, 20];
const MARGINS = { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };

export interface HistoryExportOptions {
  readonly paper: PaperSize;
  readonly orientation: Orientation;
  readonly year: number;
}

type Cell = string | number;

export function historyRow(entry: LeaveTransaction): Cell[] {
  return [
    entry.createdAt ? format(entry.createdAt, 'yyyy-MM-dd HH:mm') : '',
    entry.employeeNumberSnapshot,
    entry.employeeNameSnapshot,
    transactionKind(entry),
    entry.dateFrom ?? '',
    entry.dateTo ?? '',
    entry.days,
    effectLabel(entry),
    entry.resultingTotalCredits - entry.resultingTotalUsed,
    entry.remarks ?? '',
    entry.createdByName,
    statusText(entry),
  ];
}

export function buildHistoryXlsx(
  entries: readonly LeaveTransaction[],
  options: HistoryExportOptions,
  generatedAt: Date,
): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([[...HISTORY_HEADERS], ...entries.map(historyRow)]);
  sheet['!cols'] = WIDTHS.map((wch) => ({ wch }));
  sheet['!margins'] = MARGINS;
  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(entries.length, 1), c: HISTORY_HEADERS.length - 1 },
    }),
  };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  workbook.Workbook = {
    Names: [{ Name: '_xlnm.Print_Titles', Ref: `'${SHEET_NAME}'!$1:$1`, Sheet: 0 }],
  };
  workbook.Props = { Title: `Leave history ${String(options.year)}`, CreatedDate: generatedAt };
  const bytes = new Uint8Array(
    XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
  );
  return applyPrintLayout(
    bytes,
    {
      paper: options.paper,
      orientation: options.orientation,
      footerLeft: `HR Leave Monitor — Leave history ${String(options.year)}`,
      footerRight: `Printed ${format(generatedAt, 'yyyy-MM-dd')}`,
    },
    [{ header: true }],
  );
}

export function historyFileName(options: HistoryExportOptions, generatedAt: Date): string {
  return `Leave-History_${String(options.year)}_${PAPER_LABELS[options.paper]}_${format(generatedAt, 'yyyyMMdd-HHmm')}.xlsx`;
}

export function downloadHistory(
  entries: readonly LeaveTransaction[],
  options: HistoryExportOptions,
): string {
  const now = new Date();
  const fileName = historyFileName(options, now);
  downloadBytes(fileName, buildHistoryXlsx(entries, options, now));
  return fileName;
}
