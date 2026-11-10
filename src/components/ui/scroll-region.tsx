import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

interface ScrollRegionProps extends ComponentProps<'div'> {
  /** Names the region for assistive technology (required for `role="region"`). */
  readonly label: string;
}

/**
 * Horizontally scrollable container (wide tables on small screens).
 *
 * It is focusable ON PURPOSE: a scrollable area that cannot receive focus cannot be scrolled with
 * the keyboard (WCAG 2.1.1; axe rule `scrollable-region-focusable`). This is the single place the
 * `no-noninteractive-tabindex` lint rule is deliberately waived.
 */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable region, see above */
export function ScrollRegion({ label, className, children, ...props }: ScrollRegionProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      // `relative` is essential: `sr-only` text is absolutely positioned and, without a positioned
      // ancestor inside the region, escapes its clipping and widens the whole PAGE on small screens.
      className={cn('relative overflow-x-auto', className)}
      {...props}
    >
      {children}
    </div>
  );
}
/* eslint-enable jsx-a11y/no-noninteractive-tabindex */
