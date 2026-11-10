import { FileSpreadsheet, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { SegmentedControl } from '@/components/data/SegmentedControl';
import { StatusBadge } from '@/components/data/StatusBadge';
import { SessionDialog } from '@/components/form/SessionDialog';
import { Button } from '@/components/ui/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollRegion } from '@/components/ui/scroll-region';
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  parseEmployeeRows,
  summarizeImport,
  type ImportRow,
  type ImportStatus,
} from '@/domain/employeeImport';
import { AppError, appErrorMessage } from '@/domain/errors';
import { useEmployees, useImportEmployees } from '@/features/employees/hooks/useEmployees';
import type { BulkCreateResult } from '@/services/employees.service';
import type { PaperSize } from '@/utils/excel/xlsxPatch';

interface EmployeeImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Import employees from Excel (FR-EMP): pick a file, see a verdict for every row BEFORE anything is
 * written, then import the valid ones. Existing employees are never changed — an Employee ID that
 * is already in use is skipped (and the database re-checks it for every row).
 */
export function EmployeeImportDialog({ open, onOpenChange }: EmployeeImportDialogProps) {
  return (
    <SessionDialog open={open} onOpenChange={onOpenChange}>
      <ImportDialogContent
        onClose={() => {
          onOpenChange(false);
        }}
      />
    </SessionDialog>
  );
}

type Stage =
  | { readonly name: 'choose' }
  | { readonly name: 'preview'; readonly fileName: string; readonly rows: readonly ImportRow[] }
  | {
      readonly name: 'importing';
      readonly rows: readonly ImportRow[];
      readonly done: number;
      readonly total: number;
    }
  | {
      readonly name: 'done';
      readonly rows: readonly ImportRow[];
      readonly results: readonly BulkCreateResult[];
    };

const STATUS_BADGE: Record<
  ImportStatus,
  { label: string; tone: 'success' | 'danger' | 'warning' }
> = {
  ready: { label: 'Ready', tone: 'success' },
  invalid: { label: 'Problem', tone: 'danger' },
  duplicateInFile: { label: 'Duplicate in file', tone: 'warning' },
  alreadyExists: { label: 'Already exists', tone: 'warning' },
};

function failureMessage(code: BulkCreateResult['code']): string {
  return code === null ? '' : appErrorMessage(new AppError(code));
}

