export interface LedgerFilterState {
  readonly employeeId: string | null;
  readonly leaveTypeId: string;
  /** `''` = all kinds (history page only). */
  readonly transactionType: string;
  readonly text: string;
  readonly dateFrom: string;
  readonly dateTo: string;
}

export const EMPTY_FILTERS: LedgerFilterState = {
  employeeId: null,
  leaveTypeId: '',
  transactionType: '',
  text: '',
  dateFrom: '',
  dateTo: '',
};
