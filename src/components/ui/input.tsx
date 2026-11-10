import type { ComponentProps } from 'react';

import { controlClasses } from '@/components/ui/control-classes';
import { cn } from '@/lib/cn';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(controlClasses, 'h-10 pointer-coarse:h-11', className)}
      {...props}
    />
  );
}
