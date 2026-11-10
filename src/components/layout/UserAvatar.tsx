import { cn } from '@/lib/cn';
import { getInitials } from '@/utils/format';

interface UserAvatarProps {
  readonly name: string;
  readonly className?: string;
}

/** Initials on pink-100 with pink-700 text (≈6:1). */
export function UserAvatar({ name, className }: UserAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-sm font-semibold text-pink-700',
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
