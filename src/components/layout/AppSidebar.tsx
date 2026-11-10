import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router';

import { BrandMark } from '@/components/layout/BrandMark';
import { NAV_ITEMS } from '@/components/layout/navigation';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export interface ShellUser {
  readonly name: string;
  /** Secondary line, e.g. the role. */
  readonly caption: string;
}

interface SidebarContentProps {
  readonly user: ShellUser;
  readonly onLogout: () => void;
  /** Called after a navigation link is activated (closes the mobile drawer). */
  readonly onNavigate?: () => void;
}

/** Brand, primary navigation, and the pinned user block. Shared by the sidebar and the drawer. */
export function SidebarContent({ user, onLogout, onNavigate }: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b px-5">
        <BrandMark />
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150 ease-standard',
                    'pointer-coarse:h-11',
                    isActive
                      ? 'bg-pink-50 text-pink-700'
                      : 'text-fg-muted hover:bg-hover hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-accent"
                      />
                    ) : null}
                    <item.icon
                      aria-hidden="true"
                      className={cn(
                        'size-5 shrink-0',
                        isActive ? 'text-pink-600' : 'text-fg-muted',
                      )}
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <UserAvatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{user.name}</p>
            <p className="truncate text-caption text-fg-muted">{user.caption}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start" onClick={onLogout}>
          <LogOut aria-hidden="true" />
          Log out
        </Button>
      </div>
    </div>
  );
}

/** Fixed 256px sidebar, desktop (≥1024px) only; below that the shell shows a drawer instead. */
export function AppSidebar(props: SidebarContentProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-(--sidebar-width) border-r bg-surface lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}
