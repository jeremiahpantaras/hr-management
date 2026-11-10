import { ChevronDown, LogOut, UserCog } from 'lucide-react';
import { Link } from 'react-router';

import { UserAvatar } from '@/components/layout/UserAvatar';
import type { ShellUser } from '@/components/layout/AppSidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserMenuProps {
  readonly user: ShellUser;
  readonly onLogout: () => void;
}

export function UserMenu({ user, onLogout }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="flex h-10 items-center gap-2 rounded-control px-1.5 text-sm font-medium text-fg hover:bg-hover sm:pr-2 pointer-coarse:h-11"
        >
          <UserAvatar name={user.name} />
          <span className="hidden max-w-40 truncate sm:inline">{user.name}</span>
          <ChevronDown aria-hidden="true" className="hidden size-4 text-fg-muted sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{user.caption}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/settings/account">
            <UserCog aria-hidden="true" />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>
          <LogOut aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
