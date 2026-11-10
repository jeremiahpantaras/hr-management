import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';
import type { BadgeVariants } from '@/components/ui/badge-variants';

type Tone = NonNullable<BadgeVariants['tone']>;

const toneIcons: Partial<Record<Tone, LucideIcon>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

interface StatusBadgeProps extends Omit<ComponentProps<typeof Badge>, 'tone'> {
  readonly tone?: Tone;
  /** Pass `false` to hide the default icon. Colour is never the only signal — text is required. */
  readonly icon?: LucideIcon | false;
}

/** Active / Archived / Low / Depleted / Reversed / transaction types (UI spec §7). */
export function StatusBadge({ tone = 'neutral', icon, children, ...props }: StatusBadgeProps) {
  const Icon = icon === false ? undefined : (icon ?? toneIcons[tone]);
  return (
    <Badge tone={tone} {...props}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </Badge>
  );
}
