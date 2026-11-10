import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PageModeProps {
  readonly mode: 'pages';
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (size: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

interface CursorModeProps {
  readonly mode: 'cursor';
  readonly loadedCount: number;
  readonly hasMore: boolean;
  readonly loading?: boolean;
  readonly onLoadMore: () => void;
}

type PaginationProps = PageModeProps | CursorModeProps;

/** Client-side paging ("Showing 1–25 of 87") or server cursor paging ("Load more" — UI spec §8). */
export function Pagination(props: PaginationProps) {
  if (props.mode === 'cursor') {
    return (
      <div className="flex flex-col items-center gap-2 py-3 sm:flex-row sm:justify-between sm:px-4">
        <p role="status" className="text-sm text-fg-muted tabular-nums">
          Loaded {props.loadedCount} {props.loadedCount === 1 ? 'row' : 'rows'}
        </p>
        {props.hasMore ? (
          <Button variant="secondary" size="sm" loading={props.loading} onClick={props.onLoadMore}>
            Load more
          </Button>
        ) : null}
      </div>
    );
  }

  const { page, pageSize, total, onPageChange, onPageSizeChange } = props;
  const pageSizeOptions = props.pageSizeOptions ?? [10, 25, 50];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center gap-3 px-4 py-3 sm:flex-row sm:justify-between"
    >
      <p role="status" className="text-sm text-fg-muted tabular-nums">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <Select
            value={String(pageSize)}
            onValueChange={(next) => {
              onPageSizeChange(Number(next));
            }}
          >
            <SelectTrigger aria-label="Rows per page" className="h-8 w-34 pointer-coarse:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="size-8 pointer-coarse:size-11"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => {
              onPageChange(page - 1);
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="min-w-20 text-center text-sm text-fg-muted tabular-nums">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="secondary"
            size="icon"
            className="size-8 pointer-coarse:size-11"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => {
              onPageChange(page + 1);
            }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
