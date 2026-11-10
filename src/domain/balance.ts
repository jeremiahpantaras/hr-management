import { AppError } from '@/domain/errors';
import { isDayMultiple } from '@/domain/days';
import type { BalanceTotals } from '@/types/models';

export interface BalanceEffect {
  readonly creditsDelta: number;
  readonly usedDelta: number;
}

/** BR-CALC-01: `available = totalCredits − totalUsed`. */
export function calcAvailable(totals: BalanceTotals): number {
  return totals.totalCredits - totals.totalUsed;
}

export const EMPTY_TOTALS: BalanceTotals = { totalCredits: 0, totalUsed: 0 };

/**
 * The ONE implementation of balance arithmetic; it mirrors the Security Rules (sign matrix, DB
 * §3.6). Starts from `current` (or an empty balance) and applies a signed effect. Throws
 * `INSUFFICIENT_BALANCE` — carrying both figures — if any total would go negative, so a usage
 * can never exceed what is available (BR-INS-01) and nothing is ever left below zero.
 */
export function applyEntryToBalance(
  current: BalanceTotals | null,
  effect: BalanceEffect,
): BalanceTotals {
  if (!isDayMultiple(effect.creditsDelta) || !isDayMultiple(effect.usedDelta)) {
    throw new AppError('VALIDATION');
  }
  const before = current ?? EMPTY_TOTALS;
  const next: BalanceTotals = {
    totalCredits: before.totalCredits + effect.creditsDelta,
    totalUsed: before.totalUsed + effect.usedDelta,
  };
  if (next.totalCredits < 0 || next.totalUsed < 0 || calcAvailable(next) < 0) {
    throw new AppError('INSUFFICIENT_BALANCE', {
      details: { available: calcAvailable(before), requested: effect.usedDelta },
    });
  }
  return next;
}
