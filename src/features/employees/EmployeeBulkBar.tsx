import { Archive, ArchiveRestore, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AppError, appErrorMessage } from '@/domain/errors';
import {
  useBulkEmployeeAction,
  useCheckDeletable,
  type BulkEmployeeAction,
} from '@/features/employees/hooks/useEmployees';
import type { BulkActionResult } from '@/services/employees.service';
import type { Employee } from '@/types/models';

interface EmployeeBulkBarProps {
  readonly selected: readonly Employee[];
  /** How many employees match the current filters (for "Select all N"). */
  readonly matchingCount: number;
  readonly allMatchingSelected: boolean;
  readonly onSelectAllMatching: () => void;
  readonly onClear: () => void;
  /** Called with the ids an action finished with, so they can leave the selection. */
  readonly onDone: (finishedIds: readonly string[]) => void;
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

function summarize(
  verb: string,
  results: readonly BulkActionResult[],
): { ok: number; failed: number; message: string } {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  return {
    ok,
    failed,
    message:
      failed === 0
        ? `${verb} ${plural(ok, 'employee', 'employees')}.`
        : `${verb} ${String(ok)} of ${String(results.length)}. ${plural(failed, 'employee', 'employees')} could not be changed.`,
  };
}

/**
 * Appears when rows are selected: archive, restore or permanently delete them in one go. Deleting is
 * refused for anyone with leave records (they are named before the user confirms); archiving is the
 * way to retire those, and it is always reversible.
 */
export function EmployeeBulkBar({
  selected,
  matchingCount,
  allMatchingSelected,
  onSelectAllMatching,
  onClear,
  onDone,
}: EmployeeBulkBarProps) {
  const bulk = useBulkEmployeeAction();
  const check = useCheckDeletable();
  const [confirm, setConfirm] = useState<'archive' | 'restore' | null>(null);
  const [deletePlan, setDeletePlan] = useState<{ deletable: Employee[]; kept: Employee[] } | null>(
    null,
  );

  const active = selected.filter((e) => !e.isArchived);
  const archived = selected.filter((e) => e.isArchived);

  async function run(
    action: BulkEmployeeAction,
    targets: readonly Employee[],
    verb: string,
  ): Promise<void> {
    try {
      const results = await bulk.mutateAsync({ action, ids: targets.map((e) => e.id) });
      const { ok, failed, message } = summarize(verb, results);
      if (failed === 0) toast.success(message);
      else if (ok === 0) toast.error(message);
      else toast.warning(message);
      onDone(results.filter((r) => r.ok).map((r) => r.employeeId));
    } catch (error) {
      toast.error(appErrorMessage(error));
      throw error; // keep the confirm dialog open
    }
  }

  async function startDelete(): Promise<void> {
    try {
      const blockedIds = await check.mutateAsync(selected.map((e) => e.id));
      setDeletePlan({
        deletable: selected.filter((e) => !blockedIds.has(e.id)),
        kept: selected.filter((e) => blockedIds.has(e.id)),
      });
    } catch (error) {
      toast.error(appErrorMessage(error));
    }
  }

  const names = (list: readonly Employee[]): string => {
    const shown = list
      .slice(0, 5)
      .map((e) => e.fullName)
      .join(', ');
    return list.length > 5 ? `${shown} and ${String(list.length - 5)} more` : shown;
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="mb-3 flex flex-col gap-2 rounded-control border border-pink-200 bg-pink-50 p-3 sm:flex-row sm:items-center"
    >
      <p role="status" className="text-sm font-medium text-fg">
        {plural(selected.length, 'employee', 'employees')} selected
        {!allMatchingSelected && matchingCount > selected.length ? (
          <>
            {' · '}
            <button
              type="button"
              onClick={onSelectAllMatching}
              className="rounded-sm font-medium text-primary underline underline-offset-4 hover:text-primary-hover"
            >
              Select all {matchingCount} matching
            </button>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        {active.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setConfirm('archive');
            }}
          >
            <Archive aria-hidden="true" />
            Archive {active.length}
          </Button>
        ) : null}
        {archived.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setConfirm('restore');
            }}
          >
            <ArchiveRestore aria-hidden="true" />
            Restore {archived.length}
          </Button>
        ) : null}
        <Button
          variant="destructive"
          size="sm"
          loading={check.isPending}
          onClick={() => void startDelete()}
        >
          <Trash2 aria-hidden="true" />
          Delete {selected.length}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden="true" />
          Clear selection
        </Button>
      </div>

      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={`Archive ${plural(active.length, 'employee', 'employees')}?`}
        description="Their leave history is kept and appears in reports, but they won't be available when allocating credits or recording leave. You can restore them at any time."
        confirmLabel={`Archive ${String(active.length)}`}
        onConfirm={() => run('archive', active, 'Archived')}
      />
      <ConfirmDialog
        open={confirm === 'restore'}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={`Restore ${plural(archived.length, 'employee', 'employees')}?`}
        description="They become available again for new credits and leave records."
        confirmLabel={`Restore ${String(archived.length)}`}
        onConfirm={() => run('restore', archived, 'Restored')}
      />

      <DeleteDialog
        plan={deletePlan}
        names={names}
        onClose={() => {
          setDeletePlan(null);
        }}
        onConfirm={async (targets) => {
          await run('delete', targets, 'Deleted');
        }}
      />
    </div>
  );
}

function DeleteDialog({
  plan,
  names,
  onClose,
  onConfirm,
}: {
  readonly plan: { deletable: Employee[]; kept: Employee[] } | null;
  readonly names: (list: readonly Employee[]) => string;
  readonly onClose: () => void;
  readonly onConfirm: (targets: readonly Employee[]) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  // Keep the last plan while the dialog fades out so its text does not flip.
  const [shown, setShown] = useState(plan);
  if (plan !== null && plan !== shown) setShown(plan);
  const current = plan ?? shown;
  const deletable = current?.deletable ?? [];
  const kept = current?.kept ?? [];

  async function confirm(): Promise<void> {
    setPending(true);
    try {
      await onConfirm(deletable);
      onClose();
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={plan !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent size="sm" dismissible={!pending}>
        <DialogHeader>
          <DialogTitle>
            {deletable.length > 0
              ? `Delete ${plural(deletable.length, 'employee', 'employees')} permanently?`
              : 'These employees can’t be deleted'}
          </DialogTitle>
          <DialogDescription>
            {deletable.length > 0
              ? "This can't be undone. Their Employee IDs become available again."
              : 'Employees with leave records are kept so their history stays intact.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-5 py-3 text-sm">
          {deletable.length > 0 ? <p className="text-fg">{names(deletable)}</p> : null}
          {kept.length > 0 ? (
            <p
              role="note"
              className="rounded-control border border-warning/30 bg-warning-soft p-3 text-warning"
            >
              <strong>
                {plural(kept.length, 'employee has', 'employees have')} leave records and will be
                kept:
              </strong>{' '}
              {names(kept)}. Archive them instead.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" disabled={pending} onClick={onClose}>
            {deletable.length > 0 ? 'Cancel' : 'Close'}
          </Button>
          {deletable.length > 0 ? (
            <Button variant="destructive" loading={pending} onClick={() => void confirm()}>
              Delete {deletable.length}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
