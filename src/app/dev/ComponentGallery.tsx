import { CalendarPlus, Download, Plus, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { DataTable, type DataTableColumn, type SortState } from '@/components/data/DataTable';
import { EmployeeCombobox } from '@/components/data/EmployeeCombobox';
import { FilterDropdown } from '@/components/data/FilterDropdown';
import { Pagination } from '@/components/data/Pagination';
import { ProgressBar } from '@/components/data/ProgressBar';
import { SearchInput } from '@/components/data/SearchInput';
import { StatCard } from '@/components/data/StatCard';
import { StatusBadge } from '@/components/data/StatusBadge';
import { YearSelect } from '@/components/data/YearSelect';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { DateRangeField } from '@/components/form/DateRangeField';
import { DaysField } from '@/components/form/DaysField';
import { FormField } from '@/components/form/FormField';
import { FormFooter } from '@/components/form/FormFooter';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * DEV-ONLY (registered only when `import.meta.env.DEV`): every design-system component in
 * every state, for visual and accessibility inspection. Not part of the production build.
 */
const swatches = [
  ['bg-pink-50', 'pink-50'],
  ['bg-pink-100', 'pink-100'],
  ['bg-pink-200', 'pink-200'],
  ['bg-pink-400', 'pink-400'],
  ['bg-accent', 'pink-500 accent'],
  ['bg-primary', 'pink-600 primary'],
  ['bg-primary-hover', 'pink-700 hover'],
  ['bg-primary-active', 'pink-800 active'],
  ['bg-fg', 'fg'],
  ['bg-fg-muted', 'fg-muted'],
  ['bg-fg-subtle', 'fg-subtle'],
  ['bg-input', 'input border'],
] as const;

interface DemoRow {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly position: string;
  readonly department: string;
  readonly status: string;
}

const demoRows: readonly DemoRow[] = [
  {
    id: '1',
    number: 'EMP-0042',
    name: 'Juan Dela Cruz',
    position: 'Accounting Staff',
    department: 'Finance',
    status: 'Regular',
  },
  {
    id: '2',
    number: 'EMP-0043',
    name: 'Ana Reyes',
    position: 'HR Officer',
    department: 'Human Resources',
    status: 'Probationary',
  },
  {
    id: '3',
    number: 'EMP-0044',
    name: 'Mario Santos',
    position: 'Driver',
    department: '—',
    status: 'Contractual',
  },
];

const demoColumns: readonly DataTableColumn<DemoRow>[] = [
  { id: 'number', header: 'Employee ID', cell: (row) => row.number, sortable: true },
  {
    id: 'name',
    header: 'Complete name',
    cell: (row) => row.name,
    sortable: true,
    isRowHeader: true,
  },
  { id: 'position', header: 'Position', cell: (row) => row.position, priority: 'low' },
  { id: 'department', header: 'Location', cell: (row) => row.department, priority: 'low' },
  { id: 'status', header: 'Status', cell: (row) => <StatusBadge>{row.status}</StatusBadge> },
  { id: 'amount', header: 'Days', cell: () => '2.5', align: 'right' },
];

const employees = [
  { id: 'e1', fullName: 'Juan Dela Cruz', employeeNumber: 'EMP-0042' },
  { id: 'e2', fullName: 'Ana Reyes', employeeNumber: 'EMP-0043' },
  { id: 'e3', fullName: 'Mario Santos', employeeNumber: 'EMP-0044' },
];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={`g-${title}`} className="flex flex-col gap-4">
      <h2 id={`g-${title}`} className="text-section text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ComponentGallery() {
  const [year, setYear] = useState(2026);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [employee, setEmployee] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>({ columnId: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [from, setFrom] = useState('2026-02-10');
  const [to, setTo] = useState('2026-02-11');

  return (
    <PageContainer className="flex flex-col gap-10">
      <PageHeader
        title="Component gallery"
        description="Development-only inspection page for the design system (not shipped)."
        actions={
          <>
            <Button variant="secondary">
              <Download aria-hidden="true" />
              Export
            </Button>
            <Button>
              <Plus aria-hidden="true" />
              Add employee
            </Button>
          </>
        }
      />

      <Section title="Colour tokens">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {swatches.map(([cls, name]) => (
            <li key={name} className="flex flex-col gap-1.5">
              <span className={`h-12 rounded-control border ${cls}`} />
              <span className="text-caption text-fg-muted">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-page-title">Page title — Leave Days</p>
            <p className="text-section">Section heading — Recent transactions</p>
            <p className="text-card-title">Card heading</p>
            <p className="text-sm">Body text — Juan Dela Cruz filed 2 days of vacation leave.</p>
            <p className="text-sm font-medium">Label — Employee ID</p>
            <p className="text-sm text-fg-muted">Supporting text — Assigned manually by HR.</p>
            <p className="text-caption text-fg-muted">Caption — Last updated Feb 12, 2026</p>
            <p className="text-stat tabular-nums">18 / 5 / 13</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add">
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Section title="Form controls">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Employee ID"
              required
              placeholder="EMP-0001"
              helper="Letters, numbers, dots, dashes."
            />
            <TextField
              label="Complete name"
              required
              defaultValue="Juan"
              error="Enter the employee's complete name."
            />
            <SelectField
              label="Employment status"
              required
              value=""
              onValueChange={() => undefined}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'probationary', label: 'Probationary' },
              ]}
              placeholder="Select status"
            />
            <DaysField label="Days to add" required defaultValue="2.5" />
            <FormField
              label="Remarks"
              className="sm:col-span-2"
              helper="Optional, 500 characters max."
            >
              {(control) => <Textarea {...control} placeholder="Optional note" />}
            </FormField>
            <div className="sm:col-span-2">
              <DateRangeField
                year={2026}
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
                required
              />
            </div>
            <FormField label="Disabled field">
              {(control) => <Input {...control} disabled value="Read only" readOnly />}
            </FormField>
            <div className="flex items-center gap-3 self-end">
              <Checkbox id="g-cb" defaultChecked />
              <Label htmlFor="g-cb">Include archived</Label>
              <Switch aria-label="Show inactive" defaultChecked />
            </div>
            <FormField label="Employee" className="sm:col-span-2">
              {(control) => (
                <EmployeeCombobox
                  {...control}
                  employees={employees}
                  value={employee}
                  onChange={setEmployee}
                />
              )}
            </FormField>
          </CardContent>
        </Card>
      </Section>

      <Section title="Badges and progress">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone="success">Active</StatusBadge>
          <StatusBadge>Archived</StatusBadge>
          <StatusBadge tone="warning">Low</StatusBadge>
          <StatusBadge tone="danger">Depleted</StatusBadge>
          <StatusBadge tone="pink" icon={false}>
            Allocation
          </StatusBadge>
          <StatusBadge tone="warning" icon={false}>
            Reversal
          </StatusBadge>
        </div>
        <div className="grid max-w-md gap-3">
          <ProgressBar value={3} max={10} label="Vacation used" />
          <ProgressBar value={9} max={10} label="Nearly used" tone="warning" />
          <ProgressBar value={10} max={10} label="Fully used" tone="danger" />
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total employees" value="87" icon={Users} caption="Includes archived" />
          <StatCard label="Active employees" value="82" icon={Users} caption="of 87 total" />
          <StatCard label="Total days (2026)" value="1,420" icon={CalendarPlus} />
          <StatCard
            label="Total used"
            value="312"
            icon={CalendarPlus}
            caption="22% of days"
            progress={{ value: 312, max: 1420, label: 'Days used' }}
          />
          <StatCard label="Loading" value="" loading />
        </div>
      </Section>

      <Section title="Filters and pagination">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput
            label="Search employees"
            placeholder="Search by name or employee ID"
            value={search}
            onChange={setSearch}
            className="sm:w-80"
          />
          <FilterDropdown
            label="Status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'regular', label: 'Regular' },
              { value: 'probationary', label: 'Probationary' },
            ]}
          />
          <YearSelect value={year} onChange={setYear} currentYear={2026} />
        </div>
        <Card>
          <Pagination
            mode="pages"
            page={page}
            pageSize={pageSize}
            total={87}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
          <Separator />
          <Pagination
            mode="cursor"
            loadedCount={25}
            hasMore
            onLoadMore={() => toast.info('Load more')}
          />
        </Card>
      </Section>

      <Section title="Data table — normal, loading, empty, error">
        <DataTable
          caption="Employees"
          columns={demoColumns}
          rows={demoRows}
          getRowId={(row) => row.id}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(row) => toast.info(`Opened ${row.name}`)}
          stickyFirstColumn
        />
        <DataTable
          caption="Employees (loading)"
          columns={demoColumns}
          rows={[]}
          getRowId={(row) => row.id}
          loading
          skeletonRows={3}
        />
        <DataTable
          caption="Employees (empty)"
          columns={demoColumns}
          rows={[]}
          getRowId={(row) => row.id}
          empty={
            <EmptyState
              icon={Users}
              title="No employees yet"
              description="Add your first employee to start tracking leave."
              action={<Button>Add employee</Button>}
            />
          }
        />
        <DataTable
          caption="Employees (error)"
          columns={demoColumns}
          rows={[]}
          getRowId={(row) => row.id}
          error={{
            message: 'The employee list could not be loaded.',
            code: 'UNAVAILABLE',
            onRetry: () => toast.info('Retrying'),
          }}
        />
      </Section>

      <Section title="Feedback states">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <EmptyState
              icon={CalendarPlus}
              title="No credits allocated"
              description="No days have been allocated for 2026."
              action={<Button>Allocate days</Button>}
            />
          </Card>
          <Card>
            <ErrorState
              message="We couldn't load this data. Check your connection and try again."
              code="OFFLINE"
              onRetry={() => undefined}
            />
          </Card>
          <Card className="flex flex-col justify-center gap-4 p-6">
            <LoadingState label="Loading 2026 records…" className="py-2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Spinner label="Working" />
          </Card>
        </div>
      </Section>

      <Section title="Tabs, menus, tooltips, toasts, dialogs">
        <Tabs defaultValue="balances">
          <TabsList>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="history">Allocation history</TabsTrigger>
          </TabsList>
          <TabsContent value="balances">
            <p className="text-sm text-fg-muted">Balances tab content.</p>
          </TabsContent>
          <TabsContent value="history">
            <p className="text-sm text-fg-muted">Allocation history tab content.</p>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Actions menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>View</DropdownMenuItem>
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Hover for tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>Weekends are not excluded automatically.</TooltipContent>
          </Tooltip>

          <Button
            variant="secondary"
            onClick={() => toast.success('Added 2 Vacation Leave credits. New total: 12.')}
          >
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.error('Not enough days: 1 available, 2 requested.')}
          >
            Error toast
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button>Open form dialog</Button>
            </DialogTrigger>
            <DialogContent size="md">
              <DialogHeader>
                <DialogTitle>Allocate days</DialogTitle>
                <DialogDescription>
                  Credits are added to the employee&apos;s balance for the year.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(event) => event.preventDefault()}>
                <DialogBody className="flex flex-col gap-4">
                  <TextField label="Employee ID" required />
                  <DaysField label="Days to add" required />
                </DialogBody>
                <DialogFooter>
                  <FormFooter submitLabel="Allocate days" onCancel={() => undefined} />
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            Confirm dialog
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            tone="destructive"
            title="Archive Juan Dela Cruz?"
            description="Their leave history is kept and appears in reports, but they won't be available when allocating days or recording leave. You can restore them at any time."
            confirmLabel="Archive employee"
            onConfirm={() => new Promise<void>((resolve) => setTimeout(resolve, 600))}
          />
        </div>
      </Section>
    </PageContainer>
  );
}
