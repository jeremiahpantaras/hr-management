import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

import { buttonVariants, type ButtonVariants } from '@/components/ui/button-variants';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';

interface ButtonProps extends ComponentProps<'button'>, ButtonVariants {
  /** Render the child element (e.g. a router `Link`) with button styling. */
  readonly asChild?: boolean;
  /** Shows a spinner, disables the button and sets `aria-busy`. */
  readonly loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
