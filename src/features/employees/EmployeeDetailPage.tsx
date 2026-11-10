import { Archive, ArchiveRestore, FileSpreadsheet, Pencil, Plus, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { LeaveBreakdownTable } from '@/components/data/LeaveBreakdownTable';
import { StatCard } from '@/components/data/StatCard';
import { StatusBadge } from '@/components/data/StatusBadge';
import { YearSelect } from '@/components/data/YearSelect';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDays } from '@/domain/days';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import { summarizeBalances } from '@/domain/summary';
import { EmployeeFormDialog } from '@/features/employees/EmployeeFormDialog';
import {
  useArchiveEmployee,
  useEmployee,
  useRestoreEmployee,
} from '@/features/employees/hooks/useEmployees';
import { AllocationDialog } from '@/features/leave-credits/AllocationDialog';
import { useEmployeeYearBalances } from '@/features/leave-credits/hooks/useBalances';
import { LedgerList } from '@/features/leave-history/LedgerList';
import { useLeaveTypes } from '@/features/leave-types/hooks/useLeaveTypes';
import { RecordUsageDialog } from '@/features/leave-usage/RecordUsageDialog';
import { useReplacementFlow } from '@/features/leave-usage/useReplacementFlow';
import { useYearParam } from '@/hooks/useYearParam';
import { formatTimestamp } from '@/utils/format';

/**
 * Employee details and yearly leave summary (UI spec §6.6, FR-EMP-06, FR-SUM-01…06). Figures come
 * from the single `summarizeBalances` function, so they match the dashboard and the Excel export.
 */
