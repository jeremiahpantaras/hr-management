// @vitest-environment node
// (fflate checks `instanceof Uint8Array`; jsdom replaces that global, so the zip layer is tested in Node.)
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { buildReport, DEFAULT_REPORT_TITLE, type ReportFilters } from '@/domain/report';
import { juan2026, makeBalance, makeEmployee } from '@/domain/testFixtures';
import { applyCellStyles, columnIndex, patchStylesWith } from '@/utils/excel/cellStyles';
import { leaveCreditsFileName, sanitizeFilePart } from '@/utils/excel/fileName';
import { COLUMN_COUNT, COLUMN_HEADERS, SHEET_NAME } from '@/utils/excel/formats';
import { buildLeaveCreditsXlsx, freezeHeaderRows } from '@/utils/excel/leaveCreditsReport';
import { PAPER_CODES } from '@/utils/excel/xlsxPatch';

const GENERATED = new Date(2026, 7, 9, 14, 5);
const FILTERS: ReportFilters = {
  year: 2026,
  asOfMonth: 8,
  title: DEFAULT_REPORT_TITLE,
  employeeId: null,
  includeArchived: false,
};

function reportFor(
  employees = [makeEmployee()],
  over: Partial<Parameters<typeof buildReport>[0]> = {},
) {
  const { ledger, balances } = juan2026();
  return buildReport({
    filters: FILTERS,
    employees,
    balances,
    ledger,
    generatedAt: GENERATED,
    generatedBy: 'Maria Santos',
    ...over,
  });
}

const part = (bytes: Uint8Array, path: string): string => {
  const file = unzipSync(bytes)[path];
  if (!file) throw new Error(`missing ${path}`);
  return strFromU8(file);
};

/** Cheap well-formedness check: every opening tag is closed in order. */
function expectWellFormed(xml: string, label: string): void {
  const tags = xml.replace(/<\?[\s\S]*?\?>/g, '').match(/<\/?[A-Za-z][^>]*>/g) ?? [];
  const stack: string[] = [];
  for (const tag of tags) {
    if (tag.endsWith('/>')) continue;
    const name = /^<\/?([^\s>/]+)/.exec(tag)?.[1] ?? '';
    if (tag.startsWith('</')) expect(stack.pop(), `${label}: </${name}>`).toBe(name);
    else stack.push(name);
  }
  expect(stack, `${label}: unclosed tags`).toEqual([]);
}

const options = { paper: 'A4', orientation: 'landscape' } as const;
const rowsOf = (bytes: Uint8Array): unknown[][] => {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) throw new Error('no sheet');
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true });
};

describe('buildLeaveCreditsXlsx — the sheet', () => {
  const bytes = buildLeaveCreditsXlsx(reportFor(), options);

  it('has exactly one sheet, named "Leave Credits"', () => {
    const workbook = XLSX.read(bytes, { type: 'array' });
    expect(workbook.SheetNames).toEqual([SHEET_NAME]);
  });

  it('row 1 is the title, row 2 the two bands, row 3 the headers from the company sheet', () => {
    const rows = rowsOf(bytes);
    expect(rows[0]?.[0]).toBe('BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026');
    expect(rows[1]?.[0]).toBe("EMPLOYEE'S INFORMATION");
    expect(rows[1]?.[3]).toBe('USED CREDITS AND DATE');
    expect(rows[2]).toEqual([...COLUMN_HEADERS]);
    expect(rows[2]).toHaveLength(COLUMN_COUNT);
    expect(rows[2]?.slice(0, 4)).toEqual([
      'NAME',
      'POSITION',
      'LOCATION',
      'TOTAL NO. OF UNUSED LEAVE CREDITS',
    ]);
    expect(rows[2]?.slice(4, 16)).toEqual([
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ]);
    expect(rows[2]?.slice(16)).toEqual(['TOTAL OF USED LEAVE', 'TOTAL REMAINING LEAVES']);
  });

  it('merges the title across and the two bands over their columns', () => {
    const workbook = XLSX.read(bytes, { type: 'array' });
    const merges = (workbook.Sheets[SHEET_NAME]?.['!merges'] ?? []).map((m) =>
      XLSX.utils.encode_range(m),
    );
    expect(merges).toEqual(['A1:R1', 'A2:C2', 'D2:R2']);
  });

  it('writes Juan: capitals, 10 credits, Feb 2 / Mar 1 / Apr 1 / May 1, used 5, remaining 5', () => {
    const row = rowsOf(bytes)[3];
    expect(row).toEqual([
      'JUAN DELA CRUZ',
      'ACCOUNTING STAFF',
      'FINANCE',
      10,
      '',
      2,
      1,
      1,
      1,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      5,
      5,
    ]);
  });

  it('has no other sheets, rows or a totals row', () => {
    expect(rowsOf(bytes)).toHaveLength(4);
  });

  it('shows half days exactly', () => {
    const { ledger } = juan2026();
    const half = ledger.map((e, i) =>
      i === 1
        ? { ...e, days: 0.5, usedDelta: 0.5, dateFrom: '2026-02-10', dateTo: '2026-02-10' }
        : e,
    );
    const report = reportFor([makeEmployee()], {
      ledger: half,
      balances: [makeBalance({ totalCredits: 10, totalUsed: 3.5 })],
    });
    const row = rowsOf(buildLeaveCreditsXlsx(report, options))[3];
    expect(row?.[5]).toBe(0.5);
    expect(row?.[16]).toBe(3.5);
    expect(row?.[17]).toBe(6.5);
  });

  it('writes one row per employee, A–Z, and keeps formulas as text', () => {
    const report = reportFor(
      [
        makeEmployee({ id: 'z', fullName: 'Zeta' }),
        makeEmployee({ id: 'e', fullName: '=1+1', position: '@SUM(A1)' }),
        makeEmployee({ id: 'a', fullName: 'Agrida, Luriden' }),
      ],
      { balances: [], ledger: [] },
    );
    const rows = rowsOf(buildLeaveCreditsXlsx(report, options));
    expect(rows.slice(3).map((r) => r[0])).toEqual(['=1+1', 'AGRIDA, LURIDEN', 'ZETA']);
    const workbook = XLSX.read(buildLeaveCreditsXlsx(report, options), { type: 'array' });
    const cell = workbook.Sheets[SHEET_NAME]?.A4 as XLSX.CellObject;
    expect(cell.t).toBe('s');
    expect(cell.f).toBeUndefined();
  });
});

