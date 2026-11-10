import { createContext, useContext } from 'react';

export interface SessionDialogApi {
  /** Tell the shell whether the form has unsaved changes (it asks before discarding them). */
  readonly onDirtyChange: (dirty: boolean) => void;
  /** Close, asking first if there are unsaved changes. */
  readonly onRequestClose: () => void;
  /** Close after a successful save (no confirmation). */
  readonly onSaved: () => void;
}

export const SessionDialogContext = createContext<SessionDialogApi | null>(null);

/** For the form inside a `SessionDialog`. */
export function useSessionDialog(): SessionDialogApi {
  const api = useContext(SessionDialogContext);
  if (api === null) throw new Error('useSessionDialog must be used inside a SessionDialog.');
  return api;
}
