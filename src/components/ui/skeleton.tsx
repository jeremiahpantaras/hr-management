import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Placeholder block that mirrors the final layout while data loads (UI spec §11). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-control bg-line-strong/70', className)}
      {...props}
    />
  );
}
