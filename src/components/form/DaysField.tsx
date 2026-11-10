import type { ComponentProps } from 'react';

import { FormField } from '@/components/form/FormField';
import { Input } from '@/components/ui/input';

interface DaysFieldProps extends Omit<
  ComponentProps<typeof Input>,
  'id' | 'type' | 'step' | 'inputMode'
> {
  readonly label: string;
  readonly helper?: string;
  readonly error?: string;
  readonly fieldClassName?: string;
}

/**
 * Credits / days input. Whole and half days only (DAY_STEP 0.5, D-07): `step="0.5"` guides the
 * browser UI; the Zod schema and Security Rules are the actual enforcement.
 */
export function DaysField({
  label,
  helper,
  error,
  required,
  fieldClassName,
  ...inputProps
}: DaysFieldProps) {
  return (
    <FormField
      label={label}
      helper={helper}
      error={error}
      required={required}
      className={fieldClassName}
    >
      {(control) => (
        <div className="relative">
          <Input
            min="0.5"
            max="365"
            {...inputProps}
            {...control}
            required={required}
            type="number"
            step="0.5"
            inputMode="decimal"
            className="pr-14 tabular-nums"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-fg-muted"
          >
            days
          </span>
        </div>
      )}
    </FormField>
  );
}
