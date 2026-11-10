import type { ComponentProps } from 'react';

import { badgeVariants, type BadgeVariants } from '@/components/ui/badge-variants';
import { cn } from '@/lib/cn';

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & BadgeVariants) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
