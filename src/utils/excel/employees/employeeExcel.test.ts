// @vitest-environment node
// (fflate checks `instanceof Uint8Array`; jsdom replaces that global, so the zip layer is tested in Node.)
import { strFromU8, unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { EMPLOYMENT_STATUSES } from '@/domain/constants';
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, parseEmployeeRows } from '@/domain/employeeImport';
import { makeEmployee } from '@/domain/testFixtures';
import {
  EXPORT_HEADERS,
  buildEmployeesXlsx,
  buildTemplateXlsx,
  exportFileName,
  readFirstSheet,
  templateFileName,
} from '@/utils/excel/employees/employeeExcel';
import {
  HEADER_STYLE,
  PAPER_CODES,
  TEXT_STYLE,
  footerCode,
  patchStylesXml,
  patchWorksheetXml,
  type PrintLayout,
} from '@/utils/excel/xlsxPatch';

const NOW = new Date(2026, 10, 9, 14, 5);
const juan = makeEmployee();
const ana = makeEmployee({
  id: 'ana',
  employeeNumber: 'EMP-0043',
  fullName: 'Ana Reyes',
  position: 'HR Officer',
  department: null,
  employmentStatus: 'Probationary',
});
const mario = makeEmployee({
  id: 'mario',
  employeeNumber: '0100',
  fullName: '=1+1',
  position: '@SUM(A1)',
  isArchived: true,
});

