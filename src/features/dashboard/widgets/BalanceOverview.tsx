import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Pagination } from '@/components/data/Pagination';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { formatDays } from '@/domain/days';
import { DEFAULT_SORT, filterEmployees, paginate, sortEmployees } from '@/domain/employeeList';
import { sumTotals } from '@/domain/summary';
import { WidgetCard } from '@/features/dashboard/widgets/WidgetCard';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { useBalancesForEmployees } from '@/features/leave-credits/hooks/useBalances';

const PAGE_SIZE = 10;

/** Employee leave balances (UI spec §6.4): 10 active employees per page with year totals. */
export function BalanceOverview({ year }: { readonly year: number }) {
  const employees = useEmployees();
  const [requestedPage, setPage] = useState(1);
  const active = sortEmployees(
    filterEmployees(employees.data ?? [], { query: '', status: '', archive: 'active' }),
    DEFAULT_SORT,
  );
  const page = paginate(active, requestedPage, PAGE_SIZE);
  const balances = useBalancesForEmployees(
    page.items.map((e) => e.id),
    year,
  );

  const loading = employees.isPending || (page.items.length > 0 && balances.isPending);
  return (
    <WidgetCard
      title="Employee leave balances"
      viewAll={{ to: `/leave-credits?year=${String(year)}`, label: 'Open Leave Credits' }}
      loading={loading}
      error={employees.isError ? employees.error : balances.isError ? balances.error : null}
      onRetry={() => {
        void employees.refetch();
        void balances.refetch();
      }}
    >
      {page.total === 0 ? (
        <p className="text-sm text-fg-muted">No active employees yet.</p>
      ) : (
        <>
          <ScrollRegion label={`Employee leave balances ${String(year)}`}>
            <Table>
              <TableCaption>{`Employee leave balances for ${String(year)}`}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Unused</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((employee) => {
                  const totals = sumTotals(
                    (balances.data ?? []).filter((b) => b.employeeId === employee.id),
                  );
                  return (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.fullName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDays(totals.totalCredits)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDays(totals.totalUsed)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatDays(totals.totalUnused)}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/employees/${employee.id}?year=${String(year)}`}
                          aria-label={`Open ${employee.fullName}`}
                          className="inline-flex size-8 items-center justify-center rounded-control text-fg-muted hover:bg-hover hover:text-fg"
                        >
                          <ChevronRight aria-hidden="true" className="size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollRegion>
          <Pagination
            mode="pages"
            page={page.page}
            pageSize={PAGE_SIZE}
            total={page.total}
            onPageChange={setPage}
            pageSizeOptions={[PAGE_SIZE]}
          />
        </>
      )}
    </WidgetCard>
  );
}