describe('buildLeaveCreditsXlsx — styles', () => {
  const full = makeBalance({ totalCredits: 10, totalUsed: 10 });
  const report = reportFor(
    [
      makeEmployee({ id: 'emp1', fullName: 'Done Person' }),
      makeEmployee({ id: 'ok', fullName: 'Ok' }),
    ],
    {
      balances: [
        full,
        makeBalance({ id: 'ok_2026', employeeId: 'ok', totalCredits: 5, totalUsed: 1 }),
      ],
      ledger: [],
    },
  );
  const bytes = buildLeaveCreditsXlsx(report, options);
  const styles = part(bytes, 'xl/styles.xml');
  const sheet = part(bytes, 'xl/worksheets/sheet1.xml');

  it('every XML part is well-formed', () => {
    for (const path of Object.keys(unzipSync(bytes)).filter((p) => /\.(xml|rels)$/.test(p))) {
      expectWellFormed(part(bytes, path), path);
    }
  });

  it('style counts equal the number of entries (Excel refuses a mismatch)', () => {
    for (const [tag, child] of [
      ['fonts', 'font'],
      ['fills', 'fill'],
      ['borders', 'border'],
      ['cellXfs', 'xf'],
    ] as const) {
      const block = new RegExp(`<${tag} count="(\\d+)"[^>]*>([\\s\\S]*?)</${tag}>`).exec(styles);
      expect(block, tag).not.toBeNull();
      const entries = (block?.[2] ?? '').match(new RegExp(`<${child}[ >/]`, 'g')) ?? [];
      expect(Number(block?.[1]), tag).toBe(entries.length);
    }
  });

  it('uses the blue and red bands, and a dark fill for a fully used row', () => {
    expect(styles).toContain('FF0070C0');
    expect(styles).toContain('FFC00000');
    expect(styles).toContain('FF404040');
  });

  it('gives every cell a style, and the dark one only to the fully used employee', () => {
    const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true });
    expect(workbook.SheetNames).toHaveLength(1);
    const cells = [...sheet.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>/g)];
    expect(cells.length).toBeGreaterThanOrEqual(COLUMN_COUNT * 5);
    expect(cells.every((c) => /\ss="\d+"/.test(c[3] ?? ''))).toBe(true);

    const styleOf = (ref: string) => new RegExp(`<c r="${ref}" s="(\\d+)"`).exec(sheet)?.[1];
    expect(styleOf('A4')).toBeDefined();
    // "Done Person" sorts first (row 4), is fully used → dark; "Ok" (row 5) is not.
    expect(styleOf('A4')).not.toBe(styleOf('A5'));
    expect(styleOf('R4')).not.toBe(styleOf('R5'));
    expect(styleOf('E4')).not.toBe(styleOf('E5'));
    // the merged title and band cells exist so their fill and borders show across the merge
    expect(styleOf('B1')).toBe(styleOf('A1'));
    expect(styleOf('B2')).toBe(styleOf('A2'));
    expect(styleOf('E2')).toBe(styleOf('D2'));
    expect(styleOf('D2')).not.toBe(styleOf('A2'));
  });
});

