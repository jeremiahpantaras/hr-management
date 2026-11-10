import { Timestamp, type DocumentData } from 'firebase/firestore';

import { EMPLOYMENT_STATUSES, TRANSACTION_TYPES, type ReversibleType } from '@/domain/constants';
import type { Employee, LeaveBalance, LeaveTransaction } from '@/types/models';

const toDate = (value: unknown): Date | null =>
  value instanceof Timestamp ? value.toDate() : null;
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Stored employee → domain model (Timestamp → Date, plus the document id). Returns `null` for a
 * document that does not have the required shape: one corrupt record must not break the whole
 * directory, and nothing is guessed (a missing field never becomes a default value).
 */
export function toEmployee(id: string, data: DocumentData): Employee | null {
  const employeeNumber = asString(data.employeeNumber);
  const employeeNumberKey = asString(data.employeeNumberKey);
  const fullName = asString(data.fullName);
  const position = asString(data.position);
  const status = EMPLOYMENT_STATUSES.find((candidate) => candidate === data.employmentStatus);
  if (
    employeeNumber === null ||
    employeeNumberKey === null ||
    fullName === null ||
    position === null ||
    status === undefined ||
    typeof data.isArchived !== 'boolean'
  ) {
    return null;
  }

  return {
    id,
    employeeNumber,
    employeeNumberKey,
    fullName,
    position,
    department: asString(data.department),
    employmentStatus: status,
    isArchived: data.isArchived,
    archivedAt: toDate(data.archivedAt),
    archivedBy: asString(data.archivedBy),
    createdAt: toDate(data.createdAt),
    createdBy: asString(data.createdBy) ?? '',
    updatedAt: toDate(data.updatedAt),
    updatedBy: asString(data.updatedBy) ?? '',
  };
}

/** Stored balance → domain model; `null` when any required figure is missing or malformed. */
export function toLeaveBalance(id: string, data: DocumentData): LeaveBalance | null {
  const employeeId = asString(data.employeeId);
  const lastTransactionId = asString(data.lastTransactionId);
  const year = asNumber(data.year);
  const totalCredits = asNumber(data.totalCredits);
  const totalUsed = asNumber(data.totalUsed);
  const availableCredits = asNumber(data.availableCredits);
  if (
    employeeId === null ||
    lastTransactionId === null ||
    year === null ||
    totalCredits === null ||
    totalUsed === null ||
    availableCredits === null
  ) {
    return null;
  }
  return {
    id,
    employeeId,
    year,
    totalCredits,
    totalUsed,
    availableCredits,
    lastTransactionId,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Stored ledger entry → domain model; `null` when a required field is missing or malformed. */
export function toLeaveTransaction(id: string, data: DocumentData): LeaveTransaction | null {
  const type = TRANSACTION_TYPES.find((candidate) => candidate === data.transactionType);
  const strings = {
    employeeId: asString(data.employeeId),
    employeeNumberSnapshot: asString(data.employeeNumberSnapshot),
    employeeNameSnapshot: asString(data.employeeNameSnapshot),
    positionSnapshot: asString(data.positionSnapshot),
    balanceId: asString(data.balanceId),
    createdBy: asString(data.createdBy),
    createdByName: asString(data.createdByName),
  };
  const numbers = {
    leaveYear: asNumber(data.leaveYear),
    days: asNumber(data.days),
    creditsDelta: asNumber(data.creditsDelta),
    usedDelta: asNumber(data.usedDelta),
    resultingTotalCredits: asNumber(data.resultingTotalCredits),
    resultingTotalUsed: asNumber(data.resultingTotalUsed),
  };
  const reversesType: ReversibleType | null =
    data.reversesType === 'ALLOCATION'
      ? 'ALLOCATION'
      : data.reversesType === 'USAGE'
        ? 'USAGE'
        : null;
  if (
    type === undefined ||
    Object.values(strings).some((value) => value === null) ||
    Object.values(numbers).some((value) => value === null)
  ) {
    return null;
  }
  return {
    id,
    employeeId: strings.employeeId ?? '',
    employeeNumberSnapshot: strings.employeeNumberSnapshot ?? '',
    employeeNameSnapshot: strings.employeeNameSnapshot ?? '',
    positionSnapshot: strings.positionSnapshot ?? '',
    departmentSnapshot: asString(data.departmentSnapshot),
    leaveYear: numbers.leaveYear ?? 0,
    balanceId: strings.balanceId ?? '',
    transactionType: type,
    days: numbers.days ?? 0,
    creditsDelta: numbers.creditsDelta ?? 0,
    usedDelta: numbers.usedDelta ?? 0,
    dateFrom: asString(data.dateFrom),
    dateTo: asString(data.dateTo),
    remarks: asString(data.remarks),
    reversesTransactionId: asString(data.reversesTransactionId),
    reversesType,
    reversedByTransactionId: asString(data.reversedByTransactionId),
    resultingTotalCredits: numbers.resultingTotalCredits ?? 0,
    resultingTotalUsed: numbers.resultingTotalUsed ?? 0,
    createdBy: strings.createdBy ?? '',
    createdByName: strings.createdByName ?? '',
    createdAt: toDate(data.createdAt),
  };
}
