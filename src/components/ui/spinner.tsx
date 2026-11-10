import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';

interface SpinnerProps {
  readonly className?: string;
  /** Accessible name. Omit when the spinner sits inside a control that already says why. */
  readonly label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex">
      <Loader2 aria-hidden="true" className={cn('size-4 animate-spin', className)} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
