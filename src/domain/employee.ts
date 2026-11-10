/**
 * Employee-ID uniqueness key (D-08): trimmed and upper-cased, so `emp-1` and `EMP-1` collide. It
 * must equal what the Security Rules compute (`employeeNumber.upper()`); the permitted ID format is
 * ASCII-only, so JavaScript's `toUpperCase` and the rules' `upper()` agree.
 */
export function normalizeEmployeeNumber(employeeNumber: string): string {
  return employeeNumber.trim().toUpperCase();
}
