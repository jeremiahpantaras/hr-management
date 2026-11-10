import { useState, type ReactNode } from 'react';

import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppSidebar, SidebarContent, type ShellUser } from '@/components/layout/AppSidebar';
import { SkipLink } from '@/components/layout/SkipLink';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { Crumb } from '@/types/navigation';

interface AppShellProps {
  readonly title: string;
  readonly crumbs: readonly Crumb[];
  readonly user: ShellUser;
  readonly onLogout: () => void;
  readonly children: ReactNode;
}

/**
 * Authenticated application frame: skip link, fixed sidebar (≥1024px) or left drawer (below),
 * sticky header, and the `<main>` landmark. Auth wiring is supplied by the caller (Phase 2).
 */
export function AppShell({ title, crumbs, user, onLogout, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-canvas">
      <SkipLink />
      <AppSidebar user={user} onLogout={onLogout} />

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="lg:hidden" hideClose>
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SheetDescription className="sr-only">
            Primary navigation for the HR Leave Monitor application.
          </SheetDescription>
          <SidebarContent
            user={user}
            onLogout={() => {
              setNavOpen(false);
              onLogout();
            }}
            onNavigate={() => {
              setNavOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-(--sidebar-width)">
        <OfflineBanner />
        <AppHeader
          title={title}
          crumbs={crumbs}
          user={user}
          onLogout={onLogout}
          onOpenNav={() => {
            setNavOpen(true);
          }}
        />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