/** Cheap well-formedness check: every opening tag is closed in order. */
function expectWellFormed(xml: string, label = 'xml'): void {
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

const part = (bytes: Uint8Array, path: string): string => {
  const file = unzipSync(bytes)[path];
  if (!file) throw new Error(`missing ${path}`);
  return strFromU8(file);
};

describe('paper sizes (SpreadsheetML paperSize codes)', () => {
  it('Letter is 1 and A4 is 9', () => {
    expect(PAPER_CODES).toEqual({ LETTER: 1, A4: 9 });
  });

  it.each([
    ['LETTER', 'landscape', '1'],
    ['LETTER', 'portrait', '1'],
    ['A4', 'landscape', '9'],
    ['A4', 'portrait', '9'],
  ] as const)(
    '%s %s writes paperSize=%s, fit to one page wide, any number tall',
    (paper, orientation, code) => {
      const sheet = part(
        buildEmployeesXlsx([juan], { paper, orientation }, NOW),
        'xl/worksheets/sheet1.xml',
      );
      expect(sheet).toContain(
        `<pageSetup paperSize="${code}" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>`,
      );
      expect(sheet).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    },
  );
});

describe('print layout in the worksheet XML', () => {
  const xml = part(
    buildEmployeesXlsx([juan, ana], { paper: 'A4', orientation: 'landscape' }, NOW),
    'xl/worksheets/sheet1.xml',
  );

  it('elements appear in the order the OOXML schema requires (Excel repairs files that break it)', () => {
    const order = [
      '<sheetPr>',
      '<dimension',
      '<sheetViews>',
      '<cols>',
      '<sheetData>',
      '<autoFilter',
      '<printOptions',
      '<pageMargins',
      '<pageSetup',
      '<headerFooter>',
    ];
    const positions = order.map((tag) => xml.indexOf(tag));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('has 0.5/0.75 inch margins, centres the table horizontally, and prints "Page x of y" in the footer', () => {
    expect(xml).toContain(
      '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>',
    );
    expect(xml).toContain('<printOptions horizontalCentered="1"/>');
    expect(xml).toMatch(
      /<oddFooter>&amp;L&amp;8HR Leave Monitor — Employees&amp;C&amp;8Page &amp;P of &amp;N&amp;R&amp;8Printed 2026-11-09<\/oddFooter>/,
    );
  });

  it('freezes the header row and styles it', () => {
    expect(xml).toContain(
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    );
    const header = /<row r="1"[^>]*>[\s\S]*?<\/row>/.exec(xml)?.[0] ?? '';
    expect(header).toContain('customHeight="1"');
    expect(header.match(new RegExp(`<c s="${String(HEADER_STYLE)}" `, 'g'))).toHaveLength(
      EXPORT_HEADERS.length,
    );
    const body = xml.slice(xml.indexOf('<row r="2"'));
    expect(body).not.toContain(`s="${String(HEADER_STYLE)}"`);
  });

  it('is well-formed XML', () => {
    expectWellFormed(xml, 'sheet1');
  });

  it('repeats the header row on every printed page (Print_Titles) and keeps the filter', () => {
    const workbook = part(
      buildEmployeesXlsx([juan], { paper: 'LETTER', orientation: 'landscape' }, NOW),
      'xl/workbook.xml',
    );
    expect(workbook).toContain(
      '<definedName name="_xlnm.Print_Titles" localSheetId="0">Employees!$1:$1</definedName>',
    );
    expect(xml).toMatch(/<autoFilter ref="A1:F3"\/>/);
  });
});

describe('styles.xml patch', () => {
  const styles = part(
    buildEmployeesXlsx([juan], { paper: 'A4', orientation: 'portrait' }, NOW),
    'xl/styles.xml',
  );
  const count = (tag: string) => Number(new RegExp(`<${tag} count="(\\d+)"`).exec(styles)?.[1]);
  const items = (tag: string, child: string) => {
    const inner = new RegExp(`<${tag} [^>]*>([\\s\\S]*?)</${tag}>`).exec(styles)?.[1] ?? '';
    return (inner.match(new RegExp(`<${child}[ >/]`, 'g')) ?? []).length;
  };

  it('keeps every count attribute equal to the number of entries (a mismatch makes Excel "repair" the file)', () => {
    expect(count('fonts')).toBe(items('fonts', 'font'));
    expect(count('fills')).toBe(items('fills', 'fill'));
    expect(count('borders')).toBe(items('borders', 'border'));
    expect(count('cellXfs')).toBe(items('cellXfs', 'xf'));
  });
  it('adds a bold font, a pink fill and a bottom border behind the header style', () => {
    expect(count('fonts')).toBe(2);
    expect(styles).toContain('<b/>');
    expect(styles).toContain('FFFCE7F3');
    expect(styles).toContain('<bottom style="thin">');
    expect(HEADER_STYLE).toBe(1);
    expect(TEXT_STYLE).toBe(2);
  });
  it('is well-formed', () => {
    expectWellFormed(styles, 'styles');
  });
  it('patchStylesXml throws on something that is not SheetJS output', () => {
    expect(() => patchStylesXml('<styleSheet/>')).toThrow();
  });
});

describe('footer text', () => {
  const layout: PrintLayout = {
    paper: 'A4',
    orientation: 'landscape',
    footerLeft: 'R&D <Team>',
    footerRight: 'x',
  };
  it('escapes XML and doubles & so a label cannot inject header/footer codes', () => {
    const code = footerCode(layout);
    expect(code).toContain('R&amp;&amp;D &lt;Team&gt;');
    expect(code).not.toContain('<Team>');
  });
  it('patchWorksheetXml also works on a sheet with no pageMargins at all', () => {
    const bare =
      '<?xml version="1.0"?><worksheet xmlns="x"><dimension ref="A1"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData><row r="1"><c r="A1" t="str"><v>h</v></c></row></sheetData></worksheet>';
    const out = patchWorksheetXml(bare, layout, { header: true });
    expect(out).toContain('<pageMargins');
    expect(out.indexOf('<pageMargins')).toBeLessThan(out.indexOf('<pageSetup'));
    expect(out.indexOf('<pageSetup')).toBeLessThan(out.indexOf('</worksheet>'));
  });
});

describe('export content (round trip)', () => {
  it('writes the six columns and one row per employee, with text kept as text', () => {
    const bytes = buildEmployeesXlsx(
      [juan, ana, mario],
      { paper: 'LETTER', orientation: 'portrait' },
      NOW,
    );
    const rows = readFirstSheet(bytes);
    expect(rows[0]).toEqual([...EXPORT_HEADERS]);
    expect(rows[1]).toEqual([
      'EMP-0042',
      'Juan Dela Cruz',
      'Accounting Staff',
      'Finance',
      'Regular',
      'Active',
    ]);
    expect(rows[2]?.[3]).toBe(''); // no department → blank cell
    expect(rows[3]).toEqual(['0100', '=1+1', '@SUM(A1)', 'Finance', 'Regular', 'Archived']);
    expect(rows).toHaveLength(4);
  });
  it('a name such as =1+1 is a string cell, never a formula', () => {
    const wb = XLSX.read(
      buildEmployeesXlsx([mario], { paper: 'A4', orientation: 'landscape' }, NOW),
      { type: 'array' },
    );
    const cell = wb.Sheets.Employees!.B2 as XLSX.CellObject;
    expect(cell.f).toBeUndefined();
    expect(cell.v).toBe('=1+1');
  });
  it('an exported file imports again (the data columns are the template columns)', () => {
    const rows = readFirstSheet(
      buildEmployeesXlsx([juan, ana], { paper: 'A4', orientation: 'landscape' }, NOW),
    );
    const parsed = parseEmployeeRows(rows, new Set());
    expect(parsed.ok && parsed.rows.map((r) => [r.employeeNumber, r.status])).toEqual([
      ['EMP-0042', 'ready'],
      ['EMP-0043', 'ready'],
    ]);
  });
  it('an empty export still has its header row, so the file opens correctly', () => {
    const rows = readFirstSheet(
      buildEmployeesXlsx([], { paper: 'A4', orientation: 'landscape' }, NOW),
    );
    expect(rows).toEqual([[...EXPORT_HEADERS]]);
  });
  it('a large export keeps every row', () => {
    const many = Array.from({ length: 1200 }, (_, i) =>
      makeEmployee({ id: `e${String(i)}`, employeeNumber: `E${String(i)}` }),
    );
    expect(
      readFirstSheet(buildEmployeesXlsx(many, { paper: 'LETTER', orientation: 'landscape' }, NOW))
        .length,
    ).toBe(1201);
  });
});

describe('import template', () => {
  const bytes = buildTemplateXlsx('A4', NOW);
  it('has an Employees sheet with only the header row, and an Instructions sheet', () => {
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Employees', 'Instructions']);
    expect(readFirstSheet(bytes)).toEqual([[...IMPORT_COLUMNS]]);
    const text = XLSX.utils
      .sheet_to_json<string[]>(wb.Sheets.Instructions!, { header: 1 })
      .flat()
      .join('\n');
    expect(text).toContain(EMPLOYMENT_STATUSES.join(', '));
    expect(text).toContain(String(MAX_IMPORT_ROWS));
  });
  it('has an Employment Status dropdown, Employee ID formatted as text, and page setup on both sheets', () => {
    const sheet1 = part(bytes, 'xl/worksheets/sheet1.xml');
    expect(sheet1).toContain(`<dataValidation type="list"`);
    expect(sheet1).toContain(`sqref="E2:E${String(MAX_IMPORT_ROWS + 1)}"`);
    expect(sheet1).toContain(
      '<formula1>"Regular,Probationary,Contractual,Project-Based,Part-Time"</formula1>',
    );
    expect(sheet1).toMatch(/<col min="1" max="1" style="2"/);
    expect(sheet1.indexOf('<dataValidations')).toBeLessThan(sheet1.indexOf('<printOptions'));
    const sheet2 = part(bytes, 'xl/worksheets/sheet2.xml');
    for (const xml of [sheet1, sheet2]) expect(xml).toContain('<pageSetup paperSize="9"');
    expect(sheet2).not.toContain('state="frozen"'); // header treatment only on sheet 1
  });
  it('is well-formed XML on both sheets', () => {
    for (const path of [
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/styles.xml',
      'xl/workbook.xml',
    ]) {
      expectWellFormed(part(bytes, path), path);
    }
  });
});

describe('reading uploads', () => {
  it('reads only the first sheet and numbers as numbers', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([[...IMPORT_COLUMNS], [1001, 'A', 'B', '', 'Regular']]),
      'First',
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ignored']]), 'Second');
    const rows = readFirstSheet(
      new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer),
    );
    expect(rows[1]?.[0]).toBe(1001);
    expect(rows).toHaveLength(2);
  });
  it('does not evaluate formulas (the cached value is what is read)', () => {
    const sheet = XLSX.utils.aoa_to_sheet([[...IMPORT_COLUMNS]]);
    sheet.A2 = { t: 's', v: 'cached', f: 'HYPERLINK("http://evil","x")' };
    sheet['!ref'] = 'A1:E2';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'S');
    const rows = readFirstSheet(
      new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer),
    );
    expect(rows[1]?.[0]).toBe('cached');
  });
  it('throws a plain error for something that is not a workbook', () => {
    expect(() => readFirstSheet(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe('file names', () => {
  it('say which paper the layout is for', () => {
    expect(exportFileName({ paper: 'LETTER', orientation: 'landscape' }, NOW)).toBe(
      'Employees_Letter_20261109-1405.xlsx',
    );
    expect(exportFileName({ paper: 'A4', orientation: 'portrait' }, NOW)).toBe(
      'Employees_A4_20261109-1405.xlsx',
    );
    expect(templateFileName('A4')).toBe('Employee-import-template_A4.xlsx');
    expect(templateFileName('LETTER')).toBe('Employee-import-template_Letter.xlsx');
  });
});
