import { useEffect } from 'react';

export const APP_NAME = 'HR Leave Monitor';

/** Sets `{title} · HR Leave Monitor` as the document title (unique per route — UI spec §15). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
