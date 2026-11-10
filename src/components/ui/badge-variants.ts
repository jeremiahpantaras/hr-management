import { cva, type VariantProps } from 'class-variance-authority';

/** Status colours always pair a tinted background with its dark text (UI spec §2.2). */
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-soft text-neutral',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        pink: 'bg-pink-100 text-pink-800',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
