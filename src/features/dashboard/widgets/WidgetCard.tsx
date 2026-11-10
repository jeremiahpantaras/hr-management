import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { ErrorState } from '@/components/feedback/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { appErrorMessage, errorCodeLabel } from '@/domain/errors';
import { cn } from '@/lib/cn';

interface WidgetCardProps {
  readonly title: string;
  readonly viewAll?: { readonly to: string; readonly label: string };
  readonly loading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Each dashboard widget has its own loading and error state, so one failing query never blanks
 * the page (UI spec §6.4, TC-DASH-08).
 */
export function WidgetCard({
  title,
  viewAll,
  loading,
  error,
  onRetry,
  children,
  className,
}: WidgetCardProps) {
  return (
    <Card className={cn('min-w-0', className)} aria-busy={loading}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {viewAll ? (
          <Link to={viewAll.to} className="text-sm font-medium text-primary hover:underline">
            {viewAll.label}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState
            message={appErrorMessage(error)}
            code={errorCodeLabel(error)}
            onRetry={onRetry}
          />
        ) : loading ? (
          <div role="status" aria-label={`Loading ${title}`} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
