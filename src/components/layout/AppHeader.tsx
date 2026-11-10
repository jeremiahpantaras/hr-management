import { Menu } from 'lucide-react';

import type { ShellUser } from '@/components/layout/AppSidebar';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { UserMenu } from '@/components/layout/UserMenu';
import { Button } from '@/components/ui/button';
import type { Crumb } from '@/types/navigation';

interface AppHeaderProps {
  readonly title: string;
  readonly crumbs: readonly Crumb[];
  readonly user: ShellUser;
  readonly onOpenNav: () => void;
  readonly onLogout: () => void;
}

/** 64px (56px on small screens) sticky bar: nav toggle · page title / breadcrumbs · user menu. */
export function AppHeader({ title, crumbs, user, onOpenNav, onLogout }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-surface px-4 sm:px-6 lg:h-16 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 lg:hidden"
        aria-label="Open navigation menu"
        onClick={onOpenNav}
      >
        <Menu aria-hidden="true" className="size-5" />
      </Button>

      {/* Small screens: the current page title. Large screens: the breadcrumb trail. */}
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg lg:hidden">{title}</p>
      <Breadcrumbs items={crumbs} className="hidden min-w-0 flex-1 lg:block" />

      <UserMenu user={user} onLogout={onLogout} />
    </header>
  );
}
