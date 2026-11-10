import * as XLSX from 'xlsx';

import type { ReportModel } from '@/domain/report';
import { SUMMARY_HEADERS } from '@/utils/excel/formats';
import { finishTable, formatColumns, type Cell } from '@/utils/excel/sheets/sheetHelpers';

export function employeeSummarySheet(report: ReportModel): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    [...SUMMARY_HEADERS],
    ...report.summary.map((row) => [
      row.employeeNumber,
      row.fullName,
      row.position,
      row.department === '' ? null : row.department,
      row.employmentStatus,
      row.leaveYear,
      row.totalCredits,
      row.totalUsed,
      row.totalUnused,
      row.recordStatus,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  formatColumns(sheet, report.summary.length, { numeric: [6, 7, 8] });
  finishTable(sheet, aoa, SUMMARY_HEADERS.length);
  return sheet;
}
