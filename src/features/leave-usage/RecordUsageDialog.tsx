import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { DateRangeField } from '@/components/form/DateRangeField';
import { DaysField } from '@/components/form/DaysField';
import { FormField } from '@/components/form/FormField';
import { FormFooter } from '@/components/form/FormFooter';
import { SelectField } from '@/components/form/SelectField';
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
import { REMARKS_MAX_LENGTH } from '@/domain/constants';
import { findOverlaps, inclusiveDays, isRealDate } from '@/domain/dates';
import { formatDays, isValidDays } from '@/domain/days';
import { usageSchema, type UsageFormValues, type UsageInput } from '@/domain/schemas/usage';
import { useEmployeeOptions } from '@/features/employees/hooks/useEmployees';
import { useBalance } from '@/features/leave-credits/hooks/useBalances';
import { ledgerKeys, useRecordUsage } from '@/features/leave-history/hooks/useLedger';
import { ledgerErrorMessage } from '@/features/leave-history/ledgerMessages';
import { OverlapWarning } from '@/features/leave-usage/OverlapWarning';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { findUsageForOverlap, newTransactionId } from '@/services/leaveLedger.service';
import type { LeaveTransaction } from '@/types/models';
import { getYearOptions } from '@/utils/years';

export interface UsageDefaults {
  readonly employeeId?: string;
  readonly year?: number;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly days?: number;
  readonly remarks?: string | null;
}

interface RecordUsageDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The page's selected year: the default for "Leave year". */
  readonly year: number;
  readonly defaults?: UsageDefaults;
  /** Called after the usage is recorded (the page clears a pending-replacement banner). */
  readonly onRecorded?: () => void;
  /** When set, a persistent notice explains that the original was reversed (RK-07). */
  readonly replacementNotice?: boolean;
}

/**
 * Record leave usage (UI spec §6.10). New idempotency key per open; balance strip with insufficient
 * and no-balance handling; native date inputs bounded to the year; a soft overlap warning that
 * must be acknowledged ("Record anyway").
 */
export function RecordUsageDialog({
  open,
  onOpenChange,
  year,
  defaults,
  onRecorded,
  replacementNotice,
}: RecordUsageDialogProps) {
  return (
    <SessionDialog open={open} onOpenChange={onOpenChange}>
      <RecordUsageDialogContent
        year={year}
        defaults={defaults}
        onRecorded={onRecorded}
        replacementNotice={replacementNotice === true}
      />
    </SessionDialog>
  );
}

interface OverlapState {
  /** What the overlaps were computed for; a change of any of it invalidates them. */
  readonly key: string;
  readonly overlaps: readonly LeaveTransaction[];
  readonly confirmed: boolean;
}

