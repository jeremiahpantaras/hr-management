import { describe, expect, it } from 'vitest';

import { lowBalances, sumTotals } from '@/domain/summary';
import { juan2026, makeBalance } from '@/domain/testFixtures';

describe('sumTotals (TC-SUM-01, BR-CALC-02)', () => {
  it('yields 10 / 5 / 5 for Juan-2026', () => {
    expect(sumTotals(juan2026().balances)).toEqual({
      totalCredits: 10,
      totalUsed: 5,
      totalUnused: 5,
    });
  });
  it('sums across employees (BR-CALC-03)', () => {
    const totals = sumTotals([
      makeBalance({ totalCredits: 10, totalUsed: 3 }),
      makeBalance({ totalCredits: 5, totalUsed: 5 }),
    ]);
    expect(totals).toEqual({ totalCredits: 15, totalUsed: 8, totalUnused: 7 });
  });
  it('returns zeros for a year with no data (EC-14)', () => {
    expect(sumTotals([])).toEqual({ totalCredits: 0, totalUsed: 0, totalUnused: 0 });
  });
});

describe('lowBalances (TC-DASH-04, Q-04)', () => {
  const eligible = new Set(['e1', 'e2']);
  const make = (employeeId: string, credits: number, used: number) =>
    makeBalance({
      id: `${employeeId}_2026`,
      employeeId,
      totalCredits: credits,
      totalUsed: used,
    });

  it('flags ≤ 2 as low and 0 as depleted, lowest first', () => {
    const result = lowBalances([make('e1', 10, 8), make('e2', 5, 5)], eligible);
    expect(result.map((r) => [r.balance.employeeId, r.status])).toEqual([
      ['e2', 'depleted'],
      ['e1', 'low'],
    ]);
  });
  it('treats exactly 2 available as low and 2.5 as fine', () => {
    expect(lowBalances([make('e1', 10, 8)], eligible)).toHaveLength(1);
    expect(lowBalances([make('e1', 10, 7.5)], eligible)).toHaveLength(0);
  });
  it('excludes ineligible (archived) employees and balances with no credits', () => {
    expect(lowBalances([make('archived', 10, 9)], eligible)).toHaveLength(0);
    expect(lowBalances([make('e1', 0, 0)], eligible)).toHaveLength(0);
  });
  it('honours a custom threshold', () => {
    expect(lowBalances([make('e1', 10, 5)], eligible, 5)).toHaveLength(1);
  });
});
