import { cn } from '@/lib/cn';

interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  /** Accessible name, e.g. "Vacation Leave used". */
  readonly label: string;
  readonly tone?: 'accent' | 'warning' | 'danger';
  readonly className?: string;
}

const fillClasses = {
  accent: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

/** Pink-500 fill on a pink-100 track (UI spec §1). Pure CSS — no chart library (R-05). */
export function ProgressBar({ value, max, label, tone = 'accent', className }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-pink-100', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300 ease-standard',
          fillClasses[tone],
        )}
        style={{ width: `${String(percent)}%` }}
      />
    </div>
  );
}
