import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import { cn } from '@/lib/cn';
import type { Crumb } from '@/types/navigation';

interface BreadcrumbsProps {
  readonly items: readonly Crumb[];
  readonly className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${String(index)}`} className="flex items-center gap-1.5">
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="rounded-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(isLast ? 'font-medium text-fg' : 'text-fg-muted')}
                >
                  {item.label}
                </span>
              )}
              {isLast ? null : (
                <ChevronRight aria-hidden="true" className="size-3.5 text-fg-subtle" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
