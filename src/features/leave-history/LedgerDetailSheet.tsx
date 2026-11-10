import { formatDays } from '@/domain/days';
import { availableDelta } from '@/domain/ledger';
import { effectLabel, transactionKind } from '@/domain/ledgerDisplay';
import { LedgerStatus, TransactionTypeBadge } from '@/features/leave-history/LedgerBadges';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { Employee, LeaveTransaction } from '@/types/models';
import { formatDateRange, formatTimestamp } from '@/utils/format';

interface LedgerDetailSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly entry: LeaveTransaction | null;
  /** Current master data, to show "name at time of entry" when it differs (UI §6.11). */
  readonly employee?: Employee | undefined;
  /** All loaded entries, so the original / reversal can be opened from here. */
  readonly loaded: readonly LeaveTransaction[];
  readonly onOpenEntry: (entry: LeaveTransaction) => void;
}

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b py-2 last:border-b-0">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

/** Every field of one ledger entry (UI spec §6.11): snapshots, balance after, and the links. */
export function LedgerDetailSheet({
  open,
  onOpenChange,
  entry,
  employee,
  loaded,
  onOpenEntry,
}: LedgerDetailSheetProps) {
  const original = entry?.reversesTransactionId
    ? loaded.find((candidate) => candidate.id === entry.reversesTransactionId)
    : undefined;
  const reversal = entry?.reversedByTransactionId
    ? loaded.find((candidate) => candidate.id === entry.reversedByTransactionId)
    : undefined;
  const nameChanged =
    employee !== undefined && entry && employee.fullName !== entry.employeeNameSnapshot;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {entry ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-1 border-b px-5 pt-5 pr-14 pb-3">
              <SheetTitle className="text-section text-fg">
                {transactionKind(entry)} · {entry.leaveTypeNameSnapshot}
              </SheetTitle>
              <SheetDescription className="text-sm text-fg-muted">
                {entry.employeeNameSnapshot} · {String(entry.leaveYear)}
              </SheetDescription>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <TransactionTypeBadge entry={entry} />
                <LedgerStatus entry={entry} />
              </div>
            </div>
            <dl className="flex-1 overflow-y-auto px-5 py-2">
              <Row label="Effect">{effectLabel(entry)}</Row>
              <Row label="Days">{formatDays(entry.days)}</Row>
              {entry.dateFrom && entry.dateTo ? (
                <Row label="Leave dates">{formatDateRange(entry.dateFrom, entry.dateTo)}</Row>
              ) : null}
              <Row label="Remarks">{entry.remarks ?? '—'}</Row>
              <Row label="Employee">
                {entry.employeeNameSnapshot} ({entry.employeeNumberSnapshot})
                {nameChanged ? (
                  <span className="block text-caption text-fg-muted">
                    Name at time of entry — now {employee.fullName}
                  </span>
                ) : null}
              </Row>
              <Row label="Position">{entry.positionSnapshot}</Row>
              <Row label="Department">{entry.departmentSnapshot ?? '—'}</Row>
              <Row label="Balance after">
                {formatDays(entry.resultingTotalCredits - entry.resultingTotalUsed)} available (
                {formatDays(entry.resultingTotalCredits)} credits,{' '}
                {formatDays(entry.resultingTotalUsed)} used)
              </Row>
              <Row label="Change in available">{formatDays(availableDelta(entry))}</Row>
              <Row label="Recorded by">{entry.createdByName}</Row>
              <Row label="Date recorded">
                {entry.createdAt ? formatTimestamp(entry.createdAt) : '—'}
              </Row>
              {entry.reversesTransactionId ? (
                <Row label="Reversal of">
                  {original ? (
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        onOpenEntry(original);
                      }}
                    >
                      View the original entry
                    </Button>
                  ) : null}
                  <span className="block text-caption break-all text-fg-muted">
                    {entry.reversesTransactionId}
                  </span>
                </Row>
              ) : null}
              {entry.reversedByTransactionId ? (
                <Row label="Reversed by">
                  {reversal ? (
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        onOpenEntry(reversal);
                      }}
                    >
                      View the reversal
                    </Button>
                  ) : null}
                  <span className="block text-caption break-all text-fg-muted">
                    {entry.reversedByTransactionId}
                  </span>
                </Row>
              ) : null}
              <Row label="Entry ID">
                <span className="text-caption break-all">{entry.id}</span>
              </Row>
              <Row label="Balance ID">
                <span className="text-caption break-all">{entry.balanceId}</span>
              </Row>
            </dl>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
