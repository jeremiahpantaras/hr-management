import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDays } from '@/domain/days';
import { describeTotals, MONTH_LABELS, type ReportModel } from '@/domain/report';
import { cn } from '@/lib/cn';

/**
 * The report as it will appear in the workbook (same model): the heading, the two bands, the column
 * headers and one row per employee. An employee with every credit used has a dark row.
 */
export function ReportPreview({ report }: { readonly report: ReportModel }) {
  const mismatched = new Set(report.mismatches.map((m) => m.balanceId)).size;

  if (report.rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={FileSpreadsheet}
          title={`There are no employees to report for ${String(report.filters.year)} with these filters.`}
          description="Change the filters and preview again."
        />
      </Card>
    );
  }

  return (
    <Card aria-label="Report preview">
      <CardContent className="flex flex-col gap-3">
        {mismatched > 0 ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {mismatched} {mismatched === 1 ? 'balance doesn’t' : 'balances don’t'} match their
              transaction history. The report shows the stored balances; check Leave History for the
              affected employees.
            </span>
          </div>
        ) : null}
        <h2 className="text-center text-section font-semibold text-fg">{report.heading}</h2>
        <ScrollRegion label="Leave credits report preview">
          <Table className="text-xs whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead colSpan={3} className="bg-primary text-center text-primary-fg">
                  EMPLOYEE&apos;S INFORMATION
                </TableHead>
                <TableHead colSpan={16} className="bg-danger text-center text-primary-fg">
                  USED CREDITS AND DATE
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="text-fg">NAME</TableHead>
                <TableHead className="text-fg">POSITION</TableHead>
                <TableHead className="text-fg">LOCATION</TableHead>
                <TableHead className="text-center text-fg">
                  TOTAL NO. OF UNUSED LEAVE CREDITS
                </TableHead>
                {MONTH_LABELS.map((month) => (
                  <TableHead key={month} className="text-center text-fg">
                    {month}
                  </TableHead>
                ))}
                <TableHead className="text-center text-fg">TOTAL OF USED LEAVE</TableHead>
                <TableHead className="text-center text-fg">TOTAL REMAINING LEAVES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow
                  key={row.employeeId}
                  className={cn(row.fullyUsed && 'bg-neutral text-primary-fg hover:bg-neutral')}
                >
                  <TableCell className={cn('font-semibold', row.fullyUsed && 'text-primary-fg')}>
                    {row.name}
                  </TableCell>
                  <TableCell className={cn(row.fullyUsed && 'text-primary-fg')}>
                    {row.position}
                  </TableCell>
                  <TableCell className={cn(row.fullyUsed && 'text-primary-fg')}>
                    {row.location}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-center font-semibold tabular-nums',
                      row.fullyUsed ? 'text-primary-fg' : 'text-danger',
                    )}
                  >
                    {formatDays(row.totalCredits)}
                  </TableCell>
                  {row.months.map((value, index) => (
                    <TableCell
                      key={MONTH_LABELS[index]}
                      className={cn('text-center tabular-nums', row.fullyUsed && 'text-primary-fg')}
                    >
                      {value === 0 ? '' : formatDays(value)}
                    </TableCell>
                  ))}
                  <TableCell
                    className={cn(
                      'text-center font-semibold tabular-nums',
                      row.fullyUsed && 'text-primary-fg',
                    )}
                  >
                    {formatDays(row.totalUsed)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-center font-semibold tabular-nums',
                      row.fullyUsed ? 'text-primary-fg' : 'text-primary',
                    )}
                  >
                    {formatDays(row.remaining)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollRegion>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg">
          <span>
            {report.rows.length} {report.rows.length === 1 ? 'employee' : 'employees'} · Totals (
            {report.filters.year}): {describeTotals(report.totals)}
          </span>
          {mismatched === 0 ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Reconciled
            </span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}
