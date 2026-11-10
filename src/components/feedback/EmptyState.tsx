import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface EmptyStateProps {
  readonly icon?: LucideIcon;
  readonly title: string;
  /**
   * Element used for the title. Inside a page that already has an `<h1>` keep the default `p`
   * (or `h2`); a full-page state (e.g. Not Found) must use `h1` so the page has a heading.
   */
  readonly titleAs?: 'p' | 'h1' | 'h2' | 'h3';
  readonly description?: string;
  /** Primary call to action, e.g. a `Button`. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  titleAs: Title = 'p',
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      {Icon ? (
        <span className="flex size-12 items-center justify-center rounded-full bg-pink-50 text-pink-600">
          <Icon aria-hidden="true" className="size-6" />
        </span>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <Title className="text-card-title text-fg">{title}</Title>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