function RecordUsageDialogContent({
  year,
  defaults,
  onRecorded,
  replacementNotice,
}: {
  readonly year: number;
  readonly defaults?: UsageDefaults;
  readonly onRecorded?: () => void;
  readonly replacementNotice: boolean;
}) {
  const { onDirtyChange, onRequestClose, onSaved } = useSessionDialog();
  const queryClient = useQueryClient();
  const [transactionId] = useState(() => newTransactionId());
  const { employees, isPending: employeesPending } = useEmployeeOptions();
  const record = useRecordUsage();
  const [serverError, setServerError] = useState<string | null>(null);
  const [overlapState, setOverlapState] = useState<OverlapState | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<UsageFormValues, unknown, UsageInput>({
    resolver: zodResolver(usageSchema),
    defaultValues: {
      employeeId: defaults?.employeeId ?? '',
      year: String(defaults?.year ?? year),
      dateFrom: defaults?.dateFrom ?? '',
      dateTo: defaults?.dateTo ?? '',
      days: defaults?.days === undefined ? '' : String(defaults.days),
      remarks: defaults?.remarks ?? '',
    },
    mode: 'onTouched',
  });
  useEffect(() => {
    // A pre-filled correction counts as unsaved work too.
    onDirtyChange(isDirty || replacementNotice);
  }, [isDirty, replacementNotice, onDirtyChange]);

  const [employeeId, yearText, dateFrom, dateTo, daysText, remarks] = useWatch({
    control,
    name: ['employeeId', 'year', 'dateFrom', 'dateTo', 'days', 'remarks'],
  });
  const yearNumber = Number(yearText);
  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const balanceQuery = useBalance(selectedEmployee ? employeeId : null, yearNumber);
  const balance = balanceQuery.data;
  const requested = Number(daysText);
  const daysValid = isValidDays(requested);
  const noBalance = selectedEmployee !== undefined && !balanceQuery.isPending && balance === null;
  const insufficient =
    balance !== null && balance !== undefined && daysValid && requested > balance.availableCredits;
  const calendarDays =
    isRealDate(dateFrom) && isRealDate(dateTo) && dateFrom <= dateTo
      ? inclusiveDays(dateFrom, dateTo)
      : null;

  const overlapKey = [employeeId, yearText, dateFrom, dateTo].join('|');
  const activeOverlap = overlapState?.key === overlapKey ? overlapState : null;
  const blockedByOverlap = activeOverlap !== null && !activeOverlap.confirmed;

  const { run, pending } = useSubmitGuard(async (values: UsageInput) => {
    setServerError(null);
    const employeeName = selectedEmployee?.fullName ?? 'the employee';
    try {
      // Advisory overlap check against FRESH data, then require an explicit acknowledgement.
      if (activeOverlap === null) {
        const existing = await queryClient.fetchQuery({
          queryKey: ledgerKeys.usage(values.employeeId, values.year),
          queryFn: () => findUsageForOverlap(values.employeeId, values.year),
          staleTime: 0,
        });
        const found = findOverlaps(
          { from: values.dateFrom, to: values.dateTo },
          existing,
          values.employeeId,
        );
        if (found.length > 0) {
          setOverlapState({ key: overlapKey, overlaps: found, confirmed: false });
          return;
        }
      }
      const result = await record.mutateAsync({
        transactionId,
        employeeId: values.employeeId,
        year: values.year,
        days: values.days,
        dateFrom: values.dateFrom,
        dateTo: values.dateTo,
        remarks: values.remarks,
      });
      toast.success(
        `Recorded ${formatDays(values.days)} ${values.days === 1 ? 'day' : 'days'} of leave for ${employeeName}. Remaining: ${formatDays(result.balance.totalCredits - result.balance.totalUsed)}.`,
      );
      onSaved();
      onRecorded?.();
    } catch (error) {
      setServerError(
        ledgerErrorMessage(error, {
          employeeName,
          year: values.year,
          noBalance,
        }),
      );
    }
  });

  return (
    <DialogContent size="md" dismissible={!pending}>
      <DialogHeader>
        <DialogTitle>Record leave usage</DialogTitle>
        <DialogDescription>
          Leave is deducted from the employee&apos;s leave days for the selected year.
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
          {replacementNotice ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                The original entry has been reversed. The replacement has not been saved yet.
              </span>
            </div>
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

          <Controller
            control={control}
            name="employeeId"
            render={({ field }) => (
              <FormField label="Employee" required error={errors.employeeId?.message}>
                {(controlProps) => (
                  <EmployeeCombobox
                    {...controlProps}
                    employees={employees}
                    value={field.value === '' ? null : field.value}
                    onChange={field.onChange}
                    loading={employeesPending}
                    disabled={pending}
                  />
                )}
              </FormField>
            )}
          />
          <Controller
            control={control}
            name="year"
            render={({ field }) => (
              <SelectField
                label="Leave year"
                required
                options={getYearOptions(new Date().getFullYear()).map((y) => ({
                  value: String(y),
                  label: String(y),
                }))}
                value={field.value}
                onValueChange={field.onChange}
                error={errors.year?.message}
                disabled={pending}
              />
            )}
          />
          <DateRangeField
            year={Number.isInteger(yearNumber) ? yearNumber : year}
            from={dateFrom}
            to={dateTo}
            onFromChange={(value) => {
              setValue('dateFrom', value, { shouldDirty: true, shouldValidate: dateFrom !== '' });
            }}
            onToChange={(value) => {
              setValue('dateTo', value, { shouldDirty: true, shouldValidate: dateTo !== '' });
            }}
            fromError={errors.dateFrom?.message}
            toError={errors.dateTo?.message}
            required
            disabled={pending}
          />
          <DaysField
            label="Days to deduct"
            required
            error={errors.days?.message}
            helper={
              calendarDays === null
                ? 'Weekends and holidays are not excluded automatically — enter the number of days to deduct.'
                : `Calendar days in range: ${String(calendarDays)}. Weekends and holidays are not excluded automatically — enter the number of days to deduct.`
            }
            disabled={pending}
            {...register('days')}
          />

          {selectedEmployee ? (
            noBalance ? (
              <p
                role="status"
                className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                No days have been allocated to this employee for {yearText}.{' '}
                <Link to={`/leave-credits?year=${yearText}`} className="font-medium underline">
                  Allocate days
                </Link>
              </p>
            ) : balance ? (
              <p
                role="status"
                className={
                  insufficient
                    ? 'rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger'
                    : 'rounded-control bg-pink-50 px-3 py-2 text-sm text-fg'
                }
              >
                {insufficient ? (
                  <>
                    Not enough days: {formatDays(balance.availableCredits)} available,{' '}
                    {formatDays(requested)} requested.
                  </>
                ) : (
                  <>
                    {yearText} — Available <strong>{formatDays(balance.availableCredits)}</strong>{' '}
                    {balance.availableCredits === 1 ? 'day' : 'days'}.
                    {daysValid ? (
                      <>
                        {' '}
                        After this entry:{' '}
                        <strong>{formatDays(balance.availableCredits - requested)}</strong>.
                      </>
                    ) : null}
                  </>
                )}
              </p>
            ) : null
          ) : null}

          <FormField
            label="Remarks"
            error={errors.remarks?.message}
            helper={`${String(remarks.length)}/${String(REMARKS_MAX_LENGTH)} — please don't enter medical details.`}
          >
            {(field) => (
              <Textarea {...field} {...register('remarks')} rows={3} disabled={pending} />
            )}
          </FormField>

          {activeOverlap ? (
            <OverlapWarning
              overlaps={activeOverlap.overlaps}
              confirmed={activeOverlap.confirmed}
              onConfirmedChange={(confirmed) => {
                setOverlapState({ ...activeOverlap, confirmed });
              }}
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <FormFooter
            submitLabel="Record leave"
            onCancel={onRequestClose}
            pending={pending}
            submitDisabled={noBalance || insufficient || blockedByOverlap}
          />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
