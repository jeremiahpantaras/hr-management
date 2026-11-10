import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SORT,
  filterEmployees,
  matchesQuery,
  paginate,
  parseArchiveFilter,
  parsePage,
  parsePageSize,
  parseSort,
  parseStatusFilter,
  selectableEmployees,
  sortEmployees,
} from '@/domain/employeeList';
import type { Employee } from '@/types/models';

function employee(overrides: Partial<Employee> & { id: string }): Employee {
  return {
    employeeNumber: overrides.id.toUpperCase(),
    employeeNumberKey: overrides.id.toUpperCase(),
    fullName: `Person ${overrides.id}`,
    position: 'Staff',
    department: null,
    employmentStatus: 'Regular',
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdAt: null,
    createdBy: 'hr1',
    updatedAt: null,
    updatedBy: 'hr1',
    ...overrides,
  };
}

const juan = employee({
  id: 'e1',
  employeeNumber: 'EMP-0042',
  fullName: 'Juan Dela Cruz',
  position: 'Accounting Staff',
});
const ana = employee({
  id: 'e2',
  employeeNumber: 'EMP-0043',
  fullName: 'Ana Reyes',
  employmentStatus: 'Probationary',
});
const mario = employee({
  id: 'e3',
  employeeNumber: 'EMP-0100',
  fullName: 'Mario Santos',
  isArchived: true,
  employmentStatus: 'Contractual',
});
const all = [juan, ana, mario];

describe('search (TC-EMP-09)', () => {
  it.each([
    ['juan', ['e1']],
    ['JUAN', ['e1']],
    ['dela', ['e1']],
    ['0042', ['e1']],
    ['emp-004', ['e1', 'e2']],
    ['  ana  ', ['e2']],
    ['zzz', []],
    ['', ['e1', 'e2', 'e3']],
  ])('"%s" matches name or Employee ID, case-insensitively', (query, ids) => {
    expect(all.filter((e) => matchesQuery(e, query)).map((e) => e.id)).toEqual(ids);
  });

  it('does not match on position or department', () => {
    expect(matchesQuery(juan, 'accounting')).toBe(false);
  });
});

