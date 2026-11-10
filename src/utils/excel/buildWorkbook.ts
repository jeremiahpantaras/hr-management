import * as XLSX from 'xlsx';

import type { ReportModel } from '@/domain/report';
import { SHEET_NAMES } from '@/utils/excel/formats';
import { employeeSummarySheet } from '@/utils/excel/sheets/employeeSummary';
import { leaveBreakdownSheet } from '@/utils/excel/sheets/leaveBreakdown';
import { reportInfoSheet } from '@/utils/excel/sheets/reportInfo';
import { transactionsSheet } from '@/utils/excel/sheets/transactions';

/**
 * Report model → SheetJS workbook (UI spec §14): four sheets, in this order. A pure function — data
 * in, workbook out — so it is unit-tested by writing the workbook to a buffer and reading it back.
 * SheetJS CE cannot style cells, so only widths, number/date formats and autofilters are applied.
 */
export function buildWorkbook(report: ReportModel): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, reportInfoSheet(report), SHEET_NAMES.info);
  XLSX.utils.book_append_sheet(workbook, employeeSummarySheet(report), SHEET_NAMES.summary);
  XLSX.utils.book_append_sheet(workbook, leaveBreakdownSheet(report), SHEET_NAMES.breakdown);
  XLSX.utils.book_append_sheet(workbook, transactionsSheet(report), SHEET_NAMES.transactions);
  workbook.Props = {
    Title: report.info.title,
    Author: report.info.generatedBy,
    CreatedDate: report.info.generatedAt,
  };
  return workbook;
}

/** The `.xlsx` bytes of a workbook. */
export function workbookToBytes(workbook: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(
    XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer,
  );
}
