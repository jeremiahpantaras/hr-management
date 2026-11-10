import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';

interface LoadingStateProps {
  readonly label?: string;
  readonly className?: string;
}

/** Route-level / region fallback; page content prefers `Skeleton`s that mirror the layout. */
export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 px-6 py-12 text-sm text-fg-muted',
        className,
      )}
    >
      <Spinner className="size-5 text-accent" />
      <span>{label}</span>
    </div>
  );
}
