import { describe, expect, it } from 'vitest';

import { allocationSchema } from '@/domain/schemas/allocation';
import { changePasswordSchema, profileSchema } from '@/domain/schemas/auth';
import { reversalSchema } from '@/domain/schemas/reversal';
import { usageSchema } from '@/domain/schemas/usage';

/** First message per field — what react-hook-form's resolver shows. */
function messages(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

const allocation = { employeeId: 'e', year: '2026', days: '2', remarks: '' };

describe('allocationSchema (UI §12)', () => {
  it('parses strings to numbers and blank remarks to null', () => {
    const parsed = allocationSchema.parse(allocation);
    expect(parsed).toEqual({
      employeeId: 'e',
      year: 2026,
      days: 2,
      remarks: null,
    });
  });
  it('requires employee and year', () => {
    const result = allocationSchema.safeParse({
      ...allocation,
      employeeId: '',
      year: '',
    });
    expect(messages(result)).toMatchObject({
      employeeId: 'Select an employee.',
      year: 'Select a leave year.',
    });
  });
  it.each([
    ['', 'Enter the number of credits.'],
    ['abc', 'Enter the number of credits.'],
    ['0', 'Credits must be greater than 0.'],
    ['-1', 'Credits must be greater than 0.'],
    ['0.3', 'Use whole or half days (0.5).'],
    ['1.25', 'Use whole or half days (0.5).'],
    ['366', 'The maximum is 365 per entry.'],
  ])('credits %j → %s (TC-CR-04)', (days, message) => {
    expect(messages(allocationSchema.safeParse({ ...allocation, days })).days).toBe(message);
  });
  it.each(['0.5', '1', '2.5', '365'])('accepts credits %s (TC-CR-05)', (days) => {
    expect(allocationSchema.safeParse({ ...allocation, days }).success).toBe(true);
  });
  it('limits remarks to 500 characters (TC-CR-12)', () => {
    expect(allocationSchema.safeParse({ ...allocation, remarks: 'x'.repeat(500) }).success).toBe(
      true,
    );
    expect(
      messages(allocationSchema.safeParse({ ...allocation, remarks: 'x'.repeat(501) })).remarks,
    ).toBe('Remarks are too long (500 characters max).');
  });
});

const usage = {
  employeeId: 'e',
  year: '2026',
  dateFrom: '2026-02-10',
  dateTo: '2026-02-11',
  days: '2',
  remarks: '',
};

describe('usageSchema (UI §12)', () => {
  it('accepts a valid usage', () => {
    expect(usageSchema.parse(usage)).toMatchObject({ year: 2026, days: 2, remarks: null });
  });
  it('requires both dates', () => {
    const result = messages(usageSchema.safeParse({ ...usage, dateFrom: '', dateTo: '' }));
    expect(result).toMatchObject({
      dateFrom: 'Enter the start date.',
      dateTo: 'Enter the end date.',
    });
  });
  it('rejects an end date before the start (TC-LU-05)', () => {
    expect(
      messages(usageSchema.safeParse({ ...usage, dateFrom: '2026-02-11', dateTo: '2026-02-10' }))
        .dateTo,
    ).toBe("The end date can't be before the start date.");
  });
  it('rejects dates outside the leave year and year-crossing ranges (TC-LU-06/07)', () => {
    expect(messages(usageSchema.safeParse({ ...usage, dateFrom: '2025-12-31' })).dateFrom).toBe(
      'Leave must fall within 2026.',
    );
    expect(
      messages(
        usageSchema.safeParse({
          ...usage,
          dateFrom: '2026-12-30',
          dateTo: '2027-01-02',
          days: '2',
        }),
      ).dateTo,
    ).toBe('Leave must fall within 2026.');
  });
  it('rejects days beyond the calendar days in the range (TC-LU-08)', () => {
    expect(messages(usageSchema.safeParse({ ...usage, days: '3' })).days).toBe(
      "Days can't exceed the 2 calendar days in this range.",
    );
    expect(usageSchema.safeParse({ ...usage, dateTo: '2026-02-10', days: '0.5' }).success).toBe(
      true,
    );
  });
  it('rejects non-real dates (TC-LU-10)', () => {
    expect(
      usageSchema.safeParse({ ...usage, dateFrom: '2026-02-29', dateTo: '2026-02-29', days: '1' })
        .success,
    ).toBe(false);
    expect(
      usageSchema.safeParse({
        ...usage,
        year: '2028',
        dateFrom: '2028-02-29',
        dateTo: '2028-02-29',
        days: '1',
      }).success,
    ).toBe(true);
  });
  it.each(['0', '-1', '0.3', '366'])('rejects days %s (TC-LU-09)', (days) => {
    expect(usageSchema.safeParse({ ...usage, days }).success).toBe(false);
  });
});

describe('reversalSchema (TC-REV-05)', () => {
  it('needs a reason of at least 3 characters', () => {
    expect(messages(reversalSchema.safeParse({ reason: 'ab', thenReEnter: false })).reason).toBe(
      'Enter a reason (at least 3 characters).',
    );
    expect(reversalSchema.safeParse({ reason: '  ', thenReEnter: false }).success).toBe(false);
    expect(reversalSchema.parse({ reason: ' abc ', thenReEnter: true })).toEqual({
      reason: 'abc',
      thenReEnter: true,
    });
  });
});

describe('account schemas (TC-AUTH-10)', () => {
  it('requires a name', () => {
    expect(messages(profileSchema.safeParse({ fullName: ' ' })).fullName).toBe('Enter your name.');
  });
  it('enforces length, difference and confirmation', () => {
    const ok = {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
    };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(
      messages(
        changePasswordSchema.safeParse({ ...ok, newPassword: 'short', confirmPassword: 'short' }),
      ).newPassword,
    ).toBe('Password must be at least 8 characters.');
    expect(
      messages(
        changePasswordSchema.safeParse({
          ...ok,
          newPassword: 'old-password',
          confirmPassword: 'old-password',
        }),
      ).newPassword,
    ).toBe('Choose a different password.');
    expect(
      messages(changePasswordSchema.safeParse({ ...ok, confirmPassword: 'different1' }))
        .confirmPassword,
    ).toBe("Passwords don't match.");
    expect(
      messages(changePasswordSchema.safeParse({ ...ok, currentPassword: '' })).currentPassword,
    ).toBe('Enter your current password.');
  });
});
