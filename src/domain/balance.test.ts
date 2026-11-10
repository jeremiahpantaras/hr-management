import { describe, expect, it } from 'vitest';

import { applyEntryToBalance, calcAvailable } from '@/domain/balance';
import { AppError } from '@/domain/errors';

const totals = (totalCredits: number, totalUsed: number) => ({ totalCredits, totalUsed });

describe('applyEntryToBalance', () => {
  it('creates a balance from an allocation (BR-CR-02)', () => {
    expect(applyEntryToBalance(null, { creditsDelta: 10, usedDelta: 0 })).toEqual(totals(10, 0));
  });
  it('adds credits to an existing balance without losing earlier credits', () => {
    expect(applyEntryToBalance(totals(10, 3), { creditsDelta: 2, usedDelta: 0 })).toEqual(
      totals(12, 3),
    );
  });
  it('allows using exactly what is available (BR-INS-02)', () => {
    const next = applyEntryToBalance(totals(10, 3), { creditsDelta: 0, usedDelta: 7 });
    expect(calcAvailable(next)).toBe(0);
  });
  it('rejects using more than is available, reporting both figures (BR-INS-03)', () => {
    try {
      applyEntryToBalance(totals(10, 9), { creditsDelta: 0, usedDelta: 2 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INSUFFICIENT_BALANCE');
      expect((error as AppError).details).toEqual({ available: 1, requested: 2 });
    }
  });
  it('treats a missing balance as zero available', () => {
    expect(() => applyEntryToBalance(null, { creditsDelta: 0, usedDelta: 1 })).toThrow(AppError);
  });
  it('never lets a total go negative (BR-INV-02)', () => {
    expect(() => applyEntryToBalance(totals(2, 0), { creditsDelta: -3, usedDelta: 0 })).toThrow(
      AppError,
    );
    expect(() => applyEntryToBalance(totals(2, 0), { creditsDelta: 0, usedDelta: -1 })).toThrow(
      AppError,
    );
  });
  it('rejects a delta that is not a multiple of 0.5', () => {
    expect(() => applyEntryToBalance(null, { creditsDelta: 0.3, usedDelta: 0 })).toThrow(AppError);
  });
  it('keeps half-day arithmetic exact (TC-LU-19)', () => {
    let balance = totals(10, 0);
    balance = applyEntryToBalance(balance, { creditsDelta: 0, usedDelta: 0.5 });
    balance = applyEntryToBalance(balance, { creditsDelta: 0, usedDelta: 0.5 });
    expect(balance.totalUsed).toBe(1);
  });
});
