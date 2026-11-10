import {
  CalendarMinus,
  CalendarPlus,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Exact-match only (the Dashboard route `/` would otherwise match every path). */
  readonly end?: boolean;
}

/** Sidebar navigation (UI spec §5.2). Sub-routes keep their parent active (NavLink prefix match). */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/leave-credits', label: 'Leave Credits', icon: CalendarPlus },
  { to: '/leave-usage', label: 'Leave Usage', icon: CalendarMinus },
  { to: '/leave-history', label: 'Leave History', icon: History },
  { to: '/reports', label: 'Reports', icon: FileSpreadsheet },
  { to: '/settings', label: 'Settings', icon: Settings },
];
