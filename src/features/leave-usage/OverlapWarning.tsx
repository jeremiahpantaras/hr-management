import { AlertTriangle } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatDays } from '@/domain/days';
import type { LeaveTransaction } from '@/types/models';
import { formatDateRange } from '@/utils/format';

interface OverlapWarningProps {
  readonly overlaps: readonly LeaveTransaction[];
  readonly confirmed: boolean;
  readonly onConfirmedChange: (confirmed: boolean) => void;
}

/**
 * Soft warning (BR-LU-09, Q-10): the employee already has leave on some of these dates. It does
 * not block — HR may legitimately record two half days on one date — but it must be acknowledged.
 */
export function OverlapWarning({ overlaps, confirmed, onConfirmedChange }: OverlapWarningProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-fg"
    >
      <p className="flex items-start gap-2 font-medium text-warning">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        This employee already has leave recorded on overlapping dates.
      </p>
      <ul className="flex flex-col gap-1 pl-6">
        {overlaps.map((entry) => (
          <li key={entry.id} className="list-disc">
            {entry.dateFrom && entry.dateTo ? formatDateRange(entry.dateFrom, entry.dateTo) : ''} ·{' '}
            {formatDays(entry.days)} {entry.days === 1 ? 'day' : 'days'}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Checkbox
          id="record-anyway"
          checked={confirmed}
          onCheckedChange={(checked) => {
            onConfirmedChange(checked === true);
          }}
        />
        <Label htmlFor="record-anyway">Record anyway</Label>
      </div>
    </div>
  );
}