describe('buildLeaveCreditsXlsx — print layout', () => {
  it.each([
    ['LETTER', 'landscape', PAPER_CODES.LETTER],
    ['A4', 'landscape', PAPER_CODES.A4],
    ['A4', 'portrait', PAPER_CODES.A4],
  ] as const)('%s %s', (paper, orientation, code) => {
    const bytes = buildLeaveCreditsXlsx(reportFor(), { paper, orientation });
    const sheet = part(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain(`paperSize="${String(code)}"`);
    expect(sheet).toContain(`orientation="${orientation}"`);
    expect(sheet).toContain('fitToWidth="1" fitToHeight="0"');
    expect(sheet).toContain('<pageSetUpPr fitToPage="1"/>');
  });

  it('repeats rows 1–3 on every page, freezes them, and numbers the pages', () => {
    const bytes = buildLeaveCreditsXlsx(reportFor(), options);
    expect(part(bytes, 'xl/workbook.xml')).toContain('&apos;Leave Credits&apos;!$1:$3');
    const sheet = part(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('ySplit="3"');
    expect(sheet).toContain('topLeftCell="A4"');
    expect(sheet).toContain('Page &amp;P of &amp;N');
    expect(sheet).toContain('HR Leave Monitor — BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026');
  });

  it('keeps the worksheet children in schema order', () => {
    const sheet = part(buildLeaveCreditsXlsx(reportFor(), options), 'xl/worksheets/sheet1.xml');
    const order = [
      '<sheetPr',
      '<dimension',
      '<sheetViews',
      '<cols',
      '<sheetData',
      '<mergeCells',
      '<printOptions',
      '<pageMargins',
      '<pageSetup',
      '<headerFooter',
    ].map((tag) => sheet.indexOf(tag));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('helpers', () => {
  it('columnIndex', () => {
    expect([columnIndex('A'), columnIndex('R'), columnIndex('Z'), columnIndex('AA')]).toEqual([
      0, 17, 25, 26,
    ]);
  });

  it('patchStylesWith appends styles and bumps the counts', () => {
    const base =
      '<styleSheet><fonts count="1"><font/></fonts><fills count="2"><fill/><fill/></fills><borders count="1"><border/></borders><cellXfs count="1"><xf/></cellXfs></styleSheet>';
    const { xml, index } = patchStylesWith(base, {
      a: { font: { size: 10, color: 'FF000000' }, horizontal: 'left' },
      b: {
        font: { size: 10, color: 'FF000000' },
        fill: 'FF112233',
        border: true,
        horizontal: 'center',
      },
    });
    expect(index).toEqual({ a: 1, b: 2 });
    expect(xml).toContain('<fonts count="2">');
    expect(xml).toContain('<fills count="3">');
    expect(xml).toContain('<borders count="2">');
    expect(xml).toContain('<cellXfs count="3">');
    expect(xml).toContain('fillId="2" borderId="1"');
  });

  it('applyCellStyles sets and replaces the s attribute', () => {
    const out = applyCellStyles(
      '<c r="A1" t="s"><v>0</v></c><c r="B1" s="9"><v>1</v></c><c r="C2"/>',
      (row, column) => (row === 0 ? column + 5 : undefined),
    );
    expect(out).toBe('<c r="A1" s="5" t="s"><v>0</v></c><c r="B1" s="6"><v>1</v></c><c r="C2"/>');
  });

  it('freezeHeaderRows replaces the view', () => {
    const out = freezeHeaderRows('<sheetViews><sheetView workbookViewId="0"/></sheetViews>');
    expect(out).toContain('ySplit="3"');
    expect(out).toContain('showGridLines="0"');
  });

  it('file names are safe and name the paper', () => {
    expect(leaveCreditsFileName('BAGO PLANT LEAVE CREDITS AS OF AUGUST 2026', 'A4')).toBe(
      'BAGO-PLANT-LEAVE-CREDITS-AS-OF-AUGUST-2026_A4.xlsx',
    );
    expect(leaveCreditsFileName('../../etc/passwd  ?*', 'LETTER')).toBe('etcpasswd_Letter.xlsx');
    expect(leaveCreditsFileName('???', 'A4')).toBe('Leave-Credits_A4.xlsx');
    expect(sanitizeFilePart('')).toBe('report');
  });
});
