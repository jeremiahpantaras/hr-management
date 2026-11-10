import * as XLSX from 'xlsx';

import { DATETIME_FORMAT, DATE_FORMAT, NUMBER_FORMAT } from '@/utils/excel/formats';

export type Cell = string | number | Date | null;

/** Applies a number format to every numeric cell in the given 0-based columns. */
export function formatColumns(
  sheet: XLSX.WorkSheet,
  rowCount: number,
  columns: {
    readonly numeric?: readonly number[];
    readonly date?: readonly number[];
    readonly dateTime?: readonly number[];
  },
): void {
  for (let row = 1; row <= rowCount; row += 1) {
    for (const col of columns.numeric ?? []) setFormat(sheet, row, col, NUMBER_FORMAT);
    for (const col of columns.date ?? []) setFormat(sheet, row, col, DATE_FORMAT);
    for (const col of columns.dateTime ?? []) setFormat(sheet, row, col, DATETIME_FORMAT);
  }
}

function setFormat(sheet: XLSX.WorkSheet, row: number, col: number, z: string): void {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
  if (cell) cell.z = z;
}

/** Column widths from the longest value in each column (capped), plus an autofilter on the table. */
export function finishTable(
  sheet: XLSX.WorkSheet,
  aoa: readonly (readonly Cell[])[],
  columnCount: number,
): void {
  const widths: XLSX.ColInfo[] = [];
  for (let col = 0; col < columnCount; col += 1) {
    let longest = 8;
    for (const row of aoa) {
      const value = row[col];
      const length =
        value instanceof Date
          ? 16
          : value === null || value === undefined
            ? 0
            : String(value).length;
      longest = Math.max(longest, Math.min(length, 60));
    }
    widths.push({ wch: longest + 2 });
  }
  sheet['!cols'] = widths;
  sheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(aoa.length - 1, 0), c: columnCount - 1 },
    }),
  };
}
