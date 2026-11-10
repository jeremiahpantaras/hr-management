/**
 * Canonical constants (planning/README.md §4) — the single source of truth in the app. Rules that
 * enforce the same values live in `firestore.rules` and are kept in sync by tests. Only the
 * constants in use so far are defined; later phases add the rest of the table.
 */

/** Employment statuses (Q-01). Changing these also requires a rules change and redeploy. */
export const EMPLOYMENT_STATUSES = [
  'Regular',
  'Probationary',
  'Contractual',
  'Project-Based',
  'Part-Time',
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Employee ID format (R-07). It is also a Firestore document ID, so no `/`, no leading `.`. */
export const EMPLOYEE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/;

export const EMPLOYEE_FIELD_LIMITS = { fullName: 120, position: 80, department: 80 } as const;

export const ROLES = ['hr_admin'] as const;
export const HR_ADMIN_ROLE = ROLES[0];

/** Earliest year the UI offers (Q-08). The database accepts 2000–2100. */
export const LEAVE_YEAR_UI_MIN = 2020;

/** Client-side employee table paging (README §4). */
export const EMPLOYEE_PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_EMPLOYEE_PAGE_SIZE = 25;

/** Leave amounts (README §4, D-07). Multiples of 0.5 are exact in binary floating point. */
export const DAY_STEP = 0.5;
export const MAX_DAYS_PER_ENTRY = 365;
export const REMARKS_MAX_LENGTH = 500;
export const REVERSAL_REASON_MIN_LENGTH = 3;

/** Low balance = available at or below this many days (Q-04); 0 available = depleted. */
export const LOW_BALANCE_THRESHOLD = 2;

/** The database accepts these years; the UI offers `LEAVE_YEAR_UI_MIN` … `currentYear + 1`. */
export const LEAVE_YEAR_RULES_MIN = 2000;
export const LEAVE_YEAR_RULES_MAX = 2100;

/**
 * ALLOCATION adds days, USAGE deducts them, REVERSAL undoes one of those, and ADJUSTMENT (shown as an
 * "Edit") changes the employee's total allocated days for a year — up or down, never below what is used.
 */
export const TRANSACTION_TYPES = ['ALLOCATION', 'USAGE', 'REVERSAL', 'ADJUSTMENT'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
/** The two types that can be reversed. */
export type ReversibleType = 'ALLOCATION' | 'USAGE';

/** Ledger lists page by cursor; the credits matrix pages employees (≤ 30 for Firestore `in`). */
export const LEDGER_PAGE_SIZE = 25;
export const CREDITS_MATRIX_PAGE_SIZE = 25;

/** TanStack Query freshness windows (README §4). */
export const STALE_TIME_MS = {
  employees: 5 * 60_000,
  balances: 60_000,
  ledger: 30_000,
  dashboard: 60_000,
} as const;
