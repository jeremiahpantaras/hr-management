import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

interface FilterDropdownProps {
  /** Accessible name and, with the value, what the trigger shows ("Status: Regular"). */
  readonly label: string;
  /** Empty string means "All". */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly FilterOption[];
  readonly allLabel?: string;
  readonly className?: string;
}

// Radix Select forbids an empty-string item value, so "All" travels as a sentinel.
const ALL = '__all__';

/** Single-select filter with an "All" option. */
export function FilterDropdown({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
  className,
}: FilterDropdownProps) {
  return (
    <Select
      value={value === '' ? ALL : value}
      onValueChange={(next) => {
        onChange(next === ALL ? '' : next);
      }}
    >
      <SelectTrigger aria-label={label} className={cn('w-full sm:w-48', className)}>
        <span className="text-fg-muted">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
