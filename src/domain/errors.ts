/**
 * The application's error taxonomy (Architecture §8.3, DB design §4). Services translate
 * Firebase errors into these; the UI turns a code into friendly copy and never shows raw
 * Firebase text. (`AuthServiceError` in services/auth.errors.ts is the sign-in-specific
 * counterpart.)
 */
export type AppErrorCode =
  | 'VALIDATION'
  | 'INSUFFICIENT_BALANCE'
  | 'EMPLOYEE_ARCHIVED'
  | 'LEAVE_TYPE_INACTIVE'
  | 'DUPLICATE_EMPLOYEE_NUMBER'
  | 'DUPLICATE_LEAVE_TYPE_NAME'
  | 'ALREADY_REVERSED'
  | 'CANNOT_REVERSE'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'CONTENTION'
  | 'OFFLINE'
  | 'UNKNOWN';

/** Figures that make a message specific ("3 of its 10 credits are already used"). */
export interface AppErrorDetails {
  readonly available?: number;
  readonly requested?: number;
  readonly used?: number;
  readonly days?: number;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: AppErrorDetails;
  /**
   * The backend's own short error code (e.g. `failed-precondition`) when this error was translated
   * from one. A code only — never raw Firebase text — so it is safe to show and to share.
   */
  readonly sourceCode: string | null;

  constructor(
    code: AppErrorCode,
    options?: ErrorOptions & { details?: AppErrorDetails; sourceCode?: string | null },
  ) {
    super(code, options);
    this.name = 'AppError';
    this.code = code;
    this.details = options?.details ?? {};
    this.sourceCode = options?.sourceCode ?? null;
  }
}

/** UI spec §12 copy. */
const MESSAGES: Record<AppErrorCode, string> = {
  VALIDATION: 'Please check the highlighted fields and try again.',
  INSUFFICIENT_BALANCE: 'There are not enough leave credits for that.',
  EMPLOYEE_ARCHIVED: 'That employee is archived. Restore them to continue.',
  LEAVE_TYPE_INACTIVE: "That leave type is inactive and can't be used for new entries.",
  DUPLICATE_EMPLOYEE_NUMBER: 'This employee ID is already in use.',
  DUPLICATE_LEAVE_TYPE_NAME: 'A leave type with this name already exists.',
  ALREADY_REVERSED: 'This entry has already been reversed.',
  CANNOT_REVERSE: "This entry can't be reversed.",
  NOT_FOUND: 'That record no longer exists. Refresh and try again.',
  PERMISSION_DENIED: 'You no longer have permission to do that. Please sign in again.',
  CONTENTION: 'Another change was saving at the same time. Please try again.',
  OFFLINE: "You're offline. Reconnect and try again.",
  UNKNOWN: 'Something went wrong. Try again.',
};

const fmt = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** Friendly message for any thrown value — never raw error text. UI spec §12. */
export function appErrorMessage(error: unknown): string {
  if (!(error instanceof AppError)) return MESSAGES.UNKNOWN;
  const { available, requested, used, days } = error.details;
  if (error.code === 'INSUFFICIENT_BALANCE' && available !== undefined && requested !== undefined) {
    return `Not enough credits: ${fmt(available)} available, ${fmt(requested)} requested.`;
  }
  if (error.code === 'CANNOT_REVERSE' && used !== undefined && days !== undefined) {
    return `Can't reverse this allocation: ${fmt(used)} of its ${fmt(days)} credits are already used. Reverse the related usage entries first.`;
  }
  return MESSAGES[error.code];
}

/** `UNKNOWN (failed-precondition)` — the small-print code shown under an error (never raw text). */
export function errorCodeLabel(error: unknown): string | undefined {
  if (!(error instanceof AppError)) return undefined;
  return error.sourceCode === null ? error.code : `${error.code} (${error.sourceCode})`;
}
