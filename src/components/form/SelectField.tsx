import { FormField } from '@/components/form/FormField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SelectFieldProps {
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly helper?: string;
  readonly error?: string;
  readonly disabled?: boolean;
  readonly fieldClassName?: string;
}

export function SelectField({
  label,
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  required,
  helper,
  error,
  disabled,
  fieldClassName,
}: SelectFieldProps) {
  return (
    <FormField
      label={label}
      helper={helper}
      error={error}
      required={required}
      className={fieldClassName}
    >
      {(control) => (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger {...control}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
