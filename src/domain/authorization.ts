import type { UserProfile } from '@/types/models';

import { HR_ADMIN_ROLE } from '@/domain/constants';

/**
 * Pure authorization decision (FR-AUTH-08, BR-AUTH-01): access requires a profile document with
 * `role === 'hr_admin'` and `isActive === true`. This is the UX-side mirror of the Security
 * Rules, which re-check the same predicate on every request and are the real boundary.
 */
export { HR_ADMIN_ROLE };

export type DeniedReason = 'no-profile' | 'inactive' | 'wrong-role' | 'profile-error';

export type AuthorizationResult =
  { readonly authorized: true } | { readonly authorized: false; readonly reason: DeniedReason };

export function evaluateProfile(profile: UserProfile | null): AuthorizationResult {
  if (profile === null) return { authorized: false, reason: 'no-profile' };
  if (profile.role !== HR_ADMIN_ROLE) return { authorized: false, reason: 'wrong-role' };
  if (!profile.isActive) return { authorized: false, reason: 'inactive' };
  return { authorized: true };
}
