import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
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
import { formatDays, isValidDays } from '@/domain/days';
import {
  allocationSchema,
  type AllocationFormValues,
  type AllocationInput,
} from '@/domain/schemas/allocation';
import { useEmployeeOptions } from '@/features/employees/hooks/useEmployees';
import { useBalance } from '@/features/leave-credits/hooks/useBalances';
import { useRecordAllocation } from '@/features/leave-history/hooks/useLedger';
import { ledgerErrorMessage } from '@/features/leave-history/ledgerMessages';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { newTransactionId } from '@/services/leaveLedger.service';
import { getYearOptions } from '@/utils/years';

export interface AllocationDefaults {
  readonly employeeId?: string;
}

interface AllocationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The page's selected year: the default for the "Leave year" field. */
  readonly year: number;
  readonly defaults?: AllocationDefaults;
}

/**
 * Allocate credits (UI spec §6.8). A fresh idempotency key is created every time the dialog opens
 * (the content is remounted per open), so a retry reuses it and a deliberate second entry does not
 * (D-05). Only active employees can be chosen (BR-CR-04).
 */
export function AllocationDialog({ open, onOpenChange, year, defaults }: AllocationDialogProps) {
  return (
    <SessionDialog open={open} onOpenChange={onOpenChange}>
      <AllocationDialogContent year={year} defaults={defaults} />
    </SessionDialog>
  );
}

function AllocationDialogContent({
  year,
  defaults,
}: {
  readonly year: number;
  readonly defaults?: AllocationDefaults;
}) {
  const { onDirtyChange, onRequestClose, onSaved } = useSessionDialog();
  // One id per dialog session: the idempotency key (D-05).
  const [transactionId] = useState(() => newTransactionId());
  const { employees, isPending: employeesPending } = useEmployeeOptions();
  const allocate = useRecordAllocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AllocationFormValues, unknown, AllocationInput>({
    resolver: zodResolver(allocationSchema),
    defaultValues: {
      employeeId: defaults?.employeeId ?? '',
      year: String(year),
      days: '',
      remarks: '',
    },
    mode: 'onTouched',
  });
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const [employeeId, yearText, daysText, remarks] = useWatch({
    control,
    name: ['employeeId', 'year', 'days', 'remarks'],
  });
  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  const yearNumber = Number(yearText);
  const balance = useBalance(selectedEmployee ? employeeId : null, yearNumber);
  const added = Number(daysText);
  const currentTotal = balance.data?.totalCredits ?? 0;
  const showPreview = selectedEmployee !== undefined && !balance.isPending;

  const { run, pending } = useSubmitGuard(async (values: AllocationInput) => {
    setServerError(null);
    const employeeName = selectedEmployee?.fullName ?? 'the employee';
    try {
      const result = await allocate.mutateAsync({
        transactionId,
        employeeId: values.employeeId,
        year: values.year,
        days: values.days,
        remarks: values.remarks,
      });
      toast.success(
        `Added ${formatDays(values.days)} credits for ${employeeName} (${String(values.year)}). New total: ${formatDays(result.balance.totalCredits)}.`,
      );
      onSaved();
    } catch (error) {
      setServerError(ledgerErrorMessage(error, { employeeName, year: values.year }));
    }
  });

  return (
    <DialogContent size="md" dismissible={!pending}>
      <DialogHeader>
        <DialogTitle>Allocate credits</DialogTitle>
        <DialogDescription>
          Credits are added as a new entry; earlier credits are never overwritten.
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

          <Controller
            control={control}
            name="employeeId"
            render={({ field }) => (
              <FormField label="Employee" required error={errors.employeeId?.message}>
                {(control) => (
                  <EmployeeCombobox
                    {...control}
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
          <DaysField
            label="Credits to add"
            required
            error={errors.days?.message}
            disabled={pending}
            {...register('days')}
          />

          {showPreview ? (
            <p role="status" className="rounded-control bg-pink-50 px-3 py-2 text-sm text-fg">
              Current total: <strong>{formatDays(currentTotal)}</strong> → After this allocation:{' '}
              <strong>
                {isValidDays(added) ? formatDays(currentTotal + added) : formatDays(currentTotal)}
              </strong>{' '}
              ({yearText})
            </p>
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
        </DialogBody>
        <DialogFooter>
          <FormFooter submitLabel="Allocate credits" onCancel={onRequestClose} pending={pending} />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
