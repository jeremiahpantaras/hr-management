import {
  DEFAULT_EMPLOYEE_PAGE_SIZE,
  EMPLOYEE_PAGE_SIZES,
  EMPLOYMENT_STATUSES,
} from '@/domain/constants';
import type { Employee } from '@/types/models';

/**
 * Pure list operations for the employee directory (D-09: the full list is cached once and
 * searched / filtered / sorted / paged on the client — sized for ≲ 2,000 employees, A-02).
 */
export type ArchiveFilter = 'active' | 'archived' | 'all';
export type EmployeeSortKey = 'employeeNumber' | 'fullName' | 'position';
export type SortDirection = 'asc' | 'desc';

export interface EmployeeFilters {
  readonly query: string;
  /** '' = every status. */
  readonly status: string;
  readonly archive: ArchiveFilter;
}

export interface EmployeeSort {
  readonly key: EmployeeSortKey;
  readonly direction: SortDirection;
}

export const DEFAULT_SORT: EmployeeSort = { key: 'fullName', direction: 'asc' };

/** Case-insensitive substring match on name or Employee ID (FR-EMP-03). */
export function matchesQuery(employee: Employee, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    employee.fullName.toLowerCase().includes(needle) ||
    employee.employeeNumber.toLowerCase().includes(needle)
  );
}

export function filterEmployees(
  employees: readonly Employee[],
  filters: EmployeeFilters,
): Employee[] {
  return employees.filter((employee) => {
    if (filters.archive === 'active' && employee.isArchived) return false;
    if (filters.archive === 'archived' && !employee.isArchived) return false;
    if (filters.status !== '' && employee.employmentStatus !== filters.status) return false;
    return matchesQuery(employee, filters.query);
  });
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function sortEmployees(employees: readonly Employee[], sort: EmployeeSort): Employee[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...employees].sort((a, b) => {
    const result = collator.compare(a[sort.key], b[sort.key]);
    // Stable, deterministic tie-break so equal names never shuffle between renders.
    return result !== 0 ? result * factor : collator.compare(a.employeeNumber, b.employeeNumber);
  });
}

export interface Page<T> {
  readonly items: T[];
  /** The page actually shown (clamped into range). */
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

/** 1-based paging; an out-of-range page is clamped rather than shown empty. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: current, pageCount, total };
}

// ── URL <-> state (filters live in the query string so pages are shareable) ─────────────────

export function parseArchiveFilter(raw: string | null): ArchiveFilter {
  return raw === 'archived' || raw === 'all' ? raw : 'active';
}

export function parseStatusFilter(raw: string | null): string {
  return EMPLOYMENT_STATUSES.some((status) => status === raw) ? (raw ?? '') : '';
}

export function parsePage(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

export function parsePageSize(raw: string | null): number {
  const value = Number(raw);
  return EMPLOYEE_PAGE_SIZES.some((size) => size === value) ? value : DEFAULT_EMPLOYEE_PAGE_SIZE;
}

export function parseSort(sortRaw: string | null, directionRaw: string | null): EmployeeSort {
  const key: EmployeeSortKey | null =
    sortRaw === 'employeeNumber' || sortRaw === 'fullName' || sortRaw === 'position'
      ? sortRaw
      : null;
  if (key === null) return DEFAULT_SORT;
  return { key, direction: directionRaw === 'desc' ? 'desc' : 'asc' };
}

/** Options for pickers (BR-EMP-04: archived employees cannot receive new entries). */
export function selectableEmployees(
  employees: readonly Employee[],
  options: { includeArchived?: boolean } = {},
): Employee[] {
  return sortEmployees(
    employees.filter((employee) => options.includeArchived === true || !employee.isArchived),
    DEFAULT_SORT,
  );
}
