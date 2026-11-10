import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { FilterDropdown } from '@/components/data/FilterDropdown';
import { SearchInput } from '@/components/data/SearchInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EMPTY_FILTERS, type LedgerFilterState } from '@/features/leave-history/ledgerFilterState';
import type { Employee, LeaveType } from '@/types/models';

interface LedgerFiltersProps {
  readonly value: LedgerFilterState;
  readonly onChange: (next: LedgerFilterState) => void;
  readonly employees: readonly Employee[];
  readonly employeesLoading: boolean;
  readonly leaveTypes: readonly LeaveType[];
  /** Show the Allocation / Usage / Reversal filter (Leave History only). */
  readonly showTypeFilter?: boolean;
  /** The list is already scoped to one employee (the employee page). */
  readonly hideEmployeeFilter?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'ALLOCATION', label: 'Allocation' },
  { value: 'USAGE', label: 'Usage' },
  { value: 'REVERSAL', label: 'Reversal' },
];

/** Filters shared by Leave Usage and Leave History (UI spec §6.9 / §6.11). */
export function LedgerFilters({
  value,
  onChange,
  employees,
  employeesLoading,
  leaveTypes,
  showTypeFilter = false,
  hideEmployeeFilter = false,
}: LedgerFiltersProps) {
  const active = JSON.stringify(value) !== JSON.stringify(EMPTY_FILTERS);
  const set = (patch: Partial<LedgerFilterState>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {hideEmployeeFilter ? null : (
          <div className="lg:w-72">
            <EmployeeCombobox
              employees={employees}
              value={value.employeeId}
              onChange={(employeeId) => {
                set({ employeeId });
              }}
              placeholder="All employees"
              aria-label="Filter by employee"
              loading={employeesLoading}
            />
          </div>
        )}
        <FilterDropdown
          label="Leave type"
          allLabel="All leave types"
          value={value.leaveTypeId}
          options={leaveTypes.map((type) => ({ value: type.id, label: type.name }))}
          onChange={(leaveTypeId) => {
            set({ leaveTypeId });
          }}
        />
        {showTypeFilter ? (
          <FilterDropdown
            label="Type"
            allLabel="All types"
            value={value.transactionType}
            options={TYPE_OPTIONS}
            onChange={(transactionType) => {
              set({ transactionType });
            }}
          />
        ) : null}
        <SearchInput
          label="Search remarks or employee"
          placeholder="Search remarks or employee"
          value={value.text}
          onChange={(text) => {
            set({ text });
          }}
          className="lg:w-72"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-date-from">Leave from</Label>
          <Input
            id="filter-date-from"
            type="date"
            value={value.dateFrom}
            onChange={(event) => {
              set({ dateFrom: event.target.value });
            }}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-date-to">Leave to</Label>
          <Input
            id="filter-date-to"
            type="date"
            value={value.dateTo}
            onChange={(event) => {
              set({ dateTo: event.target.value });
            }}
            className="w-44"
          />
        </div>
        {active ? (
          <Button
            variant="ghost"
            onClick={() => {
              onChange(EMPTY_FILTERS);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
