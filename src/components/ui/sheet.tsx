import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { useReturnFocus } from '@/hooks/useReturnFocus';
import { cn } from '@/lib/cn';

/** Side panel built on Dialog: the mobile navigation drawer and the ledger detail view. */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  readonly side?: 'left' | 'right';
  readonly hideClose?: boolean;
}

export function SheetContent({
  className,
  children,
  side = 'right',
  hideClose = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: SheetContentProps) {
  const focus = useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus });
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-900/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        onOpenAutoFocus={focus.onOpenAutoFocus}
        onCloseAutoFocus={focus.onCloseAutoFocus}
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col bg-surface shadow-dialog',
          'data-[state=closed]:animate-out data-[state=open]:animate-in',
          side === 'left'
            ? 'left-0 max-w-72 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
            : 'right-0 max-w-120 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          className,
        )}
        {...props}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <X aria-hidden="true" className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
