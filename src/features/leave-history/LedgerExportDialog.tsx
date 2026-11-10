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
import { AppError, appErrorMessage } from '@/domain/errors';
import { selectHistoryRows, type HistoryExportFilters } from '@/domain/ledgerExport';
import { getLedgerYear } from '@/services/leaveLedger.service';
import type { Orientation, PaperSize } from '@/utils/excel/xlsxPatch';
import {
  HISTORY_EXPORT_KEY,
  loadPrintPreferences,
  savePrintPreferences,
  type PrintPreferences,
} from '@/utils/printPreferences';

interface LedgerExportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly year: number;
  /** The filters currently applied on the page (employee, type, search text, leave dates). */
  readonly filters: HistoryExportFilters;
  /** True when any filter is active, to say so in the description. */
  readonly filtered: boolean;
}

const DEFAULT: PrintPreferences = { paper: 'A4', orientation: 'landscape' };

/**
 * Export the leave history to Excel (Letter or A4). The file holds EVERY entry of the year that
 * matches the page's filters — it loads the whole year, not only the rows shown so far.
 */
export function LedgerExportDialog({
  open,
  onOpenChange,
  year,
  filters,
  filtered,
}: LedgerExportDialogProps) {
  const [print, setPrint] = useState<PrintPreferences>(() =>
    loadPrintPreferences(HISTORY_EXPORT_KEY, DEFAULT),
  );
  const [pending, setPending] = useState(false);

  function update(next: PrintPreferences): void {
    setPrint(next);
    savePrintPreferences(next, HISTORY_EXPORT_KEY);
  }

  async function runExport(): Promise<void> {
    setPending(true);
    try {
      const entries = await getLedgerYear(year, filters.employeeId);
      const rows = selectHistoryRows(entries, filters);
      if (rows.length === 0) {
        toast.info('There are no entries to export with these filters.');
        return;
      }
      const { downloadHistory } = await import('@/utils/excel/leaveHistoryExcel');
      const fileName = downloadHistory(rows, { ...print, year });
      toast.success(
        `Exported ${String(rows.length)} ${rows.length === 1 ? 'entry' : 'entries'} to ${fileName}.`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof AppError
          ? appErrorMessage(error)
          : "The Excel file couldn't be created. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dismissible={!pending}>
        <DialogHeader>
          <DialogTitle>Export leave history</DialogTitle>
          <DialogDescription>
            {filtered
              ? `Every ${String(year)} entry that matches your current filters, newest first.`
              : `Every ${String(year)} entry, newest first.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
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
            Includes the remaining days after each entry. Fits one page wide, repeats the header row
            on every page and numbers the pages.
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
          <Button loading={pending} disabled={pending} onClick={() => void runExport()}>
            <Download aria-hidden="true" />
            Download Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
