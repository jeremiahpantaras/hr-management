import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/cn';

export interface DataTableColumn<T> {
  readonly id: string;
  readonly header: ReactNode;
  readonly cell: (row: T) => ReactNode;
  readonly align?: 'left' | 'right' | 'center';
  /** `low` columns (Department, Recorded by, Remarks …) are hidden below 768px (UI spec §8). */
  readonly priority?: 'low';
  readonly sortable?: boolean;
  /** Renders the cell as `<th scope="row">` — the cell that identifies the row. */
  readonly isRowHeader?: boolean;
  readonly className?: string;
}

export interface SortState {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}

interface DataTableProps<T> {
  /** Names the table for assistive technology (visually hidden `<caption>`) and its scroll region. */
  readonly caption: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowId: (row: T) => string;
  readonly loading?: boolean;
  readonly skeletonRows?: number;
  readonly error?: {
    readonly message: string;
    readonly code?: string;
    readonly onRetry?: () => void;
  } | null;
  /** Shown inside the table body when there are no rows. Defaults to a generic empty state. */
  readonly empty?: ReactNode;
  readonly sort?: SortState | null;
  readonly onSortChange?: (sort: SortState | null) => void;
  readonly onRowClick?: (row: T) => void;
  /** Keeps the first column visible while scrolling horizontally on narrow screens. */
  readonly stickyFirstColumn?: boolean;
}

const alignClasses = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function nextSort(current: SortState | null | undefined, columnId: string): SortState | null {
  if (current?.columnId !== columnId) return { columnId, direction: 'asc' };
  return current.direction === 'asc' ? { columnId, direction: 'desc' } : null;
}

/**
 * Responsive, accessible table (UI spec §8): scrollable keyboard-focusable region, sticky header,
 * sortable headers with `aria-sort`, skeleton / empty / error states inside the body, optional
 * clickable rows, low-priority columns hidden on small screens. No external table library (R-05).
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  loading = false,
  skeletonRows = 5,
  error = null,
  empty,
  sort,
  onSortChange,
  onRowClick,
  stickyFirstColumn = false,
}: DataTableProps<T>) {
  const columnClass = (column: DataTableColumn<T>, index: number): string =>
    cn(
      alignClasses[column.align ?? 'left'],
      column.priority === 'low' && 'hidden md:table-cell',
      stickyFirstColumn && index === 0 && 'sticky left-0 z-10 bg-inherit',
      column.className,
    );

  /** A click on a link/button/menu item inside a row belongs to that control, not to the row. */
  function isFromInteractiveChild(target: EventTarget): boolean {
    return (
      target instanceof Element &&
      target.closest('a, button, input, select, textarea, [role="menu"], [role="menuitem"]') !==
        null
    );
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onRowClick?.(row);
    }
  }

  function renderBody(): ReactNode {
    if (loading) {
      return Array.from({ length: skeletonRows }, (_, rowIndex) => (
        <TableRow key={`skeleton-${String(rowIndex)}`} aria-hidden="true">
          {columns.map((column, index) => (
            <TableCell key={column.id} className={columnClass(column, index)}>
              <Skeleton className="h-4 w-full max-w-40" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={columns.length}>
            <ErrorState message={error.message} code={error.code} onRetry={error.onRetry} />
          </TableCell>
        </TableRow>
      );
    }

    if (rows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={columns.length}>
            {empty ?? (
              <EmptyState title="Nothing to show" description="There are no records to display." />
            )}
          </TableCell>
        </TableRow>
      );
    }

    return rows.map((row) => (
      <TableRow
        key={getRowId(row)}
        className={cn(
          'bg-surface',
          onRowClick && 'cursor-pointer hover:bg-pink-50/60 focus-visible:bg-pink-50',
        )}
        tabIndex={onRowClick ? 0 : undefined}
        onClick={
          onRowClick
            ? (event) => {
                if (!isFromInteractiveChild(event.target)) onRowClick(row);
              }
            : undefined
        }
        onKeyDown={
          onRowClick
            ? (event) => {
                handleRowKeyDown(event, row);
              }
            : undefined
        }
      >
        {columns.map((column, index) =>
          column.isRowHeader ? (
            <th
              key={column.id}
              scope="row"
              className={cn(
                'px-4 py-3 text-left align-middle font-medium text-fg',
                columnClass(column, index),
              )}
            >
              {column.cell(row)}
            </th>
          ) : (
            <TableCell key={column.id} className={cn('tabular-nums', columnClass(column, index))}>
              {column.cell(row)}
            </TableCell>
          ),
        )}
      </TableRow>
    ));
  }

  return (
    <ScrollRegion
      label={caption}
      aria-busy={loading || undefined}
      className="rounded-card border bg-surface shadow-card"
    >
      <Table>
        <TableCaption>{caption}</TableCaption>
        <TableHeader className="sticky top-0 z-20">
          <TableRow>
            {columns.map((column, index) => {
              const active = sort?.columnId === column.id ? sort : null;
              const ariaSort = active
                ? active.direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined;
              return (
                <TableHead
                  key={column.id}
                  aria-sort={column.sortable ? (ariaSort ?? 'none') : undefined}
                  className={cn(columnClass(column, index), 'bg-pink-50')}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSortChange(nextSort(sort, column.id));
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md uppercase hover:text-fg',
                        column.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {column.header}
                      {active ? (
                        active.direction === 'asc' ? (
                          <ArrowUp aria-hidden="true" className="size-3.5 text-pink-700" />
                        ) : (
                          <ArrowDown aria-hidden="true" className="size-3.5 text-pink-700" />
                        )
                      ) : (
                        <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-60" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>{renderBody()}</TableBody>
      </Table>
    </ScrollRegion>
  );
}
