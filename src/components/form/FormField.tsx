import { AlertCircle } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';

/** Props a control must receive so label, help text and error are programmatically linked. */
export interface ControlA11yProps {
  readonly id: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'aria-required'?: true;
}

interface FormFieldProps {
  readonly label: string;
  readonly required?: boolean;
  readonly helper?: string;
  /** Message shown under the control; its presence marks the control `aria-invalid`. */
  readonly error?: string;
  readonly className?: string;
  /** Render prop: spread the received props onto the actual control. */
  readonly children: (controlProps: ControlA11yProps) => ReactNode;
}

/**
 * Label + control + helper + error with correct ARIA wiring (UI spec §9). Labels are always
 * visible; required fields get an asterisk plus hidden "(required)" text.
 */
export function FormField({
  label,
  required = false,
  helper,
  error,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-danger">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}
      {helper ? (
        <p id={helperId} className="text-caption text-fg-muted">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1 text-sm text-danger">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
