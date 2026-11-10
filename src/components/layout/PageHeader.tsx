import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** Right-aligned page actions; the single primary action is the only solid pink button. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

/** The one `<h1>` of a page, with optional description and actions (UI spec §5.3). */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-page-title text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end max-sm:[&>*]:flex-1">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
