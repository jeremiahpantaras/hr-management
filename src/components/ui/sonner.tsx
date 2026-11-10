import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

/**
 * Toast host (UI spec §11): plain sentence, 4 s, bottom-right. Styled with design tokens only.
 * Call `toast.success(...)` / `toast.error(...)` from `sonner` anywhere in the app.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!rounded-card !border !border-line !bg-surface !text-fg !shadow-popover !font-sans !text-sm',
          description: '!text-fg-muted',
          closeButton: '!border-line-strong !bg-surface !text-fg-muted',
        },
      }}
      {...props}
    />
  );
}
