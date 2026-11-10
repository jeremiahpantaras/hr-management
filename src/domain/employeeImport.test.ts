import { describe, expect, it } from 'vitest';

import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  cellText,
  normalizeStatus,
  parseEmployeeRows,
  summarizeImport,
} from '@/domain/employeeImport';

const HEADER = [...IMPORT_COLUMNS];
const none = new Set<string>();

function parse(rows: unknown[][], existing: Set<string> = none) {
  const result = parseEmployeeRows([HEADER, ...rows], existing);
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

describe('cellText / normalizeStatus', () => {
  it('turns cells into trimmed text; numbers keep their digits', () => {
    expect(cellText('  Juan  ')).toBe('Juan');
    expect(cellText(1001)).toBe('1001');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(NaN)).toBe('');
    expect(cellText(new Date(Date.UTC(2026, 1, 10)))).toBe('2026-02-10');
  });
  it('matches statuses ignoring case, spaces and hyphens', () => {
    expect(normalizeStatus('regular')).toBe('Regular');
    expect(normalizeStatus('project based')).toBe('Project-Based');
    expect(normalizeStatus('PART-TIME')).toBe('Part-Time');
    expect(normalizeStatus('Intern')).toBe('Intern'); // unknown stays as typed → rejected by the schema
  });
});

describe('header detection', () => {
  it('accepts the template header and common aliases, in any column order', () => {
    const result = parseEmployeeRows(
      [
        ['Status', 'Full Name', 'ID', 'Job Title', 'Dept'],
        ['Regular', 'Juan Dela Cruz', 'EMP-0042', 'Accountant', 'Finance'],
      ],
      none,
    );
    expect(result.ok && result.rows[0]).toMatchObject({
      employeeNumber: 'EMP-0042',
      fullName: 'Juan Dela Cruz',
      position: 'Accountant',
      department: 'Finance',
      employmentStatus: 'Regular',
      status: 'ready',
    });
  });
  it('finds the header below a title row', () => {
    const result = parseEmployeeRows(
      [['Employee list'], [], HEADER, ['EMP-1', 'Ana', 'Clerk', '', 'Regular']],
      none,
    );
    expect(result).toMatchObject({ ok: true, headerRow: 3 });
    expect(result.ok && result.rows[0]?.rowNumber).toBe(4);
  });
  it('accepts the old "Department" header as a synonym for Location', () => {
    const result = parseEmployeeRows(
      [
        ['Employee ID', 'Complete Name', 'Position', 'Department', 'Employment Status'],
        ['E1', 'Ana', 'Clerk', 'Plant 1', 'Regular'],
      ],
      none,
    );
    expect(result.ok && result.rows[0]?.department).toBe('Plant 1');
    const location = parseEmployeeRows(
      [
        ['Employee ID', 'Complete Name', 'Position', 'Location', 'Employment Status'],
        ['E1', 'Ana', 'Clerk', 'Plant 2', 'Regular'],
      ],
      none,
    );
    expect(location.ok && location.rows[0]?.department).toBe('Plant 2');
  });
  it('Location is optional; the other four are required', () => {
    expect(
      parseEmployeeRows(
        [
          ['Employee ID', 'Complete Name', 'Position', 'Employment Status'],
          ['E1', 'A', 'B', 'Regular'],
        ],
        none,
      ).ok,
    ).toBe(true);
    const missing = parseEmployeeRows(
      [
        ['Employee ID', 'Complete Name', 'Department'],
        ['E1', 'A', 'B'],
      ],
      none,
    );
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.error).toContain("couldn't find the header row");
  });
  it('rejects an empty file and a header with no data', () => {
    expect(parseEmployeeRows([], none).ok).toBe(false);
    const noRows = parseEmployeeRows([HEADER], none);
    expect(!noRows.ok && noRows.error).toContain(
      'no employees yet. Add one employee per row under the header (starting at row 2)',
    );
  });
});

