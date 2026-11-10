import { Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { FilterDropdown } from '@/components/data/FilterDropdown';
import { YearSelect } from '@/components/data/YearSelect';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import type { ReportFilters, ReportModel } from '@/domain/report';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { useLeaveTypes } from '@/features/leave-types/hooks/useLeaveTypes';
import { useExportReport, useGenerateReport } from '@/features/reports/hooks/useReport';
import { ReportPreview } from '@/features/reports/ReportPreview';
import { useYearParam } from '@/hooks/useYearParam';

/**
 * Reports (UI spec §6.12, FR-RPT-*): choose filters, preview (loads the year, reconciles and
 * builds the report), then download the workbook. The preview and the workbook come from the same
 * report model, so they cannot disagree (BR-RPT-01).
 */
export function ReportsPage() {
  const [year, setYear] = useYearParam();
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employee');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [includeArchived, setIncludeArchived] = useState(true);

  const employees = useEmployees();
  const leaveTypes = useLeaveTypes();
  const generate = useGenerateReport();
  const exporter = useExportReport();

  // The preview belongs to the filters it was built for; any change makes it stale.
  const [preview, setPreview] = useState<{ key: string; report: ReportModel } | null>(null);
  const filters: ReportFilters = {
    year,
    employeeId: employeeId && employeeId !== '' ? employeeId : null,
    leaveTypeId: leaveTypeId === '' ? null : leaveTypeId,
    includeArchived,
  };
  const key = JSON.stringify(filters);
  const current = preview?.key === key ? preview.report : null;

  function setEmployee(next: string | null): void {
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (next === null) updated.delete('employee');
        else updated.set('employee', next);
        return updated;
      },
      { replace: true },
    );
  }

  async function runPreview(): Promise<ReportModel | null> {
    try {
      const report = await generate.mutateAsync(filters);
      setPreview({ key, report });
      return report;
    } catch (error) {
      toast.error(appErrorMessage(error));
      return null;
    }
  }

  async function download(): Promise<void> {
    const report = current ?? (await runPreview());
    if (report === null) return;
    try {
      const fileName = await exporter.mutateAsync({
        report,
        employeeNumber:
          filters.employeeId === null
            ? null
            : (employees.data?.find((e) => e.id === filters.employeeId)?.employeeNumber ?? null),
      });
      toast.success(`Downloaded ${fileName}.`);
    } catch {
      toast.error("The Excel file couldn't be created. Try again.");
    }
  }

  const noRecords =
    current !== null &&
    current.info.breakdownRowCount === 0 &&
    current.info.transactionRowCount === 0;

  return (
    <PageContainer>
      <PageHeader title="Reports" description="Preview and export leave data to Excel." />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex flex-col gap-1.5">
              <Label>Leave year</Label>
              <YearSelect value={year} onChange={setYear} />
            </div>
            <div className="flex flex-col gap-1.5 lg:w-72">
              <Label>Employee</Label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <EmployeeCombobox
                    employees={employees.data ?? []}
                    value={filters.employeeId}
                    onChange={setEmployee}
                    placeholder="All employees"
                    aria-label="Employee"
                    loading={employees.isPending}
                  />
                </div>
                {filters.employeeId === null ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEmployee(null);
                    }}
                  >
                    All
                  </Button>
                )}
              </div>
            </div>
            <FilterDropdown
              label="Leave type"
              allLabel="All leave types"
              value={leaveTypeId}
              options={(leaveTypes.data ?? []).map((type) => ({
                value: type.id,
                label: type.name,
              }))}
              onChange={setLeaveTypeId}
            />
            <div className="flex items-center gap-2 lg:pb-2">
              <Checkbox
                id="include-archived-report"
                checked={includeArchived}
                onCheckedChange={(checked) => {
                  setIncludeArchived(checked === true);
                }}
              />
              <Label htmlFor="include-archived-report">Include archived</Label>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              loading={generate.isPending && !exporter.isPending}
              disabled={generate.isPending || exporter.isPending}
              onClick={() => void runPreview()}
            >
              <Eye aria-hidden="true" />
              Preview
            </Button>
            <Button
              loading={exporter.isPending}
              disabled={generate.isPending || exporter.isPending || noRecords}
              onClick={() => void download()}
            >
              <Download aria-hidden="true" />
              Download Excel (.xlsx)
            </Button>
          </div>
        </CardContent>
      </Card>

      {generate.isPending ? (
        <p role="status" className="text-sm text-fg-muted">
          Loading {year} records…
        </p>
      ) : generate.isError && current === null ? (
        <Card>
          <ErrorState
            message={appErrorMessage(generate.error)}
            code={errorCodeLabel(generate.error)}
            onRetry={() => void runPreview()}
          />
        </Card>
      ) : current !== null ? (
        <ReportPreview report={current} />
      ) : (
        <p className="text-sm text-fg-muted">
          Choose the filters and select <strong>Preview</strong> to see what the workbook will
          contain.
        </p>
      )}
    </PageContainer>
  );
}
