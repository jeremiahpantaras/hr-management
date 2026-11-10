import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Content width and gutters (UI spec §5.1): max 1280, gutter 16 / 24 / 32. */
export function PageContainer({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8', className)}
      {...props}
    />
  );
}
