import { EMPLOYMENT_STATUSES } from '@/domain/constants';
import { normalizeEmployeeNumber } from '@/domain/employee';
import { employeeSchema, type EmployeeInput } from '@/domain/schemas/employee';

/**
 * Pure parsing and validation of an employee spreadsheet (already read into rows of cells by the
 * Excel layer). Every row gets a verdict BEFORE anything is written, using the same schema as the
 * Add-employee form, so an import can never create a record the form would refuse.
 */

/** The columns of the template and of an export (an exported file can be imported again). */
export const IMPORT_COLUMNS = [
  'Employee ID',
  'Complete Name',
  'Position',
  'Department',
  'Employment Status',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const REQUIRED: readonly ImportColumn[] = [
  'Employee ID',
  'Complete Name',
  'Position',
  'Employment Status',
];

/** Header spellings accepted for each column (compared lower-case, ignoring spaces and punctuation). */
const ALIASES: Record<ImportColumn, readonly string[]> = {
  'Employee ID': ['employeeid', 'employeeno', 'employeenumber', 'empid', 'empno', 'id'],
  'Complete Name': ['completename', 'fullname', 'name', 'employeename'],
  Position: ['position', 'jobtitle', 'title'],
  Department: ['department', 'dept'],
  'Employment Status': ['employmentstatus', 'status', 'employmenttype'],
};

const squash = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export type ImportStatus = 'ready' | 'invalid' | 'duplicateInFile' | 'alreadyExists';

export interface ImportRow {
  /** The row number in the spreadsheet (1-based), so messages match what the user sees. */
  readonly rowNumber: number;
  readonly employeeNumber: string;
  readonly fullName: string;
  readonly position: string;
  readonly department: string;
  readonly employmentStatus: string;
  readonly status: ImportStatus;
  readonly messages: readonly string[];
  /** Present only for `ready` rows: exactly what `createEmployee` receives. */
  readonly input: EmployeeInput | null;
}

export type ImportParse =
  | { readonly ok: true; readonly rows: readonly ImportRow[]; readonly headerRow: number }
  | { readonly ok: false; readonly error: string };

/** Spreadsheet cell → trimmed text. Numbers keep their digits (an ID typed as 1001 is "1001"). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim();
  return '';
}

/** `project based`, `PROJECT-BASED`, `part time` → the canonical status; anything else stays as typed. */
export function normalizeStatus(value: string): string {
  const wanted = squash(value);
  return EMPLOYMENT_STATUSES.find((status) => squash(status) === wanted) ?? value;
}

interface Header {
  readonly row: number;
  readonly columns: Map<ImportColumn, number>;
}

function findHeader(matrix: readonly (readonly unknown[])[]): Header | null {
  for (let row = 0; row < Math.min(matrix.length, 10); row += 1) {
    const cells = matrix[row] ?? [];
    const columns = new Map<ImportColumn, number>();
    cells.forEach((cell, index) => {
      const key = squash(cellText(cell));
      if (key === '') return;
      for (const column of IMPORT_COLUMNS) {
        if (!columns.has(column) && ALIASES[column].includes(key)) columns.set(column, index);
      }
    });
    if (REQUIRED.every((column) => columns.has(column))) return { row, columns };
  }
  return null;
}

/**
 * @param matrix  the first sheet as rows of cells (as read from the file)
 * @param existingKeys  upper-cased Employee IDs already in the database (archived included)
 */
export function parseEmployeeRows(
  matrix: readonly (readonly unknown[])[],
  existingKeys: ReadonlySet<string>,
): ImportParse {
  const header = findHeader(matrix);
  if (header === null) {
    return {
      ok: false,
      error: `We couldn't find the header row. The first sheet needs these columns: ${REQUIRED.join(', ')} (Department is optional). Download the template to start from.`,
    };
  }

  const get = (cells: readonly unknown[], column: ImportColumn): string => {
    const index = header.columns.get(column);
    return index === undefined ? '' : cellText(cells[index]);
  };

  const rows: ImportRow[] = [];
  const firstSeen = new Map<string, number>();
  for (let index = header.row + 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? [];
    const values = {
      employeeNumber: get(cells, 'Employee ID'),
      fullName: get(cells, 'Complete Name'),
      position: get(cells, 'Position'),
      department: get(cells, 'Department'),
      employmentStatus: normalizeStatus(get(cells, 'Employment Status')),
    };
    if (Object.values(values).every((value) => value === '')) continue; // blank row
    const rowNumber = index + 1;

    const parsed = employeeSchema.safeParse(values);
    const messages: string[] = [];
    let status: ImportStatus = 'ready';
    let input: EmployeeInput | null = null;

    if (!parsed.success) {
      status = 'invalid';
      const seen = new Set<string>();
      for (const issue of parsed.error.issues) {
        if (!seen.has(issue.message)) {
          seen.add(issue.message);
          messages.push(issue.message);
        }
      }
    } else {
      input = parsed.data;
      const key = normalizeEmployeeNumber(parsed.data.employeeNumber);
      const earlier = firstSeen.get(key);
      if (earlier !== undefined) {
        status = 'duplicateInFile';
        messages.push(`Same employee ID as row ${String(earlier)}.`);
        input = null;
      } else {
        firstSeen.set(key, rowNumber);
        if (existingKeys.has(key)) {
          status = 'alreadyExists';
          messages.push('This employee ID is already in use.');
          input = null;
        }
      }
    }
    rows.push({ rowNumber, ...values, status, messages, input });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        'This file has the header row but no employees yet. Add one employee per row under the header (starting at row 2), save the file, and choose it again.',
    };
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `The file has ${String(rows.length)} rows. Import at most ${String(MAX_IMPORT_ROWS)} employees at a time.`,
    };
  }
  return { ok: true, rows, headerRow: header.row + 1 };
}

export interface ImportSummary {
  readonly total: number;
  readonly ready: number;
  readonly problems: number;
}

export function summarizeImport(rows: readonly ImportRow[]): ImportSummary {
  const ready = rows.filter((row) => row.status === 'ready').length;
  return { total: rows.length, ready, problems: rows.length - ready };
}
