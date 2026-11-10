import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormField } from '@/components/form/FormField';
import { SessionDialog } from '@/components/form/SessionDialog';
import { useSessionDialog } from '@/components/form/sessionDialogContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDays } from '@/domain/days';
import { effectLabel, reversalAvailableDelta, transactionKind } from '@/domain/ledgerDisplay';
import {
  reversalSchema,
  type ReversalFormValues,
  type ReversalInput,
} from '@/domain/schemas/reversal';
import { useBalance } from '@/features/leave-credits/hooks/useBalances';
import { useReverseEntry } from '@/features/leave-history/hooks/useLedger';
import { ledgerErrorMessage } from '@/features/leave-history/ledgerMessages';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import type { LeaveTransaction } from '@/types/models';
import { formatDate, formatDateRange } from '@/utils/format';

interface ReverseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The entry to reverse. Kept while the dialog fades out so its text does not flip. */
  readonly entry: LeaveTransaction | null;
  /**
   * Called after a successful reversal. `thenReEnter` is true when the user asked to enter a
   * corrected record (USAGE only) — the caller then opens the pre-filled form (BR-COR-06).
   */
  readonly onReversed?: (entry: LeaveTransaction, thenReEnter: boolean) => void;
}

/** Reverse an entry (UI spec §6.11): preview, reason, blocked-case explanation (BR-INS-05). */
export function ReverseDialog({ open, onOpenChange, entry, onReversed }: ReverseDialogProps) {
  return (
    <SessionDialog open={open} onOpenChange={onOpenChange}>
      {entry ? <ReverseDialogContent entry={entry} onReversed={onReversed} /> : null}
    </SessionDialog>
  );
}

interface ContentProps {
  readonly entry: LeaveTransaction;
  readonly onReversed?: (entry: LeaveTransaction, thenReEnter: boolean) => void;
}

function ReverseDialogContent({ entry, onReversed }: ContentProps) {
  const { onDirtyChange, onRequestClose, onSaved } = useSessionDialog();
  const reverse = useReverseEntry();
  const balanceQuery = useBalance(entry.employeeId, entry.leaveYear);
  const [serverError, setServerError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isUsage = entry.transactionType === 'USAGE';

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ReversalFormValues, unknown, ReversalInput>({
    resolver: zodResolver(reversalSchema),
    defaultValues: { reason: '', thenReEnter: false },
    mode: 'onTouched',
  });
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const available = balanceQuery.data ? balanceQuery.data.availableCredits : null;
  const delta = reversalAvailableDelta(entry);
  // BR-INS-05 / UI §12: removing credits that were already used would leave a negative balance.
  const blocked =
    entry.transactionType === 'ALLOCATION' && available !== null && available + delta < 0;
  const usedOfIt = available === null ? 0 : Math.min(entry.days, entry.days - available);

  const { run, pending } = useSubmitGuard(async (values: ReversalInput) => {
    setServerError(null);
    try {
      await reverse.mutateAsync({ originalTransactionId: entry.id, reason: values.reason });
      toast.success(
        `Reversed the ${transactionKind(entry).toLowerCase()} for ${entry.employeeNameSnapshot}.`,
      );
      onSaved();
      onReversed?.(entry, isUsage && values.thenReEnter);
    } catch (error) {
      setServerError(
        ledgerErrorMessage(error, {
          employeeName: entry.employeeNameSnapshot,
        }),
      );
    }
  });

  return (
    <DialogContent
      size="sm"
      dismissible={!pending}
      onOpenAutoFocus={(event) => {
        // A destructive action: focus starts on Cancel so Enter cannot reverse by accident.
        event.preventDefault();
        cancelRef.current?.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle>Reverse this {transactionKind(entry).toLowerCase()}?</DialogTitle>
        <DialogDescription>
          Nothing is deleted. A reversal entry is added and both stay in the history.
        </DialogDescription>
      </DialogHeader>
      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => run(values))(event);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DialogBody className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-control bg-surface-muted p-3 text-sm">
            <dt className="text-fg-muted">Employee</dt>
            <dd>{entry.employeeNameSnapshot}</dd>
            <dt className="text-fg-muted">Leave year</dt>
            <dd>{String(entry.leaveYear)}</dd>
            <dt className="text-fg-muted">Entry</dt>
            <dd>
              {effectLabel(entry)}
              {entry.dateFrom && entry.dateTo
                ? ` · ${formatDateRange(entry.dateFrom, entry.dateTo)}`
                : ''}
            </dd>
            {entry.createdAt ? (
              <>
                <dt className="text-fg-muted">Recorded</dt>
                <dd>{formatDate(entry.createdAt.toISOString().slice(0, 10))}</dd>
              </>
            ) : null}
          </dl>

          {blocked ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                Can&apos;t reverse this allocation: {formatDays(usedOfIt)} of its{' '}
                {formatDays(entry.days)} credits are already used. Reverse the related usage entries
                first.
              </span>
            </div>
          ) : available !== null ? (
            <p role="status" className="text-sm text-fg-muted">
              Available will change from{' '}
              <strong className="text-fg">{formatDays(available)}</strong> to{' '}
              <strong className="text-fg">{formatDays(available + delta)}</strong>.
            </p>
          ) : null}

          {serverError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          ) : null}

          <FormField
            label="Reason"
            required
            error={errors.reason?.message}
            helper="Shown in the history next to the reversal."
          >
            {(field) => (
              <Textarea {...field} {...register('reason')} rows={3} disabled={pending || blocked} />
            )}
          </FormField>

          {isUsage ? (
            <Controller
              control={control}
              name="thenReEnter"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="then-re-enter"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked === true);
                    }}
                    disabled={pending}
                  />
                  <Label htmlFor="then-re-enter">Then enter a corrected record</Label>
                </div>
              )}
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button ref={cancelRef} variant="secondary" disabled={pending} onClick={onRequestClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            loading={pending}
            disabled={pending || blocked}
          >
            Reverse entry
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
