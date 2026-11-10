import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { describeTotals, type ReportModel } from '@/domain/report';
import { SHEET_NAMES } from '@/utils/excel/formats';

/** Counts, totals and reconciliation of a generated report (UI spec §6.12). */
export function ReportPreview({ report }: { readonly report: ReportModel }) {
  const { info } = report;
  const empty = info.breakdownRowCount === 0 && info.transactionRowCount === 0;
  const mismatched = new Set(report.mismatches.map((m) => m.balanceId)).size;

  if (empty) {
    return (
      <Card>
        <EmptyState
          icon={FileSpreadsheet}
          title={`There are no records for ${String(info.year)} with these filters.`}
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
              transaction history. The export still includes both; see Report Info.
            </span>
          </div>
        ) : null}
        <p className="text-sm text-fg">
          {info.employeeCount} {info.employeeCount === 1 ? 'employee' : 'employees'} ·{' '}
          {info.breakdownRowCount} balance {info.breakdownRowCount === 1 ? 'row' : 'rows'} ·{' '}
          {info.transactionRowCount}{' '}
          {info.transactionRowCount === 1 ? 'transaction' : 'transactions'}
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg">
          <span>
            Totals ({info.year}): {describeTotals(report.totals)}
          </span>
          {mismatched === 0 ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Reconciled
            </span>
          ) : null}
        </p>
        <p className="text-sm text-fg-muted">
          Workbook sheets: {Object.values(SHEET_NAMES).join(' · ')}
        </p>
      </CardContent>
    </Card>
  );
}
