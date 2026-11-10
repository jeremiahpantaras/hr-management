import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { SegmentedControl } from '@/components/data/SegmentedControl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  loadPrintPreferences,
  savePrintPreferences,
  type PrintPreferences,
} from '@/utils/printPreferences';
import type { Employee } from '@/types/models';
import type { Orientation, PaperSize } from '@/utils/excel/xlsxPatch';

interface EmployeeExportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** What the list currently shows (search + filters applied, every page). */
  readonly currentView: readonly Employee[];
  /** Every employee, archived included. */
  readonly everyone: readonly Employee[];
}

type Scope = 'view' | 'all';

/**
 * Export employees to Excel with a print layout for Letter or A4 (landscape or portrait): fit to
 * one page wide, header row repeated on every page, "Page x of y" footer. The Excel library is only
 * loaded when the user actually exports.
 */
export function EmployeeExportDialog({
  open,
  onOpenChange,
  currentView,
  everyone,
}: EmployeeExportDialogProps) {
  const [scope, setScope] = useState<Scope>('view');
  const [print, setPrint] = useState<PrintPreferences>(loadPrintPreferences);
  const [pending, setPending] = useState(false);
  const rows = scope === 'view' ? currentView : everyone;

  function update(next: PrintPreferences): void {
    setPrint(next);
    savePrintPreferences(next);
  }

  async function runExport(): Promise<void> {
    setPending(true);
    try {
      const { downloadEmployees } = await import('@/utils/excel/employees/employeeExcel');
      const fileName = downloadEmployees(rows, print);
      toast.success(
        `Exported ${String(rows.length)} ${rows.length === 1 ? 'employee' : 'employees'} to ${fileName}.`,
      );
      onOpenChange(false);
    } catch {
      toast.error("The Excel file couldn't be created. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dismissible={!pending}>
        <DialogHeader>
          <DialogTitle>Export employees</DialogTitle>
          <DialogDescription>
            Download an Excel file that is ready to print on Letter or A4 paper.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg">Which employees</p>
            <SegmentedControl<Scope>
              label="Which employees"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'view', label: `Current view (${String(currentView.length)})` },
                { value: 'all', label: `Everyone, incl. archived (${String(everyone.length)})` },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg">Paper size</p>
            <SegmentedControl<PaperSize>
              label="Paper size"
              value={print.paper}
              onChange={(paper) => {
                update({ ...print, paper });
              }}
              options={[
                { value: 'LETTER', label: 'Letter (8.5 × 11 in)' },
                { value: 'A4', label: 'A4 (210 × 297 mm)' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg">Orientation</p>
            <SegmentedControl<Orientation>
              label="Orientation"
              value={print.orientation}
              onChange={(orientation) => {
                update({ ...print, orientation });
              }}
              options={[
                { value: 'landscape', label: 'Landscape' },
                { value: 'portrait', label: 'Portrait' },
              ]}
            />
          </div>
          <p className="text-caption text-fg-muted">
            Fits one page wide, repeats the header row on every page and numbers the pages. The file
            can be imported again.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={pending || rows.length === 0}
            onClick={() => void runExport()}
          >
            <Download aria-hidden="true" />
            Download Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
