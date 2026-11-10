// @vitest-environment node
// (fflate checks `instanceof Uint8Array`; jsdom replaces that global, so the zip layer is tested in Node.)
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { buildReversalEntry } from '@/domain/ledger';
import { ACTOR, juan2026 } from '@/domain/testFixtures';
import type { LeaveTransaction } from '@/types/models';
import {
  HISTORY_HEADERS,
  buildHistoryXlsx,
  historyFileName,
  historyRow,
} from '@/utils/excel/leaveHistoryExcel';
import { PAPER_CODES } from '@/utils/excel/xlsxPatch';

const NOW = new Date(2026, 7, 9, 14, 5);
const { ledger } = juan2026();
const options = { paper: 'A4', orientation: 'landscape', year: 2026 } as const;
const part = (bytes: Uint8Array, path: string): string => {
  const file = unzipSync(bytes)[path];
  if (!file) throw new Error(`missing ${path}`);
  return strFromU8(file);
};
const rowsOf = (bytes: Uint8Array): unknown[][] => {
  const workbook = XLSX.read(bytes, { type: 'array' });
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['Leave History']!, {
    header: 1,
    defval: '',
  });
};

describe('historyRow', () => {
  it('writes an allocation: id, name, type, no leave dates, effect and remaining days', () => {
    const row = historyRow({
      ...ledger[0]!,
      remarks: 'Annual',
      createdAt: new Date(2026, 0, 5, 9, 30),
    });
    expect(row).toEqual([
      '2026-01-05 09:30',
      'EMP-0042',
      'Juan Dela Cruz',
      'Allocation',
      '',
      '',
      10,
      '+10 days',
      10,
      'Annual',
      'Maria Santos',
      '',
    ]);
  });
  it('writes a usage with the dates and the days left right after it', () => {
    const row = historyRow(ledger[1]!);
    expect(row.slice(3, 10)).toEqual(['Usage', '2026-02-10', '2026-02-11', 2, '−2 days', 8, '']);
  });
  it('writes an edit: type Edit, signed effect, the reason as remarks, and who made it', () => {
    const row = historyRow({
      ...ledger[0]!,
      transactionType: 'ADJUSTMENT',
      days: 2,
      creditsDelta: -2,
      resultingTotalCredits: 8,
      resultingTotalUsed: 3,
      remarks: 'Corrected after audit',
    });
    expect(row.slice(3, 4)).toEqual(['Edit']);
    expect(row[7]).toBe('−2 days (edit)');
    expect(row[8]).toBe(5);
    expect(row.slice(9)).toEqual(['Corrected after audit', 'Maria Santos', '']);
  });
  it('marks reversed and reversal rows', () => {
    const usage = ledger[1]!;
    const { entry } = buildReversalEntry({
      original: usage,
      balance: { totalCredits: 10, totalUsed: 5 },
      reason: 'Mistake',
      actor: ACTOR,
    });
    const reversal: LeaveTransaction = { ...entry, id: `rev_${usage.id}`, createdAt: NOW };
    expect(historyRow({ ...usage, reversedByTransactionId: reversal.id })[11]).toBe('Reversed');
    const row = historyRow(reversal);
    expect(row[3]).toBe('Reversal');
    expect(row[7]).toBe('+2 days (reversal)');
    expect(String(row[11])).toMatch(/^Reversal of …/);
  });
});

describe('buildHistoryXlsx', () => {
  const bytes = buildHistoryXlsx([...ledger].reverse(), options, NOW);

  it('has one sheet with the header row and one row per entry', () => {
    const rows = rowsOf(bytes);
    expect(rows[0]).toEqual([...HISTORY_HEADERS]);
    expect(rows).toHaveLength(6);
    expect(HISTORY_HEADERS).toContain('Remaining Days');
    expect(rows[1]?.[8]).toBe(5); // newest usage: 5 days left
  });
  it.each([
    ['LETTER', PAPER_CODES.LETTER],
    ['A4', PAPER_CODES.A4],
  ] as const)('prints on %s, one page wide, header repeated, with a page footer', (paper, code) => {
    const out = buildHistoryXlsx(ledger, { ...options, paper }, NOW);
    const sheet = part(out, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain(`paperSize="${String(code)}"`);
    expect(sheet).toContain('fitToWidth="1" fitToHeight="0"');
    expect(sheet).toContain('Page &amp;P of &amp;N');
    expect(part(out, 'xl/workbook.xml')).toContain('&apos;Leave History&apos;!$1:$1');
  });
  it('keeps text such as =1+1 as text, never a formula', () => {
    const out = buildHistoryXlsx([{ ...ledger[0]!, remarks: '=1+1' }], options, NOW);
    const sheet = XLSX.read(out, { type: 'array' }).Sheets['Leave History']!;
    const cell = sheet.J2 as XLSX.CellObject;
    expect(cell.t).toBe('s');
    expect(cell.f).toBeUndefined();
  });
  it('an empty list still gives a valid file with just the header', () => {
    expect(rowsOf(buildHistoryXlsx([], options, NOW))).toHaveLength(1);
  });
  it('file name names the year, paper and time', () => {
    expect(historyFileName(options, NOW)).toBe('Leave-History_2026_A4_20260809-1405.xlsx');
  });
});
