import { describe, expect, it } from 'vitest';

import { lowBalances, summarizeBalances, sumTotals } from '@/domain/summary';
import { EMERGENCY, SICK, VACATION, juan2026, makeBalance, makeType } from '@/domain/testFixtures';

describe('summarizeBalances (TC-SUM-01, BR-CALC-02)', () => {
  const { balances } = juan2026();
  const types = [VACATION, SICK, EMERGENCY];

  it('yields 18 / 5 / 13 for Juan-2026', () => {
    expect(summarizeBalances(balances, types).totals).toEqual({
      totalCredits: 18,
      totalUsed: 5,
      totalUnused: 13,
    });
  });
  it('yields the per-type rows 10/3/7, 5/2/3, 3/0/3', () => {
    const rows = summarizeBalances(balances, types).rows.map((r) => [
      r.leaveTypeName,
      r.totalCredits,
      r.totalUsed,
      r.totalUnused,
    ]);
    expect(rows).toEqual([
      ['Emergency Leave', 3, 0, 3],
      ['Sick Leave', 5, 2, 3],
      ['Vacation Leave', 10, 3, 7],
    ]);
  });
  it('shows an active type with no balance as zeros (TC-SUM-04)', () => {
    const summary = summarizeBalances(balances.slice(0, 1), types);
    const sick = summary.rows.find((r) => r.leaveTypeId === 'sick');
    expect(sick).toMatchObject({
      hasBalance: false,
      totalCredits: 0,
      totalUsed: 0,
      totalUnused: 0,
    });
  });
  it('keeps an inactive type that has a balance, marked inactive (TC-SUM-05)', () => {
    const inactive = [makeType('vac', 'Vacation Leave', false), SICK];
    const summary = summarizeBalances(balances, inactive);
    expect(summary.rows.find((r) => r.leaveTypeId === 'vac')?.isActive).toBe(false);
    expect(summary.totals.totalCredits).toBe(18);
  });
  it('omits an inactive type that has no balance', () => {
    const summary = summarizeBalances([], [makeType('old', 'Old', false)]);
    expect(summary.rows).toHaveLength(0);
  });
  it('still counts a balance whose type is missing from the list', () => {
    const summary = summarizeBalances(balances, [VACATION]);
    expect(summary.totals.totalCredits).toBe(18);
    expect(summary.rows).toHaveLength(3);
  });
  it('sums across employees without mixing anything else (BR-CALC-03)', () => {
    const totals = sumTotals([
      makeBalance({ totalCredits: 10, totalUsed: 3 }),
      makeBalance({ totalCredits: 5, totalUsed: 5 }),
    ]);
    expect(totals).toEqual({ totalCredits: 15, totalUsed: 8, totalUnused: 7 });
  });
  it('returns zeros for a year with no data (EC-14)', () => {
    expect(summarizeBalances([], []).totals).toEqual({
      totalCredits: 0,
      totalUsed: 0,
      totalUnused: 0,
    });
  });
});

describe('lowBalances (TC-DASH-04, Q-04)', () => {
  const eligible = new Set(['e1', 'e2']);
  const make = (employeeId: string, credits: number, used: number, typeId = 'vac') =>
    makeBalance({
      id: `${employeeId}_2026_${typeId}`,
      employeeId,
      leaveTypeId: typeId,
      totalCredits: credits,
      totalUsed: used,
    });

  it('flags ≤ 2 as low and 0 as depleted, lowest first', () => {
    const result = lowBalances(
      [make('e1', 10, 8), make('e2', 5, 5), make('e1', 10, 2, 'sick')],
      eligible,
    );
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
