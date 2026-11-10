import { Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { SegmentedControl } from '@/components/data/SegmentedControl';
import { YearSelect } from '@/components/data/YearSelect';
import { ErrorState } from '@/components/feedback/ErrorState';
import { FormField } from '@/components/form/FormField';
import { SelectField } from '@/components/form/SelectField';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import {
  DEFAULT_REPORT_TITLE,
  MONTH_NAMES,
  REPORT_TITLE_MAX_LENGTH,
  type ReportFilters,
  type ReportModel,
} from '@/domain/report';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { useExportReport, useGenerateReport } from '@/features/reports/hooks/useReport';
import { ReportPreview } from '@/features/reports/ReportPreview';
import { useYearParam } from '@/hooks/useYearParam';
import {
  REPORT_EXPORT_KEY,
  loadPrintPreferences,
  savePrintPreferences,
  type PrintPreferences,
} from '@/utils/printPreferences';
import type { Orientation, PaperSize } from '@/utils/excel/xlsxPatch';

const TITLE_KEY = 'hr.leaveReport.title';
const REPORT_PRINT_DEFAULT: PrintPreferences = { paper: 'A4', orientation: 'landscape' };
const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({
  value: String(index + 1),
  label: name.charAt(0) + name.slice(1).toLowerCase(),
}));

/** The last title used — a per-viewer convenience; works without storage. */
function loadTitle(): string {
  try {
    return window.localStorage.getItem(TITLE_KEY) ?? DEFAULT_REPORT_TITLE;
  } catch {
    return DEFAULT_REPORT_TITLE;
  }
}
function saveTitle(title: string): void {
  try {
    window.localStorage.setItem(TITLE_KEY, title);
  } catch {
    // storage blocked or full: the title simply isn't remembered
  }
}

/**
 * Reports: the leave credits report in the company's own layout (title, employee information, the
 * credits used in each month, total used and remaining). Choose the year and the "as of" month,
 * preview, then download the Excel file for Letter or A4 paper. The preview and the workbook come
 * from the same report model, so they cannot disagree.
 */
export function ReportsPage() {
  const [year, setYear] = useYearParam();
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employee');
  const monthParam = Number(params.get('month'));
  const asOfMonth =
    Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12
      ? monthParam
      : new Date().getMonth() + 1;
  const [title, setTitle] = useState(loadTitle);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [print, setPrint] = useState<PrintPreferences>(() =>
    loadPrintPreferences(REPORT_EXPORT_KEY, REPORT_PRINT_DEFAULT),
  );

  const employees = useEmployees();
  const generate = useGenerateReport();
  const exporter = useExportReport();

  // The preview belongs to the filters it was built for; any change makes it stale.
  const [preview, setPreview] = useState<{ key: string; report: ReportModel } | null>(null);
  const filters: ReportFilters = {
    year,
    asOfMonth,
    title,
    employeeId: employeeId && employeeId !== '' ? employeeId : null,
    includeArchived,
  };
  const key = JSON.stringify(filters);
  const current = preview?.key === key ? preview.report : null;

  function setParam(name: string, value: string | null): void {
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (value === null) updated.delete(name);
        else updated.set(name, value);
        return updated;
      },
      { replace: true },
    );
  }

  function updatePrint(next: PrintPreferences): void {
    setPrint(next);
    savePrintPreferences(next, REPORT_EXPORT_KEY);
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
      const fileName = await exporter.mutateAsync({ report, print });
      toast.success(`Downloaded ${fileName}.`);
    } catch {
      toast.error("The Excel file couldn't be created. Try again.");
    }
  }

  const noRecords = current !== null && current.rows.length === 0;

  return (
    <PageContainer>
      <PageHeader title="Reports" description="Preview and export the leave credits report." />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <FormField
              label="Report title"
              helper={`Printed before "AS OF {MONTH} {YEAR}".`}
              error={
                title.length > REPORT_TITLE_MAX_LENGTH
                  ? `The title is too long (${String(REPORT_TITLE_MAX_LENGTH)} characters max).`
                  : undefined
              }
            >
              {(field) => (
                <Input
                  {...field}
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    saveTitle(event.target.value);
                  }}
                />
              )}
            </FormField>
            <div className="flex flex-col gap-1.5">
              <Label>Leave year</Label>
              <YearSelect value={year} onChange={setYear} />
            </div>
            <SelectField
              label="As of month"
              options={MONTH_OPTIONS}
              value={String(asOfMonth)}
              onValueChange={(value) => {
                setParam('month', value);
              }}
              fieldClassName="lg:w-44"
            />
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex flex-col gap-1.5 lg:w-72">
              <Label>Employee</Label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <EmployeeCombobox
                    employees={employees.data ?? []}
                    value={filters.employeeId}
                    onChange={(next) => {
                      setParam('employee', next);
                    }}
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
                      setParam('employee', null);
                    }}
                  >
                    All
                  </Button>
                )}
              </div>
            </div>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label>Paper size</Label>
              <SegmentedControl<PaperSize>
                label="Paper size"
                value={print.paper}
                onChange={(paper) => {
                  updatePrint({ ...print, paper });
                }}
                options={[
                  { value: 'LETTER', label: 'Letter' },
                  { value: 'A4', label: 'A4' },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Orientation</Label>
              <SegmentedControl<Orientation>
                label="Orientation"
                value={print.orientation}
                onChange={(orientation) => {
                  updatePrint({ ...print, orientation });
                }}
                options={[
                  { value: 'landscape', label: 'Landscape' },
                  { value: 'portrait', label: 'Portrait' },
                ]}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 sm:ml-auto">
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
          Choose the filters and select <strong>Preview</strong> to see what the Excel file will
          contain.
        </p>
      )}
    </PageContainer>
  );
}
