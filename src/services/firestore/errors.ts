import { AppError } from '@/domain/errors';

/**
 * Firestore error helpers (Architecture §8.3): translate SDK errors into the application's
 * `AppError` taxonomy so the UI never sees raw Firebase codes or messages.
 */
function readCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error;
    return typeof code === 'string' ? code.replace(/^firestore\//, '') : null;
  }
  return null;
}

/**
 * True for a refusal by the Security Rules, whether it is still the SDK's own error or has already
 * been translated by a service into an `AppError` (queries and mutations always reach React Query
 * as `AppError`s, so the global FR-AUTH-12 handler must recognise both).
 */
export function isPermissionDeniedError(error: unknown): boolean {
  if (error instanceof AppError) return error.code === 'PERMISSION_DENIED';
  return readCode(error) === 'permission-denied';
}

export function mapFirebaseError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const sourceCode = readCode(error);

  switch (readCode(error)) {
    case 'permission-denied':
    case 'unauthenticated':
      return new AppError('PERMISSION_DENIED', { cause: error, sourceCode });
    case 'unavailable':
    case 'deadline-exceeded':
      return new AppError('OFFLINE', { cause: error, sourceCode });
    case 'aborted':
      return new AppError('CONTENTION', { cause: error, sourceCode });
    case 'not-found':
      return new AppError('NOT_FOUND', { cause: error, sourceCode });
    default:
      return new AppError('UNKNOWN', { cause: error, sourceCode });
  }
}
