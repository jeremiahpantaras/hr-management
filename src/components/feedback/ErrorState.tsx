import { AlertCircle, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ErrorStateProps {
  readonly title?: string;
  /** Use `h1` for a full-page error so the page has a heading. */
  readonly titleAs?: 'p' | 'h1' | 'h2' | 'h3';
  /** A friendly sentence — never raw Firebase text (UI spec §11). */
  readonly message: string;
  /** Short machine code shown in small print, e.g. `PERMISSION_DENIED`. */
  readonly code?: string;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  titleAs: Title = 'p',
  message,
  code,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertCircle aria-hidden="true" className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <Title className="text-card-title text-fg">{title}</Title>
        <p className="text-sm text-fg-muted">{message}</p>
        {code ? <p className="mt-1 text-caption text-fg-muted">Error code: {code}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
