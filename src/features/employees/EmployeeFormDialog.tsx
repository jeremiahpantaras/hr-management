import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { FormField } from '@/components/form/FormField';
import { FormFooter } from '@/components/form/FormFooter';
import { SelectField } from '@/components/form/SelectField';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EMPLOYMENT_STATUSES } from '@/domain/constants';
import { AppError, appErrorMessage } from '@/domain/errors';
import {
  employeeSchema,
  type EmployeeFormValues,
  type EmployeeInput,
} from '@/domain/schemas/employee';
import { useCreateEmployee, useUpdateEmployee } from '@/features/employees/hooks/useEmployees';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import type { Employee } from '@/types/models';
import { formatTimestamp } from '@/utils/format';

interface EmployeeFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `null` = add a new employee; an employee = edit it. */
  readonly employee: Employee | null;
}

const STATUS_OPTIONS = EMPLOYMENT_STATUSES.map((status) => ({ value: status, label: status }));

function defaultsFor(employee: Employee | null): Partial<EmployeeFormValues> {
  return employee
    ? {
        employeeNumber: employee.employeeNumber,
        fullName: employee.fullName,
        position: employee.position,
        department: employee.department ?? '',
        employmentStatus: employee.employmentStatus,
      }
    : {
        employeeNumber: '',
        fullName: '',
        position: '',
        department: '',
        employmentStatus: undefined,
      };
}

/**
 * Add / edit employee (UI spec §6.5). Validated with the shared Zod schema; the server's
 * duplicate-ID verdict appears under the Employee ID field. Cannot be dismissed while saving, and
 * asks before discarding typed changes.
 */
export function EmployeeFormDialog({ open, onOpenChange, employee }: EmployeeFormDialogProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // A new "session" key on every open remounts the form, so it always starts clean for the
  // employee being edited (React's pattern for resetting state when a prop changes: no effect).
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((previous) => previous + 1);
  }

  // Whether the form (which lives inside the dialog content) has unsaved changes. A ref, not state:
  // it is read only when the user tries to close, never during render.
  const dirty = useRef(false);

  function requestClose(): void {
    if (dirty.current) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  return (
    <>
      {/* The Dialog stays mounted so Radix can return focus to the control that opened it; the
          form is remounted per open via `key`. */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestClose();
        }}
      >
        <EmployeeFormDialogContent
          key={session}
          employee={employee}
          onDirtyChange={(isDirty) => {
            dirty.current = isDirty;
          }}
          onRequestClose={requestClose}
          onSaved={() => {
            dirty.current = false;
            onOpenChange(false);
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard changes?"
        description="You have unsaved changes. If you close now, they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          dirty.current = false;
          onOpenChange(false);
        }}
      />
    </>
  );
}

interface EmployeeFormDialogContentProps {
  readonly employee: Employee | null;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onRequestClose: () => void;
  readonly onSaved: () => void;
}

function EmployeeFormDialogContent({
  employee,
  onDirtyChange,
  onRequestClose,
  onSaved,
}: EmployeeFormDialogContentProps) {
  const isEdit = employee !== null;
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isDirty },
  } = useForm<EmployeeFormValues, unknown, EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    defaultValues: defaultsFor(employee),
    mode: 'onTouched',
  });

  const { run, pending } = useSubmitGuard(async (values: EmployeeInput) => {
    setServerError(null);
    try {
      if (employee) {
        await updateEmployee.mutateAsync({ employeeId: employee.id, input: values });
        toast.success(`Saved changes to ${values.fullName}.`);
      } else {
        await createEmployee.mutateAsync(values);
        toast.success(`Added ${values.fullName}.`);
      }
      onSaved();
    } catch (error) {
      if (error instanceof AppError && error.code === 'DUPLICATE_EMPLOYEE_NUMBER') {
        setError('employeeNumber', { type: 'server', message: appErrorMessage(error) });
        setFocus('employeeNumber');
      } else {
        setServerError(appErrorMessage(error));
      }
    }
  });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <>
      <DialogContent size="md" dismissible={!pending}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit employee' : 'Add employee'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Changes apply to the employee record. Leave history is never altered.'
              : 'Add an employee to start tracking their leave.'}
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

            <FormField label="Employee ID" required error={errors.employeeNumber?.message}>
              {(field) => (
                <Input
                  {...field}
                  {...register('employeeNumber')}
                  autoComplete="off"
                  disabled={pending}
                />
              )}
            </FormField>
            <FormField label="Complete name" required error={errors.fullName?.message}>
              {(field) => (
                <Input {...field} {...register('fullName')} autoComplete="off" disabled={pending} />
              )}
            </FormField>
            <FormField label="Position" required error={errors.position?.message}>
              {(field) => (
                <Input {...field} {...register('position')} autoComplete="off" disabled={pending} />
              )}
            </FormField>
            <FormField label="Department" error={errors.department?.message}>
              {(field) => (
                <Input
                  {...field}
                  {...register('department')}
                  autoComplete="off"
                  disabled={pending}
                />
              )}
            </FormField>
            <Controller
              control={control}
              name="employmentStatus"
              render={({ field }) => (
                <SelectField
                  label="Employment status"
                  required
                  placeholder="Select status"
                  options={STATUS_OPTIONS}
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  error={errors.employmentStatus?.message}
                  disabled={pending}
                />
              )}
            />
          </DialogBody>

          <DialogFooter className="sm:items-center">
            {employee?.createdAt && employee.updatedAt ? (
              <p className="text-caption text-fg-muted sm:mr-auto">
                Created {formatTimestamp(employee.createdAt)} · Updated{' '}
                {formatTimestamp(employee.updatedAt)}
              </p>
            ) : null}
            <FormFooter submitLabel="Save employee" onCancel={onRequestClose} pending={pending} />
          </DialogFooter>
        </form>
      </DialogContent>
    </>
  );
}
