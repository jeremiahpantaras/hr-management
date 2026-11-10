import * as XLSX from 'xlsx';

import type { ReportModel } from '@/domain/report';
import { BREAKDOWN_HEADERS } from '@/utils/excel/formats';
import { finishTable, formatColumns, type Cell } from '@/utils/excel/sheets/sheetHelpers';

export function leaveBreakdownSheet(report: ReportModel): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    [...BREAKDOWN_HEADERS],
    ...report.breakdown.map((row) => [
      row.employeeNumber,
      row.fullName,
      row.leaveYear,
      row.leaveType,
      row.totalCredits,
      row.totalUsed,
      row.remaining,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  formatColumns(sheet, report.breakdown.length, { numeric: [4, 5, 6] });
  finishTable(sheet, aoa, BREAKDOWN_HEADERS.length);
  return sheet;
}
