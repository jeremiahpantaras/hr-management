import { Button } from '@/components/ui/button';

interface FormFooterProps {
  readonly submitLabel: string;
  readonly cancelLabel?: string;
  readonly onCancel?: () => void;
  /** Disables both buttons and shows the spinner on submit — prevents double submission. */
  readonly pending?: boolean;
  readonly submitDisabled?: boolean;
}

/** Cancel + primary submit, in dialog-footer order. The submit button is `type="submit"`. */
export function FormFooter({
  submitLabel,
  cancelLabel = 'Cancel',
  onCancel,
  pending = false,
  submitDisabled = false,
}: FormFooterProps) {
  return (
    <>
      {onCancel ? (
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="submit" loading={pending} disabled={pending || submitDisabled}>
        {submitLabel}
      </Button>
    </>
  );
}
