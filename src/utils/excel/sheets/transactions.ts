import * as XLSX from 'xlsx';

import type { ReportModel } from '@/domain/report';
import { TRANSACTION_HEADERS, isoToLocalDate } from '@/utils/excel/formats';
import { finishTable, formatColumns, type Cell } from '@/utils/excel/sheets/sheetHelpers';

/**
 * One row per ledger entry. Dates are real Excel dates, numbers are real numbers, and every text
 * cell — including a remark such as `=1+1` — is a string cell (FR-RPT-07, BR-RPT-05/07).
 */
export function transactionsSheet(report: ReportModel): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    [...TRANSACTION_HEADERS],
    ...report.transactions.map((row) => [
      row.employeeNumber,
      row.employeeName,
      row.position,
      row.leaveType,
      row.transactionType,
      row.dateFrom === null ? null : isoToLocalDate(row.dateFrom),
      row.dateTo === null ? null : isoToLocalDate(row.dateTo),
      row.days,
      row.remarks === '' ? null : row.remarks,
      row.recordedBy,
      row.dateRecorded,
      row.leaveYear,
      row.effect,
      row.status === '' ? null : row.status,
      row.id,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  formatColumns(sheet, report.transactions.length, {
    numeric: [7, 12],
    date: [5, 6],
    dateTime: [10],
  });
  finishTable(sheet, aoa, TRANSACTION_HEADERS.length);
  return sheet;
}
