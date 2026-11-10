import { cva, type VariantProps } from 'class-variance-authority';

/** Button styles (UI spec §7). Solid pink is pink-600 with white text (≈5:1) — never pink-500. */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control',
    'text-sm font-medium transition-colors duration-150 ease-standard',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-active',
        secondary:
          'border border-line-strong bg-surface text-fg shadow-card hover:bg-hover active:bg-line-strong',
        ghost: 'text-fg-muted hover:bg-hover hover:text-fg active:bg-line-strong',
        destructive:
          'bg-danger-solid text-primary-fg hover:bg-danger-solid-hover active:bg-danger-solid-hover',
        link: 'h-auto rounded-none p-0 text-primary underline-offset-4 hover:text-primary-hover hover:underline',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4 pointer-coarse:h-11',
        lg: 'h-11 px-5',
        icon: 'size-10 pointer-coarse:size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
