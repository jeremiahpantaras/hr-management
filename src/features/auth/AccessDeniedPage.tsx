import { ShieldAlert } from 'lucide-react';
import { Navigate } from 'react-router';

import { AppLoading } from '@/app/AppLoading';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import type { DeniedReason } from '@/domain/authorization';
import { useAuth } from '@/features/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

/** UI spec §6.3 copy. `profile-error` (could not read the profile) is explained honestly. */
const REASON_MESSAGES: Record<DeniedReason, string> = {
  'no-profile': "Your account hasn't been set up for this application.",
  inactive: 'Your account has been deactivated.',
  'wrong-role': "You don't have permission to use this application.",
  'profile-error': "We couldn't verify your account. Check your connection and try again.",
};

/**
 * Shown to someone who is signed in but not authorized. Anyone else is sent where they belong:
 * signed out → /login, authorized → the dashboard.
 */
export function AccessDeniedPage() {
  useDocumentTitle('Access not available');
  const { status, deniedReason, signOut, refreshProfile } = useAuth();
  const { run: runSignOut, pending: signingOut } = useSubmitGuard(async () => {
    await signOut();
  });
  const { run: runRetry, pending: retrying } = useSubmitGuard(refreshProfile);

  if (status === 'loading') return <AppLoading />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  if (status === 'signedIn') return <Navigate to="/" replace />;

  const reason = deniedReason ?? 'wrong-role';

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <ShieldAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-page-title text-fg">Access not available</h1>
        <p className="text-sm text-fg-muted">{REASON_MESSAGES[reason]}</p>
        <p className="text-sm text-fg-muted">Contact your administrator.</p>
        <div className="flex w-full flex-col gap-2">
          {reason === 'profile-error' ? (
            <Button variant="secondary" loading={retrying} onClick={() => void runRetry()}>
              Try again
            </Button>
          ) : null}
          <Button loading={signingOut} onClick={() => void runSignOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
