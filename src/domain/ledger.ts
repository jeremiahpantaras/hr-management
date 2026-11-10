import {
  LEAVE_YEAR_RULES_MAX,
  LEAVE_YEAR_RULES_MIN,
  REMARKS_MAX_LENGTH,
  REVERSAL_REASON_MIN_LENGTH,
  type ReversibleType,
  type TransactionType,
} from '@/domain/constants';
import { applyEntryToBalance, calcAvailable, type BalanceEffect } from '@/domain/balance';
import { inclusiveDays, isInYear, isRealDate } from '@/domain/dates';
import { isValidDays } from '@/domain/days';
import { AppError } from '@/domain/errors';
import type {
  Actor,
  BalanceTotals,
  Employee,
  LeaveTransaction,
  NewLeaveTransaction,
} from '@/types/models';

/**
 * Pure builders for the three ledger operations (DB design §6). They contain every business check
 * and all arithmetic, and they return the exact documents the service writes — so the service is
 * only "read, call the builder, write" and the rules are the same checks enforced server-side.
 */

const REVERSAL_PREFIX = 'rev_';

/** `{employeeId}_{year}` — one credit pool per employee per year (both parts are underscore-free). */
export function makeBalanceId(employeeId: string, year: number): string {
  return `${employeeId}_${String(year)}`;
}

/** Deterministic reversal id (R-02): an entry can be reversed at most once. */
export function makeReversalId(originalTransactionId: string): string {
  return `${REVERSAL_PREFIX}${originalTransactionId}`;
}

export function isReversalId(id: string): boolean {
  return id.startsWith(REVERSAL_PREFIX);
}

/** The signed effect of an entry on a balance (sign matrix, DB §3.6). */
export function entryEffect(
  type: TransactionType,
  days: number,
  reversesType: ReversibleType | null = null,
): BalanceEffect {
  switch (type) {
    case 'ALLOCATION':
      return { creditsDelta: days, usedDelta: 0 };
    case 'USAGE':
      return { creditsDelta: 0, usedDelta: days };
    case 'REVERSAL':
      if (reversesType === 'ALLOCATION') return { creditsDelta: -days, usedDelta: 0 };
      if (reversesType === 'USAGE') return { creditsDelta: 0, usedDelta: -days };
      throw new AppError('VALIDATION');
  }
}

/** Change in `available` caused by an entry (`creditsDelta − usedDelta`). */
export function availableDelta(
  entry: Pick<LeaveTransaction, 'creditsDelta' | 'usedDelta'>,
): number {
  return entry.creditsDelta - entry.usedDelta;
}

function normalizeRemarks(remarks: string | null | undefined): string | null {
  const trimmed = (remarks ?? '').trim();
  if (trimmed === '') return null;
  if (trimmed.length > REMARKS_MAX_LENGTH) throw new AppError('VALIDATION');
  return trimmed;
}

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < LEAVE_YEAR_RULES_MIN || year > LEAVE_YEAR_RULES_MAX) {
    throw new AppError('VALIDATION');
  }
}

export interface BuiltEntry {
  readonly entry: NewLeaveTransaction;
  /** The balance totals after the entry. */
  readonly balance: BalanceTotals;
}

interface CommonContext {
  readonly employee: Pick<
    Employee,
    'id' | 'employeeNumber' | 'fullName' | 'position' | 'department' | 'isArchived'
  >;
  /** The balance's current totals, or `null` when it does not exist yet. */
  readonly balance: BalanceTotals | null;
  readonly actor: Actor;
}

function baseEntry(
  context: CommonContext,
  year: number,
  type: TransactionType,
  days: number,
  effect: BalanceEffect,
  after: BalanceTotals,
): NewLeaveTransaction {
  const { employee, actor } = context;
  return {
    employeeId: employee.id,
    employeeNumberSnapshot: employee.employeeNumber,
    employeeNameSnapshot: employee.fullName,
    positionSnapshot: employee.position,
    departmentSnapshot: employee.department,
    leaveYear: year,
    balanceId: makeBalanceId(employee.id, year),
    transactionType: type,
    days,
    creditsDelta: effect.creditsDelta,
    usedDelta: effect.usedDelta,
    dateFrom: null,
    dateTo: null,
    remarks: null,
    reversesTransactionId: null,
    reversesType: null,
    reversedByTransactionId: null,
    resultingTotalCredits: after.totalCredits,
    resultingTotalUsed: after.totalUsed,
    createdBy: actor.uid,
    createdByName: actor.name,
  };
}

function assertUsable(context: CommonContext): void {
  if (context.employee.isArchived) throw new AppError('EMPLOYEE_ARCHIVED');
}

