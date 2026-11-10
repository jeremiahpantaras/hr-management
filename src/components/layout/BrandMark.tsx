import { CalendarCheck } from 'lucide-react';

import { APP_NAME } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';

interface BrandMarkProps {
  readonly className?: string;
  /** Hide the wordmark and show the logo tile only. */
  readonly iconOnly?: boolean;
}

/** Logo tile (pink-500 — a non-text accent) plus the application name. */
export function BrandMark({ className, iconOnly = false }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary-fg">
        <CalendarCheck aria-hidden="true" className="size-5" />
      </span>
      {iconOnly ? (
        <span className="sr-only">{APP_NAME}</span>
      ) : (
        <span className="text-card-title text-fg">{APP_NAME}</span>
      )}
    </div>
  );
}
