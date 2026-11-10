import type { LucideIcon } from 'lucide-react';

import { ProgressBar } from '@/components/data/ProgressBar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly caption?: string;
  readonly icon?: LucideIcon;
  /** Optional thin progress bar, e.g. used vs total credits. */
  readonly progress?: { readonly value: number; readonly max: number; readonly label: string };
  readonly loading?: boolean;
}

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  progress,
  loading = false,
}: StatCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-600">
            <Icon aria-hidden="true" className="size-5" />
          </span>
        ) : null}
        <p className="text-sm font-medium text-fg-muted">{label}</p>
      </div>
      {loading ? (
        <div role="status" aria-label={`Loading ${label}`} className="flex flex-col gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : (
        <>
          <p className="text-stat text-fg tabular-nums">{value}</p>
          {progress ? <ProgressBar {...progress} /> : null}
          {caption ? <p className="text-caption text-fg-muted">{caption}</p> : null}
        </>
      )}
    </Card>
  );
}
