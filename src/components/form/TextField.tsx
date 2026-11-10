import type { ComponentProps } from 'react';

import { FormField } from '@/components/form/FormField';
import { Input } from '@/components/ui/input';

interface TextFieldProps extends Omit<ComponentProps<typeof Input>, 'id'> {
  readonly label: string;
  readonly helper?: string;
  readonly error?: string;
  readonly fieldClassName?: string;
}

export function TextField({
  label,
  helper,
  error,
  required,
  fieldClassName,
  ...inputProps
}: TextFieldProps) {
  return (
    <FormField
      label={label}
      helper={helper}
      error={error}
      required={required}
      className={fieldClassName}
    >
      {(control) => <Input {...inputProps} {...control} required={required} />}
    </FormField>
  );
}