describe('filters (TC-EMP-04/08/10)', () => {
  const filters = { query: '', status: '', archive: 'active' as const };

  it('default view is Active employees only (BR-EMP-05)', () => {
    expect(filterEmployees(all, filters).map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it.each([
    ['archived', ['e3']],
    ['all', ['e1', 'e2', 'e3']],
  ] as const)('archive=%s', (archive, ids) => {
    expect(filterEmployees(all, { ...filters, archive }).map((e) => e.id)).toEqual(ids);
  });

  it('filters by employment status', () => {
    expect(
      filterEmployees(all, { ...filters, archive: 'all', status: 'Contractual' }).map((e) => e.id),
    ).toEqual(['e3']);
  });

  it('combines search, status and archive filters', () => {
    expect(
      filterEmployees(all, { query: 'ana', status: 'Probationary', archive: 'active' }).map(
        (e) => e.id,
      ),
    ).toEqual(['e2']);
    expect(filterEmployees(all, { query: 'ana', status: 'Regular', archive: 'active' })).toEqual(
      [],
    );
  });
});

describe('sorting', () => {
  it('sorts by name A–Z by default and Z–A when descending', () => {
    expect(sortEmployees(all, DEFAULT_SORT).map((e) => e.fullName)).toEqual([
      'Ana Reyes',
      'Juan Dela Cruz',
      'Mario Santos',
    ]);
    expect(
      sortEmployees(all, { key: 'fullName', direction: 'desc' }).map((e) => e.fullName),
    ).toEqual(['Mario Santos', 'Juan Dela Cruz', 'Ana Reyes']);
  });

  it('sorts Employee IDs naturally (EMP-2 before EMP-10)', () => {
    const list = [
      employee({ id: 'a', employeeNumber: 'EMP-10' }),
      employee({ id: 'b', employeeNumber: 'EMP-2' }),
    ];
    expect(
      sortEmployees(list, { key: 'employeeNumber', direction: 'asc' }).map((e) => e.employeeNumber),
    ).toEqual(['EMP-2', 'EMP-10']);
  });

  it('is case-insensitive and does not mutate its input', () => {
    const list = [employee({ id: 'a', fullName: 'zed' }), employee({ id: 'b', fullName: 'Alice' })];
    const copy = [...list];
    expect(sortEmployees(list, DEFAULT_SORT).map((e) => e.fullName)).toEqual(['Alice', 'zed']);
    expect(list).toEqual(copy);
  });

  it('breaks ties by Employee ID so equal names never shuffle', () => {
    const list = [
      employee({ id: 'b', employeeNumber: 'EMP-2', fullName: 'Same' }),
      employee({ id: 'a', employeeNumber: 'EMP-1', fullName: 'Same' }),
    ];
    expect(sortEmployees(list, DEFAULT_SORT).map((e) => e.employeeNumber)).toEqual([
      'EMP-1',
      'EMP-2',
    ]);
  });
});

describe('pagination (87 employees, TC-EMP-10)', () => {
  const rows = Array.from({ length: 87 }, (_, i) => i);

  it.each([
    [1, 25, 25, 4],
    [4, 25, 12, 4],
    [2, 10, 10, 9],
    [1, 50, 50, 2],
  ])('page %i of size %i has %i rows and %i pages', (page, size, rowCount, pageCount) => {
    const result = paginate(rows, page, size);
    expect(result.items).toHaveLength(rowCount);
    expect(result.pageCount).toBe(pageCount);
    expect(result.total).toBe(87);
  });

  it('returns the right slice', () => {
    expect(paginate(rows, 2, 25).items[0]).toBe(25);
    expect(paginate(rows, 4, 25).items.at(-1)).toBe(86);
  });

  it('clamps an out-of-range page instead of showing an empty one', () => {
    expect(paginate(rows, 99, 25).page).toBe(4);
    expect(paginate(rows, 0, 25).page).toBe(1);
    expect(paginate(rows, -3, 25).page).toBe(1);
  });

  it('handles an empty list and an exact multiple', () => {
    expect(paginate([], 1, 25)).toMatchObject({ items: [], page: 1, pageCount: 1, total: 0 });
    expect(
      paginate(
        Array.from({ length: 25 }, (_, i) => i),
        1,
        25,
      ).pageCount,
    ).toBe(1);
    expect(
      paginate(
        Array.from({ length: 26 }, (_, i) => i),
        2,
        25,
      ).items,
    ).toEqual([25]);
  });
});

describe('URL parsing falls back safely', () => {
  it('archive filter', () => {
    expect(parseArchiveFilter('archived')).toBe('archived');
    expect(parseArchiveFilter('all')).toBe('all');
    expect(parseArchiveFilter('active')).toBe('active');
    expect(parseArchiveFilter('junk')).toBe('active');
    expect(parseArchiveFilter(null)).toBe('active');
  });

  it('status filter accepts only known statuses', () => {
    expect(parseStatusFilter('Regular')).toBe('Regular');
    expect(parseStatusFilter('Part-Time')).toBe('Part-Time');
    expect(parseStatusFilter('regular')).toBe('');
    expect(parseStatusFilter('<script>')).toBe('');
    expect(parseStatusFilter(null)).toBe('');
  });

  it('page and page size', () => {
    expect(parsePage('3')).toBe(3);
    expect(['0', '-1', '1.5', 'x', null].map(parsePage)).toEqual([1, 1, 1, 1, 1]);
    expect(parsePageSize('10')).toBe(10);
    expect(parsePageSize('50')).toBe(50);
    expect(['7', '1000', 'x', null].map(parsePageSize)).toEqual([25, 25, 25, 25]);
  });

  it('sort', () => {
    expect(parseSort('position', 'desc')).toEqual({ key: 'position', direction: 'desc' });
    expect(parseSort('employeeNumber', null)).toEqual({ key: 'employeeNumber', direction: 'asc' });
    expect(parseSort('hackedField', 'desc')).toEqual(DEFAULT_SORT);
    expect(parseSort(null, null)).toEqual(DEFAULT_SORT);
  });
});

describe('employee pickers (BR-EMP-04, TC-EMP-12)', () => {
  it('exclude archived employees by default and are sorted by name', () => {
    expect(selectableEmployees(all).map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('can include archived employees when asked', () => {
    expect(selectableEmployees(all, { includeArchived: true })).toHaveLength(3);
  });
});
