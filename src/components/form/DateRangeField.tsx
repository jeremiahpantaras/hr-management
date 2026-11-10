import { FormField } from '@/components/form/FormField';
import { Input } from '@/components/ui/input';

interface DateRangeFieldProps {
  /** Both dates are bounded to this calendar year (BR-LU-04: no cross-year records). */
  readonly year: number;
  readonly from: string;
  readonly to: string;
  readonly onFromChange: (value: string) => void;
  readonly onToChange: (value: string) => void;
  readonly fromError?: string;
  readonly toError?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

/** Two native date inputs (accessible, mobile-friendly; no calendar library — UI spec §6.10). */
export function DateRangeField({
  year,
  from,
  to,
  onFromChange,
  onToChange,
  fromError,
  toError,
  required,
  disabled,
}: DateRangeFieldProps) {
  const min = `${String(year)}-01-01`;
  const max = `${String(year)}-12-31`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Date from" required={required} error={fromError}>
        {(control) => (
          <Input
            {...control}
            type="date"
            min={min}
            max={max}
            value={from}
            disabled={disabled}
            onChange={(event) => {
              onFromChange(event.target.value);
            }}
          />
        )}
      </FormField>
      <FormField label="Date to" required={required} error={toError}>
        {(control) => (
          <Input
            {...control}
            type="date"
            min={from || min}
            max={max}
            value={to}
            disabled={disabled}
            onChange={(event) => {
              onToChange(event.target.value);
            }}
          />
        )}
      </FormField>
    </div>
  );
}
