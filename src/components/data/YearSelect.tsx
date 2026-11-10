import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { LEAVE_YEAR_UI_MIN, getYearOptions } from '@/utils/years';

interface YearSelectProps {
  readonly value: number;
  readonly onChange: (year: number) => void;
  readonly minYear?: number;
  /** Defaults to the real current year; injectable for tests. */
  readonly currentYear?: number;
  readonly className?: string;
}

/** Leave-year picker. Pages bind it to `?year=` with `useYearParam` (Architecture §4.3). */
export function YearSelect({
  value,
  onChange,
  minYear = LEAVE_YEAR_UI_MIN,
  currentYear = new Date().getFullYear(),
  className,
}: YearSelectProps) {
  const years = getYearOptions(currentYear, minYear);
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => {
        onChange(Number(next));
      }}
    >
      <SelectTrigger aria-label="Leave year" className={cn('w-full sm:w-32', className)}>
        <span className="text-fg-muted">Year:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
