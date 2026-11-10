import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know our custom design tokens (src/styles/index.css @theme); otherwise it
 * mistakes e.g. `text-page-title` for a text colour and drops it when merged with `text-fg`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['page-title', 'section', 'card-title', 'stat', 'caption'],
      radius: ['control', 'card', 'dialog'],
      shadow: ['card', 'popover', 'dialog'],
    },
  },
});

/** Joins conditional class names and resolves Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
