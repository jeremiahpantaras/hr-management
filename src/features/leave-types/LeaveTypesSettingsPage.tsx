import { Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { StatusBadge } from '@/components/data/StatusBadge';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import { LeaveTypeFormDialog } from '@/features/leave-types/LeaveTypeFormDialog';
import {
  useAddStarterLeaveTypes,
  useLeaveTypes,
  useSetLeaveTypeActive,
} from '@/features/leave-types/hooks/useLeaveTypes';
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import type { LeaveType } from '@/types/models';

/** Settings → Leave types (UI spec §6.13, FR-LT-01…07). Types are deactivated, never deleted. */
export function LeaveTypesSettingsPage() {
  const query = useLeaveTypes();
  const setActive = useSetLeaveTypeActive();
  const addStarter = useAddStarterLeaveTypes();

  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<LeaveType | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<LeaveType | null>(null);

  function openForm(leaveType: LeaveType | null): void {
    setFormType(leaveType);
    setFormOpen(true);
  }

  async function confirmDeactivate(): Promise<void> {
    if (!deactivateTarget) return;
    try {
      await setActive.mutateAsync({ leaveTypeId: deactivateTarget.id, isActive: false });
      toast.success(`Deactivated ${deactivateTarget.name}.`);
    } catch (error) {
      toast.error(appErrorMessage(error));
      throw error;
    }
  }

  function activate(leaveType: LeaveType): void {
    setActive.mutate(
      { leaveTypeId: leaveType.id, isActive: true },
      {
        onSuccess: () => {
          toast.success(`Activated ${leaveType.name}.`);
        },
        onError: (error) => {
          toast.error(appErrorMessage(error));
        },
      },
    );
  }

  function addStarterTypes(): void {
    addStarter.mutate(undefined, {
      onSuccess: (count) => {
        toast.success(
          count === 0 ? 'The starter types already exist.' : `Added ${String(count)} leave types.`,
        );
      },
      onError: (error) => {
        toast.error(appErrorMessage(error));
      },
    });
  }

  const columns: readonly DataTableColumn<LeaveType>[] = [
    { id: 'name', header: 'Name', isRowHeader: true, cell: (type) => type.name },
    {
      id: 'description',
      header: 'Description',
      priority: 'low',
      cell: (type) => type.description ?? '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: (type) =>
        type.isActive ? (
          <StatusBadge tone="success">Active</StatusBadge>
        ) : (
          <StatusBadge>Inactive</StatusBadge>
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (type) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${type.name}`}
            onClick={() => {
              openForm(type);
            }}
          >
            Edit
          </Button>
          {type.isActive ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Deactivate ${type.name}`}
              onClick={() => {
                setDeactivateTarget(type);
              }}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Activate ${type.name}`}
              disabled={setActive.isPending}
              onClick={() => {
                activate(type);
              }}
            >
              Activate
            </Button>
          )}
        </div>
      ),
    },
  ];

  const loadError = query.isError
    ? {
        message: appErrorMessage(query.error),
        code: errorCodeLabel(query.error),
        onRetry: () => void query.refetch(),
      }
    : null;

  const empty = (
    <EmptyState
      icon={Tags}
      title="No leave types yet"
      description="Add the types your organization uses."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              openForm(null);
            }}
          >
            <Plus aria-hidden="true" />
            Add leave type
          </Button>
          <Button variant="secondary" loading={addStarter.isPending} onClick={addStarterTypes}>
            Add starter types
          </Button>
        </div>
      }
    />
  );

  return (
    <PageContainer>
      <PageHeader
        title="Leave types"
        description="Configure the leave types your organization uses."
        actions={
          <Button
            onClick={() => {
              openForm(null);
            }}
          >
            <Plus aria-hidden="true" />
            Add leave type
          </Button>
        }
      />
      <SettingsLayout>
        <DataTable
          caption="Leave types"
          columns={columns}
          rows={query.data ?? []}
          getRowId={(type) => type.id}
          loading={query.isPending}
          error={loadError}
          empty={empty}
        />
        <p className="mt-4 text-sm text-fg-muted">
          Credits are assigned manually by HR; this app does not apply any statutory entitlements.
        </p>
      </SettingsLayout>

      <LeaveTypeFormDialog open={formOpen} onOpenChange={setFormOpen} leaveType={formType} />
      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        title={`Deactivate ${deactivateTarget?.name ?? 'leave type'}?`}
        description="It will be hidden when allocating credits or recording leave. Existing balances, history, and reports are not affected."
        confirmLabel="Deactivate"
        onConfirm={confirmDeactivate}
      />
    </PageContainer>
  );
}
