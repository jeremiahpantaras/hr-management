import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Semantic table primitives (UI spec §8). `DataTable` composes these with sorting and states. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <table className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-pink-50', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn(className)} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return (
    <tfoot
      className={cn('border-t border-line-strong bg-surface-muted font-medium', className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-line-strong last:border-b-0', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'h-10 border-b border-line-strong px-4 text-left align-middle text-caption font-semibold tracking-wide whitespace-nowrap text-fg-muted uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('min-h-12 px-4 py-3 align-middle text-fg', className)} {...props} />;
}

/** Visually hidden by default: it names the table for assistive technology. */
export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('sr-only', className)} {...props} />;
}
