import { describe, expect, it } from 'vitest';

import { HR_ADMIN_ROLE, evaluateProfile } from '@/domain/authorization';
import type { UserProfile } from '@/types/models';

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'u1',
  fullName: 'Maria Santos',
  email: 'maria@example.test',
  role: HR_ADMIN_ROLE,
  isActive: true,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

describe('evaluateProfile (BR-AUTH-01)', () => {
  it('authorizes only an ACTIVE hr_admin', () => {
    expect(evaluateProfile(profile())).toEqual({ authorized: true });
  });

  it('denies a missing profile', () => {
    expect(evaluateProfile(null)).toEqual({ authorized: false, reason: 'no-profile' });
  });

  it('denies an inactive admin', () => {
    expect(evaluateProfile(profile({ isActive: false }))).toEqual({
      authorized: false,
      reason: 'inactive',
    });
  });

  it.each(['employee', 'HR_ADMIN', 'hr-admin', 'admin', 'super_admin', ' hr_admin', ''])(
    'denies the role %j (exact match only)',
    (role) => {
      expect(evaluateProfile(profile({ role }))).toEqual({
        authorized: false,
        reason: 'wrong-role',
      });
    },
  );

  it('checks the role before the active flag, so an inactive non-admin is "wrong-role"', () => {
    expect(evaluateProfile(profile({ role: 'employee', isActive: false }))).toEqual({
      authorized: false,
      reason: 'wrong-role',
    });
  });
});
