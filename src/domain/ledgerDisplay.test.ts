import { describe, expect, it } from 'vitest';

import {
  effectLabel,
  isReversible,
  reversalAvailableDelta,
  transactionKind,
} from '@/domain/ledgerDisplay';

describe('effectLabel (UI §6.6)', () => {
  it('shows the signed effect with the right unit', () => {
    expect(effectLabel({ transactionType: 'ALLOCATION', reversesType: null, days: 10 })).toBe(
      '+10 days',
    );
    expect(effectLabel({ transactionType: 'ALLOCATION', reversesType: null, days: 1 })).toBe(
      '+1 day',
    );
    expect(effectLabel({ transactionType: 'USAGE', reversesType: null, days: 2 })).toBe('−2 days');
    expect(effectLabel({ transactionType: 'USAGE', reversesType: null, days: 0.5 })).toBe(
      '−0.5 days',
    );
    expect(effectLabel({ transactionType: 'USAGE', reversesType: null, days: 1 })).toBe('−1 day');
  });
  it('labels reversals by what they reverse', () => {
    expect(effectLabel({ transactionType: 'REVERSAL', reversesType: 'USAGE', days: 1 })).toBe(
      '+1 day (reversal)',
    );
    expect(effectLabel({ transactionType: 'REVERSAL', reversesType: 'ALLOCATION', days: 2 })).toBe(
      '−2 days (reversal)',
    );
  });
});

describe('transactionKind / isReversible / reversalAvailableDelta', () => {
  it('names the kinds', () => {
    expect(transactionKind({ transactionType: 'ALLOCATION' })).toBe('Allocation');
    expect(transactionKind({ transactionType: 'USAGE' })).toBe('Usage');
    expect(transactionKind({ transactionType: 'REVERSAL' })).toBe('Reversal');
  });
  it('only unreversed allocations and usages are reversible (TC-REV-13)', () => {
    expect(isReversible({ transactionType: 'USAGE', reversedByTransactionId: null })).toBe(true);
    expect(isReversible({ transactionType: 'ALLOCATION', reversedByTransactionId: null })).toBe(
      true,
    );
    expect(isReversible({ transactionType: 'USAGE', reversedByTransactionId: 'rev_x' })).toBe(
      false,
    );
    expect(isReversible({ transactionType: 'REVERSAL', reversedByTransactionId: null })).toBe(
      false,
    );
  });
  it('reversing a usage gives days back; reversing an allocation removes them', () => {
    expect(reversalAvailableDelta({ transactionType: 'USAGE', days: 2 })).toBe(2);
    expect(reversalAvailableDelta({ transactionType: 'ALLOCATION', days: 2 })).toBe(-2);
  });
});

describe('edits (ADJUSTMENT)', () => {
  it('is labelled Edit, with the sign of the change', () => {
    expect(transactionKind({ transactionType: 'ADJUSTMENT' })).toBe('Edit');
    const base = { transactionType: 'ADJUSTMENT', reversesType: null, days: 2 } as const;
    expect(effectLabel({ ...base, creditsDelta: 2 })).toBe('+2 days (edit)');
    expect(effectLabel({ ...base, creditsDelta: -2 })).toBe('−2 days (edit)');
    expect(effectLabel({ ...base, days: 1, creditsDelta: -1 })).toBe('−1 day (edit)');
  });
  it('is never reversible; allocations and usages still are', () => {
    const none = { reversedByTransactionId: null };
    expect(isReversible({ ...none, transactionType: 'ADJUSTMENT' })).toBe(false);
    expect(isReversible({ ...none, transactionType: 'ALLOCATION' })).toBe(true);
    expect(isReversible({ ...none, transactionType: 'USAGE' })).toBe(true);
    expect(isReversible({ ...none, transactionType: 'REVERSAL' })).toBe(false);
  });
});
