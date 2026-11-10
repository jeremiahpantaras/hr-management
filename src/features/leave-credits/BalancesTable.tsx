import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { LeaveBreakdownTable } from '@/components/data/LeaveBreakdownTable';
import { Pagination } from '@/components/data/Pagination';
import { SearchInput } from '@/components/data/SearchInput';
import { StatusBadge } from '@/components/data/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CREDITS_MATRIX_PAGE_SIZE } from '@/domain/constants';
import { formatDays } from '@/domain/days';
import { filterEmployees, paginate, sortEmployees, DEFAULT_SORT } from '@/domain/employeeList';
import { appErrorMessage } from '@/domain/errors';
import { sumTotals, summarizeBalances } from '@/domain/summary';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { useBalancesForEmployees } from '@/features/leave-credits/hooks/useBalances';
import { useLeaveTypes } from '@/features/leave-types/hooks/useLeaveTypes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Employee, LeaveBalance } from '@/types/models';

interface BalancesTableProps {
  readonly year: number;
  readonly onAllocate: (employee: Employee) => void;
}

/**
 * Leave Credits → Balances (UI spec §6.7, DB §8.4): employees 25 per page with their year totals,
 * each row expandable to the per-type breakdown. Employees without credits show "—".
 */
export function BalancesTable({ year, onAllocate }: BalancesTableProps) {
  const employeesQuery = useEmployees();
  const typesQuery = useLeaveTypes();
  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [requestedPage, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const filtered = useMemo(
    () =>
      sortEmployees(
        filterEmployees(employeesQuery.data ?? [], {
          query: search,
          status: '',
          archive: includeArchived ? 'all' : 'active',
        }),
        DEFAULT_SORT,
      ),
    [employeesQuery.data, search, includeArchived],
  );
  const page = paginate(filtered, requestedPage, CREDITS_MATRIX_PAGE_SIZE);
  const ids = page.items.map((employee) => employee.id);
  const balancesQuery = useBalancesForEmployees(ids, year);

  const byEmployee = useMemo(() => {
    const map = new Map<string, LeaveBalance[]>();
    for (const balance of balancesQuery.data ?? []) {
      map.set(balance.employeeId, [...(map.get(balance.employeeId) ?? []), balance]);
    }
    return map;
  }, [balancesQuery.data]);

  function toggle(employeeId: string): void {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  if (employeesQuery.isError) {
    return (
      <ErrorState
        message={appErrorMessage(employeesQuery.error)}
        onRetry={() => void employeesQuery.refetch()}
      />
    );
  }

  const loading = employeesQuery.isPending || (ids.length > 0 && balancesQuery.isPending);
  const types = typesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          label="Search employees"
          placeholder="Search by name or employee ID"
          value={searchText}
          onChange={(value) => {
            setSearchText(value);
            setPage(1);
          }}
          className="sm:w-80"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="include-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => {
              setIncludeArchived(checked);
              setPage(1);
            }}
          />
          <Label htmlFor="include-archived">Include archived</Label>
        </div>
      </div>

      {balancesQuery.isError ? (
        <ErrorState
          message={appErrorMessage(balancesQuery.error)}
          onRetry={() => void balancesQuery.refetch()}
        />
      ) : (
        <div className="rounded-card border bg-surface shadow-card">
          <ScrollRegion label={`Leave credits ${String(year)}`}>
            <Table>
              <TableCaption>{`Leave credits for ${String(year)}`}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Expand</span>
                  </TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Total credits</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Unused</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 5 }, (_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : page.items.map((employee) => {
                      const rows = byEmployee.get(employee.id) ?? [];
                      const totals = sumTotals(rows);
                      const isOpen = expanded.has(employee.id);
                      const noCredits = rows.length === 0 || totals.totalCredits === 0;
                      const summary = summarizeBalances(rows, types);
                      return (
                        <Fragment key={employee.id}>
                          <TableRow>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-expanded={isOpen}
                                aria-label={`${isOpen ? 'Hide' : 'Show'} breakdown for ${employee.fullName}`}
                                onClick={() => {
                                  toggle(employee.id);
                                }}
                              >
                                {isOpen ? (
                                  <ChevronDown aria-hidden="true" />
                                ) : (
                                  <ChevronRight aria-hidden="true" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Link
                                to={`/employees/${employee.id}?year=${String(year)}`}
                                className="font-medium text-fg underline-offset-4 hover:text-primary hover:underline"
                              >
                                {employee.fullName}
                              </Link>
                              <span className="ml-2 text-caption text-fg-muted">
                                {employee.employeeNumber}
                              </span>
                              {employee.isArchived ? (
                                <StatusBadge tone="warning" className="ml-2">
                                  Archived
                                </StatusBadge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {noCredits ? '—' : formatDays(totals.totalCredits)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {noCredits ? '—' : formatDays(totals.totalUsed)}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {noCredits ? '—' : formatDays(totals.totalUnused)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {employee.isArchived ? null : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Allocate credits to ${employee.fullName}`}
                                    onClick={() => {
                                      onAllocate(employee);
                                    }}
                                  >
                                    Allocate
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" asChild>
                                  <Link
                                    to={`/employees/${employee.id}?year=${String(year)}`}
                                    aria-label={`View ${employee.fullName}`}
                                  >
                                    View
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isOpen ? (
                            <TableRow>
                              <TableCell colSpan={6} className="bg-surface-muted">
                                <LeaveBreakdownTable
                                  compact
                                  caption={`${employee.fullName} — ${String(year)} breakdown`}
                                  totals={{
                                    total: summary.totals.totalCredits,
                                    used: summary.totals.totalUsed,
                                    unused: summary.totals.totalUnused,
                                  }}
                                  rows={summary.rows.map((row) => ({
                                    id: row.leaveTypeId,
                                    leaveTypeName: row.leaveTypeName,
                                    total: row.totalCredits,
                                    used: row.totalUsed,
                                    unused: row.totalUnused,
                                    inactive: !row.isActive,
                                    hasBalance: row.hasBalance,
                                  }))}
                                />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
              </TableBody>
            </Table>
          </ScrollRegion>
          {!loading && page.items.length === 0 ? (
            <EmptyState
              icon={Users}
              title={
                (employeesQuery.data ?? []).length === 0
                  ? 'No employees yet'
                  : 'No employees match your search.'
              }
              description={
                (employeesQuery.data ?? []).length === 0
                  ? 'Add employees first, then allocate their leave credits.'
                  : undefined
              }
            />
          ) : null}
          {!loading && !employeesQuery.isPending ? (
            <Pagination
              mode="pages"
              page={page.page}
              pageSize={CREDITS_MATRIX_PAGE_SIZE}
              total={page.total}
              onPageChange={setPage}
              pageSizeOptions={[CREDITS_MATRIX_PAGE_SIZE]}
            />
          ) : null}
        </div>
      )}
      {!loading && (balancesQuery.data ?? []).length === 0 && page.items.length > 0 ? (
        <p className="text-sm text-fg-muted">No credits have been allocated for {year}.</p>
      ) : null}
    </div>
  );
}
