import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import { AppError, appErrorMessage } from '@/domain/errors';
import { toEmployee } from '@/services/firestore/converters';
import { isPermissionDeniedError, mapFirebaseError } from '@/services/firestore/errors';

const firebaseError = (code: string) => Object.assign(new Error(`Firebase: ${code}`), { code });

describe('mapFirebaseError', () => {
  it.each([
    ['permission-denied', 'PERMISSION_DENIED'],
    ['firestore/permission-denied', 'PERMISSION_DENIED'],
    ['unauthenticated', 'PERMISSION_DENIED'],
    ['unavailable', 'OFFLINE'],
    ['deadline-exceeded', 'OFFLINE'],
    ['aborted', 'CONTENTION'],
    ['not-found', 'NOT_FOUND'],
    ['internal', 'UNKNOWN'],
    ['something-new', 'UNKNOWN'],
  ])('%s → %s', (code, expected) => {
    expect(mapFirebaseError(firebaseError(code)).code).toBe(expected);
  });

  it('keeps an AppError as is, wraps unknown values, and preserves the cause', () => {
    const own = new AppError('DUPLICATE_EMPLOYEE_NUMBER');
    expect(mapFirebaseError(own)).toBe(own);
    expect(mapFirebaseError('boom').code).toBe('UNKNOWN');
    expect(mapFirebaseError(undefined).code).toBe('UNKNOWN');
    const cause = firebaseError('unavailable');
    expect(mapFirebaseError(cause).cause).toBe(cause);
  });

  it('isPermissionDeniedError matches both spellings and nothing else', () => {
    expect(isPermissionDeniedError(firebaseError('permission-denied'))).toBe(true);
    expect(isPermissionDeniedError(firebaseError('firestore/permission-denied'))).toBe(true);
    expect(isPermissionDeniedError(firebaseError('unavailable'))).toBe(false);
    expect(isPermissionDeniedError(null)).toBe(false);
  });

  it('isPermissionDeniedError also recognises the AppError the services throw (FR-AUTH-12)', () => {
    expect(isPermissionDeniedError(new AppError('PERMISSION_DENIED'))).toBe(true);
    expect(isPermissionDeniedError(mapFirebaseError(firebaseError('permission-denied')))).toBe(
      true,
    );
    for (const code of ['OFFLINE', 'CONTENTION', 'NOT_FOUND', 'UNKNOWN', 'VALIDATION'] as const) {
      expect(isPermissionDeniedError(new AppError(code))).toBe(false);
    }
  });
});

describe('appErrorMessage (UI spec §12 copy; never raw text)', () => {
  it.each([
    ['DUPLICATE_EMPLOYEE_NUMBER', 'This employee ID is already in use.'],
    ['PERMISSION_DENIED', 'You no longer have permission to do that. Please sign in again.'],
    ['CONTENTION', 'Another change was saving at the same time. Please try again.'],
    ['OFFLINE', "You're offline. Reconnect and try again."],
    ['UNKNOWN', 'Something went wrong. Try again.'],
  ] as const)('%s', (code, message) => {
    expect(appErrorMessage(new AppError(code))).toBe(message);
  });

  it('falls back to the generic message for anything that is not an AppError', () => {
    expect(appErrorMessage(new Error('Firebase: secret detail'))).toBe(
      'Something went wrong. Try again.',
    );
    expect(appErrorMessage(null)).toBe('Something went wrong. Try again.');
  });
});

describe('toEmployee (converter)', () => {
  const when = Timestamp.fromDate(new Date('2026-01-05T01:30:00Z'));
  const stored = {
    employeeNumber: 'EMP-0042',
    employeeNumberKey: 'EMP-0042',
    fullName: 'Juan Dela Cruz',
    position: 'Accounting Staff',
    department: null,
    employmentStatus: 'Regular',
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    createdAt: when,
    createdBy: 'hr1',
    updatedAt: when,
    updatedBy: 'hr1',
  };

  it('converts Timestamps to Dates and adds the document id', () => {
    const employee = toEmployee('e1', stored);
    expect(employee).toMatchObject({
      id: 'e1',
      fullName: 'Juan Dela Cruz',
      department: null,
      isArchived: false,
    });
    expect(employee?.createdAt).toEqual(new Date('2026-01-05T01:30:00Z'));
    expect(employee?.archivedAt).toBeNull();
  });

  it.each([
    ['missing fullName', { fullName: undefined }],
    ['non-string position', { position: 7 }],
    ['unknown status', { employmentStatus: 'Intern' }],
    ['non-boolean isArchived', { isArchived: 'no' }],
    ['missing key', { employeeNumberKey: undefined }],
  ])('returns null for a corrupt record (%s) rather than guessing', (_label, change) => {
    expect(toEmployee('bad', { ...stored, ...change })).toBeNull();
  });

  it('tolerates missing optional / metadata fields without inventing data', () => {
    const employee = toEmployee('e1', {
      ...stored,
      department: undefined,
      createdAt: undefined,
      createdBy: undefined,
    });
    expect(employee).toMatchObject({ department: null, createdAt: null, createdBy: '' });
  });
});