export function EmployeeDetailPage() {
  const { employeeId = '' } = useParams();
  const [year, setYear] = useYearParam();
  const { data: employee, isPending, error, refetch } = useEmployee(employeeId);

  const balances = useEmployeeYearBalances(employeeId, year);
  const leaveTypes = useLeaveTypes();
  const summary = useMemo(
    () => summarizeBalances(balances.data ?? [], leaveTypes.data ?? []),
    [balances.data, leaveTypes.data],
  );

  const archive = useArchiveEmployee();
  const restore = useRestoreEmployee();
  const [editOpen, setEditOpen] = useState(false);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const replacement = useReplacementFlow(year);

  async function confirmArchive(): Promise<void> {
    if (!employee) return;
    try {
      await archive.mutateAsync(employee.id);
      toast.success(`Archived ${employee.fullName}.`);
    } catch (failure) {
      toast.error(appErrorMessage(failure));
      throw failure;
    }
  }
  function restoreEmployee(): void {
    if (!employee) return;
    restore.mutate(employee.id, {
      onSuccess: () => {
        toast.success(`Restored ${employee.fullName}.`);
      },
      onError: (failure) => {
        toast.error(appErrorMessage(failure));
      },
    });
  }

  const summaryLoading = balances.isPending || leaveTypes.isPending;
  const summaryError = balances.isError
    ? balances.error
    : leaveTypes.isError
      ? leaveTypes.error
      : null;
  const archived = employee?.isArchived === true;

  return (
    <PageContainer>
      <PageHeader
        title="Employee details"
        description="Yearly leave balances and transaction history."
        actions={employee ? <YearSelect value={year} onChange={setYear} /> : undefined}
      />

      {isPending ? (
        <Card>
          <CardContent className="flex items-center gap-4" aria-busy="true">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <ErrorState
            message={appErrorMessage(error)}
            code={errorCodeLabel(error)}
            onRetry={() => void refetch()}
          />
        </Card>
      ) : employee ? (
        <div className="flex flex-col gap-6">
          {archived ? (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-control border border-warning/20 bg-warning-soft p-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"
            >
              <span>This employee is archived. History is read-only.</span>
              <Button
                size="sm"
                variant="secondary"
                loading={restore.isPending}
                onClick={restoreEmployee}
              >
                <ArchiveRestore aria-hidden="true" />
                Restore employee
              </Button>
            </div>
          ) : null}
          {replacement.node}

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <UserAvatar name={employee.fullName} className="size-14 text-lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-section text-fg">{employee.fullName}</h2>
                  <dl className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-fg-muted">Employee ID</dt>
                      <dd className="font-medium text-fg tabular-nums">
                        {employee.employeeNumber}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-fg-muted">Position</dt>
                      <dd className="font-medium text-fg">{employee.position}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-fg-muted">Department</dt>
                      <dd className="font-medium text-fg">{employee.department ?? '—'}</dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="text-fg-muted">Employment status</dt>
                      <dd className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge>{employee.employmentStatus}</StatusBadge>
                        {archived ? <StatusBadge tone="warning">Archived</StatusBadge> : null}
                      </dd>
                    </div>
                  </dl>
                  {employee.createdAt && employee.updatedAt ? (
                    <p className="mt-3 text-caption text-fg-muted">
                      Created {formatTimestamp(employee.createdAt)} · Updated{' '}
                      {formatTimestamp(employee.updatedAt)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditOpen(true);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  disabled={archived}
                  onClick={() => {
                    setAllocateOpen(true);
                  }}
                >
                  <Plus aria-hidden="true" />
                  Allocate credits
                </Button>
                <Button
                  variant="secondary"
                  disabled={archived}
                  onClick={() => {
                    setRecordOpen(true);
                  }}
                >
                  Record usage
                </Button>
                <Button variant="secondary" asChild>
                  <Link to={`/reports?employee=${employee.id}&year=${String(year)}`}>
                    <FileSpreadsheet aria-hidden="true" />
                    Export Excel
                  </Link>
                </Button>
                {archived ? null : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setArchiveOpen(true);
                    }}
                  >
                    <Archive aria-hidden="true" />
                    Archive
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <section aria-labelledby="summary-heading" className="flex flex-col gap-4">
            <h2 id="summary-heading" className="text-section text-fg">
              Leave summary for {year}
            </h2>
            {summaryError ? (
              <Card>
                <ErrorState
                  message={appErrorMessage(summaryError)}
                  onRetry={() => {
                    void balances.refetch();
                    void leaveTypes.refetch();
                  }}
                />
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard
                    label="Total Credits"
                    value={formatDays(summary.totals.totalCredits)}
                    caption={String(year)}
                    loading={summaryLoading}
                  />
                  <StatCard
                    label="Total Used"
                    value={formatDays(summary.totals.totalUsed)}
                    caption={String(year)}
                    loading={summaryLoading}
                  />
                  <StatCard
                    label="Total Unused"
                    value={formatDays(summary.totals.totalUnused)}
                    caption={String(year)}
                    loading={summaryLoading}
                  />
                </div>
                {summaryLoading ? null : (balances.data ?? []).length === 0 ? (
                  <p className="text-sm text-fg-muted">
                    No credits have been allocated to this employee for {year}.
                  </p>
                ) : null}
                {summaryLoading ? null : (
                  <Card>
                    <LeaveBreakdownTable
                      caption={`${employee.fullName} — ${String(year)} leave breakdown`}
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
                  </Card>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="history-heading" className="flex flex-col gap-3">
            <Card>
              <CardHeader>
                <CardTitle id="history-heading">Transaction history · {year}</CardTitle>
              </CardHeader>
              <CardContent>
                <LedgerList
                  year={year}
                  variant="history"
                  lockedEmployeeId={employee.id}
                  caption={`Transaction history for ${employee.fullName} ${String(year)}`}
                  emptyTitle={`No transactions for ${String(year)}.`}
                  emptyAction={
                    archived
                      ? undefined
                      : {
                          label: 'Allocate credits',
                          onClick: () => {
                            setAllocateOpen(true);
                          },
                        }
                  }
                  onReversed={replacement.onReversed}
                />
              </CardContent>
            </Card>
          </section>

          <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={employee} />
          <AllocationDialog
            open={allocateOpen}
            onOpenChange={setAllocateOpen}
            year={year}
            defaults={{ employeeId: employee.id }}
          />
          <RecordUsageDialog
            open={recordOpen}
            onOpenChange={setRecordOpen}
            year={year}
            defaults={{ employeeId: employee.id }}
          />
          <ConfirmDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            title={`Archive ${employee.fullName}?`}
            description="Their leave history is kept and appears in reports, but they won't be available when allocating credits or recording leave. You can restore them at any time."
            confirmLabel="Archive employee"
            onConfirm={confirmArchive}
          />
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={UserX}
            title="Employee not found"
            description="This employee record doesn't exist."
            action={
              <Button asChild variant="secondary">
                <Link to="/employees">Back to employees</Link>
              </Button>
            }
          />
        </Card>
      )}
    </PageContainer>
  );
}
