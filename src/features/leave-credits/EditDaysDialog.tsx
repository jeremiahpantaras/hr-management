import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { DaysField } from '@/components/form/DaysField';
import { FormField } from '@/components/form/FormField';
import { FormFooter } from '@/components/form/FormFooter';
import { SessionDialog } from '@/components/form/SessionDialog';
import { useSessionDialog } from '@/components/form/sessionDialogContext';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { MAX_DAYS_PER_ENTRY, REMARKS_MAX_LENGTH } from '@/domain/constants';
import { formatDays } from '@/domain/days';
import {
  adjustmentSchema,
  type AdjustmentFormValues,
  type AdjustmentInput,
} from '@/domain/schemas/adjustment';
import { useRecordAdjustment } from '@/features/leave-history/hooks/useLedger';
import { ledgerErrorMessage } from '@/features/leave-history/ledgerMessages';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { newTransactionId } from '@/services/leaveLedger.service';
import type { BalanceTotals, Employee } from '@/types/models';

export interface EditDaysTarget {
  readonly employee: Pick<Employee, 'id' | 'fullName'>;
  /** The employee's current totals for the year, as shown on the page. */
  readonly balance: BalanceTotals;
}

interface EditDaysDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly year: number;
  readonly target: EditDaysTarget | null;
}

/**
 * Edit an employee's allocated days for a year. The change is appended to the history as an "Edit"
 * entry that records the old and new totals, the reason, who changed it, and the date and time —
 * nothing is overwritten. The total can't go below the days already used.
 */
export function EditDaysDialog({ open, onOpenChange, year, target }: EditDaysDialogProps) {
  return (
    <SessionDialog open={open} onOpenChange={onOpenChange}>
      {target ? <EditDaysContent year={year} target={target} /> : null}
    </SessionDialog>
  );
}

function EditDaysContent({
  year,
  target,
}: {
  readonly year: number;
  readonly target: EditDaysTarget;
}) {
  const { onDirtyChange, onRequestClose, onSaved } = useSessionDialog();
  const [transactionId] = useState(() => newTransactionId());
  const adjust = useRecordAdjustment();
  const [serverError, setServerError] = useState<string | null>(null);
  const { employee, balance } = target;
  const used = balance.totalUsed;
  const current = balance.totalCredits;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AdjustmentFormValues, unknown, AdjustmentInput>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { newTotal: String(current), reason: '' },
    mode: 'onTouched',
  });
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const [totalText, reason] = useWatch({ control, name: ['newTotal', 'reason'] });
  const next = Number(totalText);
  const typed = totalText.trim() !== '' && Number.isFinite(next);
  const unchanged = typed && next === current;
  const belowUsed = typed && next < used;
  const tooBig = typed && Math.abs(next - current) > MAX_DAYS_PER_ENTRY;
  const blocked = unchanged || belowUsed || tooBig;
  const delta = typed ? next - current : 0;

  const { run, pending } = useSubmitGuard(async (values: AdjustmentInput) => {
    setServerError(null);
    try {
      await adjust.mutateAsync({
        transactionId,
        employeeId: employee.id,
        year,
        newTotal: values.newTotal,
        reason: values.reason,
      });
      toast.success(
        `Changed ${employee.fullName}’s leave days for ${String(year)} from ${formatDays(current)} to ${formatDays(values.newTotal)}.`,
      );
      onSaved();
    } catch (error) {
      setServerError(ledgerErrorMessage(error, { employeeName: employee.fullName, year }));
    }
  });

  const totalError = belowUsed
    ? `The total can’t be lower than the ${formatDays(used)} days already used.`
    : tooBig
      ? `A single edit can change the total by at most ${String(MAX_DAYS_PER_ENTRY)} days.`
      : errors.newTotal?.message;

  return (
    <DialogContent size="md" dismissible={!pending}>
      <DialogHeader>
        <DialogTitle>Edit days</DialogTitle>
        <DialogDescription>
          Change {employee.fullName}’s total leave days for {year}. The change is added to the
          history with your name, the date and the time; earlier entries are kept.
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
          {serverError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          ) : null}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-control bg-surface-muted p-3 text-sm">
            <dt className="text-fg-muted">Current total</dt>
            <dd className="tabular-nums">{formatDays(current)}</dd>
            <dt className="text-fg-muted">Already used</dt>
            <dd className="tabular-nums">{formatDays(used)}</dd>
            <dt className="text-fg-muted">Remaining</dt>
            <dd className="tabular-nums">{formatDays(current - used)}</dd>
          </dl>

          <DaysField
            label="New total days"
            required
            min="0"
            error={totalError}
            helper={unchanged ? 'Enter a different total to make a change.' : undefined}
            disabled={pending}
            {...register('newTotal')}
          />

          {typed && !blocked ? (
            <p role="status" className="rounded-control bg-pink-50 px-3 py-2 text-sm text-fg">
              Total: <strong>{formatDays(current)}</strong> → <strong>{formatDays(next)}</strong> (
              {delta > 0 ? '+' : '−'}
              {formatDays(Math.abs(delta))}) · Remaining:{' '}
              <strong>{formatDays(current - used)}</strong> →{' '}
              <strong>{formatDays(next - used)}</strong>
            </p>
          ) : null}

          <FormField
            label="Reason for the change"
            required
            error={errors.reason?.message}
            helper={`${String(reason.length)}/${String(REMARKS_MAX_LENGTH)}`}
          >
            {(field) => <Textarea {...field} {...register('reason')} rows={3} disabled={pending} />}
          </FormField>
        </DialogBody>
        <DialogFooter>
          <FormFooter
            submitLabel="Save change"
            onCancel={onRequestClose}
            pending={pending}
            submitDisabled={blocked}
          />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
