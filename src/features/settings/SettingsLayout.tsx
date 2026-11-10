import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import { cn } from '@/lib/cn';

const TABS = [
  { to: '/settings/leave-types', label: 'Leave types' },
  { to: '/settings/account', label: 'Account' },
] as const;

/** Section tabs shared by the Settings pages (UI spec §6.13). Real links, so Back/URLs work. */
export function SettingsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <nav aria-label="Settings sections" className="-mt-2 mb-6 border-b">
        <ul className="flex gap-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    '-mb-px inline-flex h-11 items-center rounded-t-control border-b-2 px-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-fg-muted hover:text-fg',
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </>
  );
}