function ImportDialogContent({ onClose }: { readonly onClose: () => void }) {
  const employees = useEmployees();
  const importer = useImportEmployees();
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ name: 'choose' });
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<PaperSize>('A4');
  const busy = stage.name === 'importing';

  async function downloadTemplate(): Promise<void> {
    try {
      const { downloadTemplate: download } = await import('@/utils/excel/employees/employeeExcel');
      download(paper);
    } catch {
      toast.error("The template couldn't be created. Try again.");
    }
  }

  async function onFile(file: File | undefined): Promise<void> {
    setError(null);
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setError(
        'Choose an Excel file with the .xlsx extension (older .xls and .csv files are not supported).',
      );
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError('That file is larger than 5 MB.');
      return;
    }
    try {
      const { readFirstSheet } = await import('@/utils/excel/employees/employeeExcel');
      const matrix = readFirstSheet(new Uint8Array(await file.arrayBuffer()));
      const existing = new Set((employees.data ?? []).map((e) => e.employeeNumberKey));
      const parsed = parseEmployeeRows(matrix, existing);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setStage({ name: 'preview', fileName: file.name, rows: parsed.rows });
    } catch {
      setError("That file couldn't be read. Make sure it is a valid .xlsx workbook.");
    }
  }

  async function runImport(rows: readonly ImportRow[]): Promise<void> {
    const items = rows.flatMap((row) =>
      row.input ? [{ rowNumber: row.rowNumber, input: row.input }] : [],
    );
    setStage({ name: 'importing', rows, done: 0, total: items.length });
    try {
      const results = await importer.mutateAsync({
        items,
        onProgress: (done, total) => {
          setStage({ name: 'importing', rows, done, total });
        },
      });
      setStage({ name: 'done', rows, results });
      const created = results.filter((r) => r.ok).length;
      toast.success(`Imported ${String(created)} ${created === 1 ? 'employee' : 'employees'}.`);
    } catch (failure) {
      toast.error(appErrorMessage(failure));
      setStage({ name: 'preview', fileName: '', rows });
    }
  }

  return (
    <DialogContent size="lg" dismissible={!busy}>
      <DialogHeader>
        <DialogTitle>Import employees</DialogTitle>
        <DialogDescription>
          Upload an Excel file (.xlsx). Nothing is saved until you have reviewed every row.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        {stage.name === 'choose' ? (
          <>
            <div className="flex flex-col gap-3 rounded-control border border-dashed p-4">
              <p className="text-sm text-fg">
                Columns: <strong>Employee ID, Complete Name, Position, Location</strong> (optional)
                and <strong>Employment Status</strong>. Up to {MAX_IMPORT_ROWS} employees per file.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl<PaperSize>
                  label="Template paper size"
                  value={paper}
                  onChange={setPaper}
                  options={[
                    { value: 'A4', label: 'A4' },
                    { value: 'LETTER', label: 'Letter' },
                  ]}
                />
                <Button variant="secondary" size="sm" onClick={() => void downloadTemplate()}>
                  <FileSpreadsheet aria-hidden="true" />
                  Download template
                </Button>
              </div>
            </div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                aria-label="Excel file"
                className="sr-only"
                onChange={(event) => {
                  void onFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <Button
                onClick={() => {
                  fileInput.current?.click();
                }}
                disabled={employees.isPending}
              >
                <Upload aria-hidden="true" />
                Choose Excel file
              </Button>
            </div>
          </>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        {stage.name === 'preview' ? <PreviewTable rows={stage.rows} /> : null}

        {stage.name === 'importing' ? (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-sm text-fg">
              Importing {stage.done} of {stage.total}…
            </p>
            <progress
              className="h-2 w-full accent-primary"
              value={stage.done}
              max={stage.total}
              aria-label="Import progress"
            />
            <p className="text-caption text-fg-muted">Keep this window open until it finishes.</p>
          </div>
        ) : null}

        {stage.name === 'done' ? <DoneSummary rows={stage.rows} results={stage.results} /> : null}
      </DialogBody>

      <DialogFooter>
        {stage.name === 'preview' ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setStage({ name: 'choose' });
                setError(null);
              }}
            >
              Choose another file
            </Button>
            <Button
              disabled={summarizeImport(stage.rows).ready === 0}
              onClick={() => void runImport(stage.rows)}
            >
              Import {summarizeImport(stage.rows).ready}{' '}
              {summarizeImport(stage.rows).ready === 1 ? 'employee' : 'employees'}
            </Button>
          </>
        ) : stage.name === 'importing' ? (
          <Button disabled loading>
            Importing…
          </Button>
        ) : (
          <Button variant={stage.name === 'done' ? 'primary' : 'secondary'} onClick={onClose}>
            {stage.name === 'done' ? 'Done' : 'Cancel'}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function PreviewTable({ rows }: { readonly rows: readonly ImportRow[] }) {
  const summary = summarizeImport(rows);
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-sm text-fg">
        {summary.total} {summary.total === 1 ? 'row' : 'rows'} found:{' '}
        <strong className="text-success">{summary.ready} ready</strong>
        {summary.problems > 0 ? (
          <>
            , <strong className="text-warning">{summary.problems} will be skipped</strong>
          </>
        ) : null}
        .
      </p>
      <ScrollRegion label="Import preview" className="max-h-80 rounded-control border">
        <table className="w-full text-sm">
          <caption className="sr-only">Rows found in the file</caption>
          <thead className="sticky top-0 bg-pink-50 text-left text-caption text-fg-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                Row
              </th>
              <th scope="col" className="px-3 py-2">
                Employee ID
              </th>
              <th scope="col" className="px-3 py-2">
                Name
              </th>
              <th scope="col" className="px-3 py-2">
                Status
              </th>
              <th scope="col" className="px-3 py-2">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const badge = STATUS_BADGE[row.status];
              return (
                <tr key={row.rowNumber} className="border-t align-top">
                  <td className="px-3 py-2 text-fg-muted tabular-nums">{row.rowNumber}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.employeeNumber}</td>
                  <td className="px-3 py-2">{row.fullName}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{row.messages.join(' ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}

function DoneSummary({
  rows,
  results,
}: {
  readonly rows: readonly ImportRow[];
  readonly results: readonly BulkCreateResult[];
}) {
  const created = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const skipped = rows.length - results.length;
  return (
    <div className="flex flex-col gap-3" role="status">
      <p className="text-sm text-fg">
        <strong className="text-success">
          {created} {created === 1 ? 'employee' : 'employees'} imported
        </strong>
        {skipped > 0 ? `, ${String(skipped)} skipped because of problems in the file` : ''}
        {failed.length > 0 ? `, ${String(failed.length)} could not be saved` : ''}.
      </p>
      {failed.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-danger">
          {failed.map((f) => (
            <li key={f.rowNumber}>
              Row {f.rowNumber}: {failureMessage(f.code)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
