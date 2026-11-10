import { AppError, appErrorMessage } from '@/domain/errors';

export interface LedgerErrorContext {
  readonly employeeName?: string;
  readonly leaveTypeName?: string;
  readonly year?: number;
  /** True when the employee × type × year balance does not exist (usage only). */
  readonly noBalance?: boolean;
}

/** Server-side failures with the names filled in (UI spec §12); everything else is generic. */
export function ledgerErrorMessage(error: unknown, context: LedgerErrorContext = {}): string {
  if (error instanceof AppError) {
    const { employeeName, leaveTypeName, year, noBalance } = context;
    if (error.code === 'EMPLOYEE_ARCHIVED' && employeeName) {
      return `${employeeName} is archived. Restore them to continue.`;
    }
    if (error.code === 'LEAVE_TYPE_INACTIVE' && leaveTypeName) {
      return `${leaveTypeName} is inactive and can't be used for new entries.`;
    }
    if (
      error.code === 'INSUFFICIENT_BALANCE' &&
      noBalance &&
      employeeName &&
      leaveTypeName &&
      year
    ) {
      return `No ${leaveTypeName} credits have been allocated to ${employeeName} for ${String(year)}.`;
    }
  }
  return appErrorMessage(error);
}