describe('row validation uses the same rules as the Add-employee form', () => {
  it('a valid row is ready and yields the exact service input (blank department → null)', () => {
    const [row] = parse([[' emp-0042 ', '  Juan Dela Cruz ', 'Accountant', '', 'regular']]);
    expect(row).toMatchObject({ status: 'ready', messages: [], rowNumber: 2 });
    expect(row?.input).toEqual({
      employeeNumber: 'emp-0042',
      fullName: 'Juan Dela Cruz',
      position: 'Accountant',
      department: null,
      employmentStatus: 'Regular',
    });
  });
  it('reports the exact form messages, once each', () => {
    const [row] = parse([['bad/id', '', '', 'x'.repeat(81), 'Intern']]);
    expect(row?.status).toBe('invalid');
    expect(row?.input).toBeNull();
    expect(row?.messages).toEqual(
      expect.arrayContaining([
        'Use letters, numbers, dots, dashes or underscores (max 30).',
        "Enter the employee's complete name.",
        'Enter a position.',
        'Location is too long (80 characters max).',
        'Select an employment status.',
      ]),
    );
    expect(new Set(row?.messages).size).toBe(row?.messages.length);
  });
  it.each([['a/b'], ['.hidden'], ['x'.repeat(31)], [''], ['   ']])(
    'rejects the Employee ID %j',
    (id) => {
      expect(parse([[id, 'Name', 'Pos', '', 'Regular']])[0]?.status).toBe('invalid');
    },
  );
  it('an Employee ID typed as a number is read as text', () => {
    expect(parse([[1001, 'Name', 'Pos', '', 'Regular']])[0]?.input?.employeeNumber).toBe('1001');
  });
  it('skips fully blank rows but keeps real row numbers', () => {
    const rows = parse([
      ['E1', 'A', 'B', '', 'Regular'],
      [],
      ['', '', '', '', ''],
      ['E2', 'C', 'D', '', 'Regular'],
    ]);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 5]);
  });
  it('ignores extra columns such as the Record Status of an export', () => {
    const result = parseEmployeeRows(
      [
        [...HEADER, 'Record Status'],
        ['E1', 'A', 'B', '', 'Regular', 'Archived'],
      ],
      none,
    );
    expect(result.ok && result.rows[0]?.status).toBe('ready');
  });
  it('a formula-looking value is plain text, never evaluated', () => {
    const [row] = parse([['E1', '=1+1', '=cmd()', '@x', 'Regular']]);
    expect(row?.input?.fullName).toBe('=1+1');
  });
});

describe('duplicates (BR-EMP-01: case-insensitive)', () => {
  it('flags a repeated ID inside the file, pointing at the first row', () => {
    const rows = parse([
      ['EMP-1', 'A', 'P', '', 'Regular'],
      ['emp-1', 'B', 'P', '', 'Regular'],
      ['EMP-2', 'C', 'P', '', 'Regular'],
    ]);
    expect(rows.map((r) => r.status)).toEqual(['ready', 'duplicateInFile', 'ready']);
    expect(rows[1]?.messages).toEqual(['Same employee ID as row 2.']);
    expect(rows[1]?.input).toBeNull();
  });
  it('flags an ID that already exists (archived employees included), any case', () => {
    const rows = parse(
      [
        ['emp-0042', 'A', 'P', '', 'Regular'],
        ['EMP-0043', 'B', 'P', '', 'Regular'],
      ],
      new Set(['EMP-0042']),
    );
    expect(rows[0]).toMatchObject({
      status: 'alreadyExists',
      messages: ['This employee ID is already in use.'],
    });
    expect(rows[1]?.status).toBe('ready');
  });
  it('an invalid row never "reserves" its ID', () => {
    const rows = parse([
      ['EMP-1', '', 'P', '', 'Regular'],
      ['EMP-1', 'Real', 'P', '', 'Regular'],
    ]);
    expect(rows.map((r) => r.status)).toEqual(['invalid', 'ready']);
  });
});

describe('limits and summary', () => {
  it(`rejects more than ${String(MAX_IMPORT_ROWS)} rows`, () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [
      `E${String(i)}`,
      'N',
      'P',
      '',
      'Regular',
    ]);
    const result = parseEmployeeRows([HEADER, ...rows], none);
    expect(!result.ok && result.error).toContain('Import at most 500 employees at a time');
    expect(parseEmployeeRows([HEADER, ...rows.slice(0, MAX_IMPORT_ROWS)], none).ok).toBe(true);
  });
  it('summarizes ready vs problem rows', () => {
    const rows = parse([
      ['E1', 'A', 'P', '', 'Regular'],
      ['', 'B', 'P', '', 'Regular'],
      ['E1', 'C', 'P', '', 'Regular'],
    ]);
    expect(summarizeImport(rows)).toEqual({ total: 3, ready: 1, problems: 2 });
  });
});
