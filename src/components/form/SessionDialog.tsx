import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import {
  SessionDialogContext,
  type SessionDialogApi,
} from '@/components/form/sessionDialogContext';
import { Dialog } from '@/components/ui/dialog';

interface SessionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * The `<DialogContent>` (a component that calls `useSessionDialog()`). It is remounted for every
   * open, so it always starts clean.
   */
  readonly children: ReactNode;
}

/**
 * Shared shell for form dialogs: the Dialog stays mounted (so Radix can return focus to whatever
 * opened it), the content is remounted per open via a derived `session` key — which is also how a
 * fresh idempotency key is created for every open (D-05) — and unsaved changes are never discarded
 * without asking.
 */
export function SessionDialog({ open, onOpenChange, children }: SessionDialogProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((previous) => previous + 1);
  }
  const dirty = useRef(false);

  const requestClose = useCallback((): void => {
    if (dirty.current) setConfirmDiscard(true);
    else onOpenChange(false);
  }, [onOpenChange]);
  const onDirtyChange = useCallback((isDirty: boolean): void => {
    dirty.current = isDirty;
  }, []);
  const onSaved = useCallback((): void => {
    dirty.current = false;
    onOpenChange(false);
  }, [onOpenChange]);
  const api = useMemo<SessionDialogApi>(
    () => ({ onDirtyChange, onRequestClose: requestClose, onSaved }),
    [onDirtyChange, requestClose, onSaved],
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestClose();
        }}
      >
        <SessionDialogContext.Provider value={api}>
          <Fragment key={session}>{children}</Fragment>
        </SessionDialogContext.Provider>
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
