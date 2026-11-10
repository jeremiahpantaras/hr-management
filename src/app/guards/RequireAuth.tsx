import { Navigate, Outlet, useLocation } from 'react-router';

import { AppLoading } from '@/app/AppLoading';
import { useAuth } from '@/features/auth/useAuth';

/**
 * Layout route for everything behind sign-in. UX only — the Security Rules are the real
 * boundary (FR-AUTH-09) — but it never renders protected content before authorization is known:
 *   loading → spinner · signedOut → /login (remembering where the user was going) ·
 *   denied → /access-denied · signedIn → the page.
 */
export function RequireAuth() {
  const { status, sessionEnded } = useAuth();
  const location = useLocation();

  switch (status) {
    case 'loading':
      return <AppLoading />;
    case 'signedOut':
      // After a logout or an expired session, do NOT remember the page: the next person to sign
      // in on this browser should land on the dashboard, not on the previous user's page.
      return <Navigate to="/login" replace state={sessionEnded ? undefined : { from: location }} />;
    case 'denied':
      return <Navigate to="/access-denied" replace />;
    case 'signedIn':
      return <Outlet />;
  }
}
