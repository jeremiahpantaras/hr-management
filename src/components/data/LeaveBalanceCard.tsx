import { ProgressBar } from '@/components/data/ProgressBar';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Card } from '@/components/ui/card';
import { formatDays } from '@/utils/format';

interface LeaveBalanceCardProps {
  readonly leaveTypeName: string;
  readonly total: number;
  readonly used: number;
  readonly unused: number;
  readonly inactive?: boolean;
}

/** One leave type's balance for the selected year: unused is the headline figure. */
export function LeaveBalanceCard({
  leaveTypeName,
  total,
  used,
  unused,
  inactive,
}: LeaveBalanceCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg">{leaveTypeName}</p>
        {inactive ? <StatusBadge>Inactive</StatusBadge> : null}
      </div>
      <p className="text-stat text-fg tabular-nums">
        {formatDays(unused)}
        <span className="ml-1 text-sm font-normal text-fg-muted">days left</span>
      </p>
      <ProgressBar value={used} max={total} label={`${leaveTypeName} used`} />
      <p className="text-caption text-fg-muted tabular-nums">
        {formatDays(used)} used of {formatDays(total)}
      </p>
    </Card>
  );
}
