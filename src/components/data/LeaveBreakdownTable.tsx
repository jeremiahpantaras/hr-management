import { StatusBadge } from '@/components/data/StatusBadge';
import { ProgressBar } from '@/components/data/ProgressBar';
import { ScrollRegion } from '@/components/ui/scroll-region';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { formatDays } from '@/utils/format';

export interface LeaveBreakdownRow {
  readonly id: string;
  readonly leaveTypeName: string;
  readonly total: number;
  readonly used: number;
  readonly unused: number;
  readonly inactive?: boolean;
  /** False when no credits were ever assigned for the year (row shows 0 / 0 / 0, muted). */
  readonly hasBalance: boolean;
}

interface LeaveBreakdownTableProps {
  readonly rows: readonly LeaveBreakdownRow[];
  /** Totals row — supplied by the single domain summary function (Phase 3), not recomputed here. */
  readonly totals: { readonly total: number; readonly used: number; readonly unused: number };
  readonly caption: string;
  readonly compact?: boolean;
}

export function LeaveBreakdownTable({
  rows,
  totals,
  caption,
  compact = false,
}: LeaveBreakdownTableProps) {
  return (
    <ScrollRegion label={caption}>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Leave type</TableHead>
            <TableHead className="text-right">Total credits</TableHead>
            <TableHead className="text-right">Used</TableHead>
            <TableHead className="text-right">Unused</TableHead>
            {compact ? null : <TableHead className="hidden w-40 md:table-cell">Usage</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={cn(!row.hasBalance && 'text-fg-muted')}>
              <TableCell className="font-medium">
                <span className="flex flex-wrap items-center gap-2">
                  {row.leaveTypeName}
                  {row.inactive ? <StatusBadge>Inactive</StatusBadge> : null}
                  {row.hasBalance ? null : (
                    <span className="text-caption font-normal text-fg-muted">
                      No credits assigned
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatDays(row.total)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatDays(row.used)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatDays(row.unused)}
              </TableCell>
              {compact ? null : (
                <TableCell className="hidden md:table-cell">
                  <ProgressBar
                    value={row.used}
                    max={row.total}
                    label={`${row.leaveTypeName} used`}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">{formatDays(totals.total)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatDays(totals.used)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatDays(totals.unused)}</TableCell>
            {compact ? null : <TableCell className="hidden md:table-cell" />}
          </TableRow>
        </TableFooter>
      </Table>
    </ScrollRegion>
  );
}
