import { Outlet, useMatches } from 'react-router';
import { toast } from 'sonner';

import { AppShell } from '@/components/layout/AppShell';
import type { ShellUser } from '@/components/layout/AppSidebar';
import { useAuth } from '@/features/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { isRouteHandle } from '@/types/navigation';

/** Reads the deepest route's `handle` for the header and document title, then frames the page. */
export function ShellLayout() {
  const matches = useMatches();
  const { profile, signOut } = useAuth();

  const handle = [...matches]
    .reverse()
    .map((match) => match.handle)
    .find(isRouteHandle);

  const title = handle?.title ?? '';
  const crumbs = handle?.crumbs ?? (title ? [{ label: title }] : []);
  useDocumentTitle(title);

  const displayName = profile?.fullName.trim() ?? '';
  const user: ShellUser = {
    name: displayName === '' ? 'HR Administrator' : displayName,
    caption: 'HR Administrator',
  };

  // The auth guard redirects to /login once the session ends; this only reports a failure.
  function handleLogout(): void {
    signOut().catch(() => {
      toast.error("Couldn't sign out. Check your connection and try again.");
    });
  }

  return (
    <AppShell title={title} crumbs={crumbs} user={user} onLogout={handleLogout}>
      <Outlet />
    </AppShell>
  );
}
