import { useCallback, useRef } from 'react';

interface FocusHandlers {
  readonly onOpenAutoFocus?: (event: Event) => void;
  readonly onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Returns focus to the control that opened a modal when it closes (WCAG 2.4.3 Focus Order).
 *
 * Radix's modal dialogs restore focus only to a `<Trigger>`. Ours are opened by application state
 * (a toolbar button, a menu item, the header's menu button), so without this, focus would be lost
 * to the top of the page. The opener is recorded in Radix's `onOpenAutoFocus` — which fires as the
 * content mounts, just before focus moves inside — and refocused on close if it is still in the
 * document. Handlers of your own run first, and one that calls `preventDefault()` takes precedence.
 *
 * Spread the result onto `DialogPrimitive.Content`.
 */
export function useReturnFocus(user: FocusHandlers = {}): Required<FocusHandlers> {
  const opener = useRef<Element | null>(null);
  const { onOpenAutoFocus, onCloseAutoFocus } = user;

  const handleOpen = useCallback(
    (event: Event) => {
      opener.current = document.activeElement;
      onOpenAutoFocus?.(event);
    },
    [onOpenAutoFocus],
  );

  const handleClose = useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const target = opener.current;
      opener.current = null;
      if (event.defaultPrevented) return;
      if (target instanceof HTMLElement && target.isConnected) {
        event.preventDefault();
        target.focus();
      }
    },
    [onCloseAutoFocus],
  );

  return { onOpenAutoFocus: handleOpen, onCloseAutoFocus: handleClose };
}
