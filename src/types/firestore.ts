import type { Timestamp } from 'firebase/firestore';

import type { EmploymentStatus, ReversibleType, TransactionType } from '@/domain/constants';

/**
 * Stored (Firestore) document shapes — planning/FIRESTORE_DATABASE_DESIGN.md §4. Only the types
 * needed so far; the rest of this file is filled in by Phase 3. Services convert these to the
 * domain models in `models.ts` (Timestamp → Date); nothing outside `src/services` sees them.
 */
export interface UserProfileDoc {
  uid: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EmployeeDoc {
  employeeNumber: string;
  employeeNumberKey: string;
  fullName: string;
  position: string;
  department: string | null;
  employmentStatus: EmploymentStatus;
  isArchived: boolean;
  archivedAt: Timestamp | null;
  archivedBy: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

/** `employeeNumbers/{KEY}` — the uniqueness reservation (D-08). */
export interface EmployeeNumberDoc {
  employeeId: string;
  createdAt: Timestamp;
}

export interface LeaveTypeDoc {
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

export interface LeaveBalanceDoc {
  employeeId: string;
  leaveTypeId: string;
  /** Stored as an integer — the rules build the document id with `string(year)`. */
  year: number;
  totalCredits: number;
  totalUsed: number;
  availableCredits: number;
  lastTransactionId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LeaveTransactionDoc {
  employeeId: string;
  employeeNumberSnapshot: string;
  employeeNameSnapshot: string;
  positionSnapshot: string;
  departmentSnapshot: string | null;
  leaveTypeId: string;
  leaveTypeNameSnapshot: string;
  leaveYear: number;
  balanceId: string;
  transactionType: TransactionType;
  days: number;
  creditsDelta: number;
  usedDelta: number;
  dateFrom: string | null;
  dateTo: string | null;
  remarks: string | null;
  reversesTransactionId: string | null;
  reversesType: ReversibleType | null;
  reversedByTransactionId: string | null;
  resultingTotalCredits: number;
  resultingTotalUsed: number;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
}
