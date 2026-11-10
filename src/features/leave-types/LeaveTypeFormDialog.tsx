import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { FormField } from '@/components/form/FormField';
import { FormFooter } from '@/components/form/FormFooter';
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
import { Textarea } from '@/components/ui/textarea';
import { AppError, appErrorMessage } from '@/domain/errors';
import {
  isDuplicateLeaveTypeName,
  leaveTypeSchema,
  type LeaveTypeFormValues,
  type LeaveTypeInput,
} from '@/domain/schemas/leaveType';
import {
  useCreateLeaveType,
  useLeaveTypes,
  useUpdateLeaveType,
} from '@/features/leave-types/hooks/useLeaveTypes';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import type { LeaveType } from '@/types/models';

interface LeaveTypeFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `null` = add a new type; a type = edit it. */
  readonly leaveType: LeaveType | null;
}

/**
 * Add / edit a leave type (UI spec §6.13). The form is remounted for every open (derived
 * `session` key), the Dialog itself stays mounted so focus returns to the opener, and typed
 * changes are not discarded without asking.
 */
export function LeaveTypeFormDialog({ open, onOpenChange, leaveType }: LeaveTypeFormDialogProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((previous) => previous + 1);
  }
  const dirty = useRef(false);

  function requestClose(): void {
    if (dirty.current) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestClose();
        }}
      >
        <LeaveTypeFormContent
          key={session}
          leaveType={leaveType}
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

interface LeaveTypeFormContentProps {
  readonly leaveType: LeaveType | null;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onRequestClose: () => void;
  readonly onSaved: () => void;
}

function LeaveTypeFormContent({
  leaveType,
  onDirtyChange,
  onRequestClose,
  onSaved,
}: LeaveTypeFormContentProps) {
  const isEdit = leaveType !== null;
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType();
  const { data: existing } = useLeaveTypes();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isDirty },
  } = useForm<LeaveTypeFormValues, unknown, LeaveTypeInput>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: { name: leaveType?.name ?? '', description: leaveType?.description ?? '' },
    mode: 'onTouched',
  });

  const { run, pending } = useSubmitGuard(async (values: LeaveTypeInput) => {
    setServerError(null);
    // Fast, friendly check against the cached list; the service re-checks against fresh data.
    if (isDuplicateLeaveTypeName(values.name, existing ?? [], leaveType?.id)) {
      setError('name', {
        type: 'server',
        message: appErrorMessage(new AppError('DUPLICATE_LEAVE_TYPE_NAME')),
      });
      setFocus('name');
      return;
    }
    try {
      if (leaveType) {
        await update.mutateAsync({ leaveTypeId: leaveType.id, input: values });
        toast.success(`Saved changes to ${values.name}.`);
      } else {
        await create.mutateAsync(values);
        toast.success(`Added ${values.name}.`);
      }
      onSaved();
    } catch (error) {
      if (error instanceof AppError && error.code === 'DUPLICATE_LEAVE_TYPE_NAME') {
        setError('name', { type: 'server', message: appErrorMessage(error) });
        setFocus('name');
      } else {
        setServerError(appErrorMessage(error));
      }
    }
  });

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <DialogContent size="md" dismissible={!pending}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Edit leave type' : 'Add leave type'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Renaming does not change past entries; reports show the current name.'
            : 'Add a leave type your organization uses.'}
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
          <FormField label="Name" required error={errors.name?.message}>
            {(field) => (
              <Input {...field} {...register('name')} autoComplete="off" disabled={pending} />
            )}
          </FormField>
          <FormField label="Description" error={errors.description?.message}>
            {(field) => (
              <Textarea {...field} {...register('description')} rows={3} disabled={pending} />
            )}
          </FormField>
        </DialogBody>
        <DialogFooter>
          <FormFooter submitLabel="Save leave type" onCancel={onRequestClose} pending={pending} />
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
