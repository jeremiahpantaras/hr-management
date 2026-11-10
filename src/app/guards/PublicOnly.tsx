import { Navigate, Outlet, useLocation } from 'react-router';

import { AppLoading } from '@/app/AppLoading';
import { postLoginTarget } from '@/app/guards/redirect';
import { useAuth } from '@/features/auth/useAuth';

/**
 * Layout route for /login and /forgot-password. Signed-in users are redirected to where they
 * were going (or the dashboard); a user who is signed in but not authorized is sent to the
 * access-denied screen, where they can sign out.
 */
export function PublicOnly() {
  const { status } = useAuth();
  const location = useLocation();

  switch (status) {
    case 'loading':
      return <AppLoading />;
    case 'signedIn':
      return <Navigate to={postLoginTarget(location.state)} replace />;
    case 'denied':
      return <Navigate to="/access-denied" replace />;
    case 'signedOut':
      return <Outlet />;
  }
}
