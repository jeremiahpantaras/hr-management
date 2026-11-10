import type { EmploymentStatus, ReversibleType, TransactionType } from '@/domain/constants';

/** Domain models (Firestore-free). Later phases add the remaining ones (DB design §4). */

/**
 * The authorization profile read from `users/{uid}`. `role` is deliberately a plain string: it
 * comes from the database and is NOT trusted until `evaluateProfile` (and, authoritatively, the
 * Security Rules) say it is `hr_admin`.
 */
export interface UserProfile {
  readonly uid: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

/** The signed-in Auth identity — a plain object, so no Firebase types leak out of services. */
export interface AuthUser {
  readonly uid: string;
  readonly email: string | null;
  /**
   * False when the account has no email/password credential (a Google-only sign-in), so there is
   * no password to change. `undefined` is treated as true.
   */
  readonly hasPassword?: boolean;
}

/** An employee record (DB design §3.2) with Firestore timestamps converted to `Date`. */
export interface Employee {
  readonly id: string;
  /** The human-facing "Employee ID". */
  readonly employeeNumber: string;
  /** Upper-cased `employeeNumber`; the uniqueness-reservation key. */
  readonly employeeNumberKey: string;
  readonly fullName: string;
  readonly position: string;
  readonly department: string | null;
  readonly employmentStatus: EmploymentStatus;
  readonly isArchived: boolean;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly createdAt: Date | null;
  readonly createdBy: string;
  readonly updatedAt: Date | null;
  readonly updatedBy: string;
}

/** `YYYY-MM-DD` — leave dates are plain calendar dates, never timestamps (D-06). */
export type IsoDate = string;

/** The two running totals of a balance; `available` is always derived from them. */
export interface BalanceTotals {
  readonly totalCredits: number;
  readonly totalUsed: number;
}

/** The leave credits of one employee for one year (one pool; there are no leave types). */
export interface LeaveBalance extends BalanceTotals {
  /** `{employeeId}_{year}` */
  readonly id: string;
  readonly employeeId: string;
  readonly year: number;
  readonly availableCredits: number;
  readonly lastTransactionId: string;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

/** One immutable ledger entry (DB design §3.6). */
export interface LeaveTransaction {
  readonly id: string;
  readonly employeeId: string;
  readonly employeeNumberSnapshot: string;
  readonly employeeNameSnapshot: string;
  readonly positionSnapshot: string;
  readonly departmentSnapshot: string | null;
  readonly leaveYear: number;
  readonly balanceId: string;
  readonly transactionType: TransactionType;
  /** Always a positive magnitude. */
  readonly days: number;
  readonly creditsDelta: number;
  readonly usedDelta: number;
  readonly dateFrom: IsoDate | null;
  readonly dateTo: IsoDate | null;
  readonly remarks: string | null;
  readonly reversesTransactionId: string | null;
  readonly reversesType: ReversibleType | null;
  readonly reversedByTransactionId: string | null;
  readonly resultingTotalCredits: number;
  readonly resultingTotalUsed: number;
  readonly createdBy: string;
  readonly createdByName: string;
  readonly createdAt: Date | null;
}

/** A ledger entry before the server stamps `createdAt` — what the domain builders return. */
export type NewLeaveTransaction = Omit<LeaveTransaction, 'id' | 'createdAt'>;

/** Who is performing a write (the snapshot stored as "Recorded by"). */
export interface Actor {
  readonly uid: string;
  readonly name: string;
}