export interface AllocationParams extends CommonContext {
  readonly year: number;
  readonly days: number;
  readonly remarks?: string | null;
}

/** BR-CR-*: adds a new ALLOCATION entry; never overwrites earlier credits. */
export function buildAllocationEntry(params: AllocationParams): BuiltEntry {
  assertUsable(params);
  assertYear(params.year);
  if (!isValidDays(params.days)) throw new AppError('VALIDATION');
  const effect = entryEffect('ALLOCATION', params.days);
  const balance = applyEntryToBalance(params.balance, effect);
  const entry = {
    ...baseEntry(params, params.year, 'ALLOCATION', params.days, effect, balance),
    remarks: normalizeRemarks(params.remarks),
  };
  return { entry, balance };
}

export interface UsageParams extends CommonContext {
  readonly year: number;
  readonly days: number;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly remarks?: string | null;
}

/** BR-LU-*: validates dates, year and days, then deducts from an existing balance. */
export function buildUsageEntry(params: UsageParams): BuiltEntry {
  assertUsable(params);
  assertYear(params.year);
  const { dateFrom, dateTo, days, year } = params;
  if (
    !isValidDays(days) ||
    !isRealDate(dateFrom) ||
    !isRealDate(dateTo) ||
    dateFrom > dateTo ||
    !isInYear(dateFrom, year) ||
    !isInYear(dateTo, year) ||
    days > inclusiveDays(dateFrom, dateTo)
  ) {
    throw new AppError('VALIDATION');
  }
  // BR-LU-06: a usage can never create a balance — with none, available is 0.
  if (params.balance === null) {
    throw new AppError('INSUFFICIENT_BALANCE', { details: { available: 0, requested: days } });
  }
  const effect = entryEffect('USAGE', days);
  const balance = applyEntryToBalance(params.balance, effect);
  const entry = {
    ...baseEntry(params, year, 'USAGE', days, effect, balance),
    dateFrom,
    dateTo,
    remarks: normalizeRemarks(params.remarks),
  };
  return { entry, balance };
}

export interface ReversalParams {
  readonly original: LeaveTransaction;
  readonly balance: BalanceTotals | null;
  readonly reason: string;
  readonly actor: Actor;
}

export interface BuiltReversal extends BuiltEntry {
  /** Id of the reversal entry (`rev_{original}`). */
  readonly reversalId: string;
}

/**
 * BR-COR-*: a mirror of the original with opposite deltas, the same snapshots and dates, and a
 * mandatory reason. An archived employee does NOT block it (R-03).
 */
export function buildReversalEntry(params: ReversalParams): BuiltReversal {
  const { original, actor } = params;
  const reason = params.reason.trim();
  if (reason.length < REVERSAL_REASON_MIN_LENGTH || reason.length > REMARKS_MAX_LENGTH) {
    throw new AppError('VALIDATION');
  }
  if (original.transactionType === 'REVERSAL') throw new AppError('CANNOT_REVERSE');
  if (original.reversedByTransactionId !== null) throw new AppError('ALREADY_REVERSED');
  if (params.balance === null) throw new AppError('CANNOT_REVERSE');

  const reversesType: ReversibleType = original.transactionType;
  const effect = entryEffect('REVERSAL', original.days, reversesType);

  // BR-INS-05: removing credits that have already been used would leave a negative balance.
  if (reversesType === 'ALLOCATION' && calcAvailable(params.balance) + effect.creditsDelta < 0) {
    throw new AppError('CANNOT_REVERSE', {
      details: {
        used: Math.min(original.days, original.days - calcAvailable(params.balance)),
        days: original.days,
      },
    });
  }
  const balance = applyEntryToBalance(params.balance, effect);

  const entry: NewLeaveTransaction = {
    employeeId: original.employeeId,
    employeeNumberSnapshot: original.employeeNumberSnapshot,
    employeeNameSnapshot: original.employeeNameSnapshot,
    positionSnapshot: original.positionSnapshot,
    departmentSnapshot: original.departmentSnapshot,
    leaveYear: original.leaveYear,
    balanceId: original.balanceId,
    transactionType: 'REVERSAL',
    days: original.days,
    creditsDelta: effect.creditsDelta,
    usedDelta: effect.usedDelta,
    dateFrom: original.dateFrom,
    dateTo: original.dateTo,
    remarks: reason,
    reversesTransactionId: original.id,
    reversesType,
    reversedByTransactionId: null,
    resultingTotalCredits: balance.totalCredits,
    resultingTotalUsed: balance.totalUsed,
    createdBy: actor.uid,
    createdByName: actor.name,
  };
  return { entry, balance, reversalId: makeReversalId(original.id) };
}
