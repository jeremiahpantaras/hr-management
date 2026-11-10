import * as XLSX from 'xlsx';

import type { ReportModel } from '@/domain/report';
import { buildWorkbook } from '@/utils/excel/buildWorkbook';
import { reportFileName } from '@/utils/excel/fileName';

/**
 * Builds the workbook and hands it to the browser as a download. This module (and with it the whole
 * SheetJS library) is only ever loaded by a dynamic `import()` inside the export action, so SheetJS
 * stays out of the initial bundle (NFR-PERF-04).
 */
export function downloadReport(report: ReportModel, employeeNumber?: string | null): string {
  const fileName = reportFileName(report.info.year, report.info.generatedAt, employeeNumber);
  XLSX.writeFile(buildWorkbook(report), fileName, { bookType: 'xlsx', cellDates: true });
  return fileName;
}
