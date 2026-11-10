import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { controlClasses } from '@/components/ui/control-classes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';

export interface EmployeeOption {
  readonly id: string;
  readonly fullName: string;
  readonly employeeNumber: string;
}

interface EmployeeComboboxProps {
  /** The caller decides who is selectable (e.g. non-archived only — BR-EMP-04). */
  readonly employees: readonly EmployeeOption[];
  readonly value: string | null;
  readonly onChange: (employeeId: string) => void;
  readonly id?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly className?: string;
  /** Required when there is no <label for>: the combobox role does not take its name from content. */
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
}

/** Searchable employee picker (name or Employee ID). Presentational: data comes from the caller. */
export function EmployeeCombobox({
  employees,
  value,
  onChange,
  id,
  placeholder = 'Select an employee',
  disabled = false,
  loading = false,
  className,
  ...aria
}: EmployeeComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = employees.find((employee) => employee.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          disabled={disabled || loading}
          className={cn(
            controlClasses,
            'flex h-10 items-center justify-between gap-2 text-left pointer-coarse:h-11',
            className,
          )}
          {...aria}
        >
          <span className={cn('truncate', !selected && 'text-fg-subtle')}>
            {loading
              ? 'Loading employees…'
              : selected
                ? `${selected.fullName} (${selected.employeeNumber})`
                : placeholder}
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64">
        {/* cmdk names its search input from the ROOT `label` (aria-labelledby beats aria-label). */}
        <Command label="Search employees">
          <CommandInput placeholder="Search by name or employee ID" />
          <CommandList id={listId}>
            <CommandEmpty>No employee found.</CommandEmpty>
            {employees.map((employee) => (
              <CommandItem
                key={employee.id}
                value={`${employee.fullName} ${employee.employeeNumber}`}
                onSelect={() => {
                  onChange(employee.id);
                  setOpen(false);
                }}
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    'size-4 text-primary',
                    employee.id === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate">{employee.fullName}</span>
                <span className="ml-auto text-caption text-fg-muted">
                  {employee.employeeNumber}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
