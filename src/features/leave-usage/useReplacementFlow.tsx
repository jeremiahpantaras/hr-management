import { AlertCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { RecordUsageDialog, type UsageDefaults } from '@/features/leave-usage/RecordUsageDialog';
import type { LeaveTransaction } from '@/types/models';

/**
 * "Reverse & re-enter" (BR-COR-06, RK-07). A correction is two commits: the reversal, then a normal
 * record. If the second does not happen — the user closes the form, or it fails — the original is
 * reversed and the replacement is missing, so a persistent banner stays on the page (with the form
 * pre-filled from the original) until the replacement is saved or the notice is dismissed.
 */
export function useReplacementFlow(year: number): {
  readonly onReversed: (entry: LeaveTransaction, thenReEnter: boolean) => void;
  readonly node: ReactNode;
} {
  const [pending, setPending] = useState<UsageDefaults | null>(null);
  const [open, setOpen] = useState(false);

  function onReversed(entry: LeaveTransaction, thenReEnter: boolean): void {
    if (!thenReEnter || entry.transactionType !== 'USAGE') return;
    setPending({
      employeeId: entry.employeeId,
      year: entry.leaveYear,
      dateFrom: entry.dateFrom ?? undefined,
      dateTo: entry.dateTo ?? undefined,
      days: entry.days,
      remarks: entry.remarks,
    });
    setOpen(true);
  }

  const node = (
    <>
      {pending && !open ? (
        <div
          role="status"
          className="mb-4 flex flex-col gap-3 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            The original entry has been reversed. The replacement has not been saved yet.
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setOpen(true);
              }}
            >
              Enter corrected record
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPending(null);
              }}
            >
              Dismiss
            </Button>
          </span>
        </div>
      ) : null}
      <RecordUsageDialog
        open={open}
        onOpenChange={setOpen}
        year={year}
        defaults={pending ?? undefined}
        replacementNotice
        onRecorded={() => {
          setPending(null);
        }}
      />
    </>
  );
  return { onReversed, node };
}
