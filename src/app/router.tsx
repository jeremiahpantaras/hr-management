import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';

import { AppLoading } from '@/app/AppLoading';
import { RouteErrorPage } from '@/app/ErrorBoundary';
import { PublicOnly } from '@/app/guards/PublicOnly';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { NotFoundPage } from '@/app/NotFoundPage';
import { ShellLayout } from '@/app/ShellLayout';
import type { RouteHandle } from '@/types/navigation';

/**
 * Canonical route table (Architecture §4.2). Page modules are lazy-loaded, so each page is its
 * own chunk. The tree is already shaped for Phase 2: public pre-login routes sit under
 * `PublicOnly`, everything else under `RequireAuth` → `ShellLayout` (sidebar + header).
 */
const handle = (title: string, crumbs?: RouteHandle['crumbs']): RouteHandle => ({ title, crumbs });

// Dev-only component gallery for visual verification; stripped from production builds.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/ui',
        lazy: () =>
          import('@/app/dev/ComponentGallery').then((m) => ({ Component: m.ComponentGallery })),
        handle: handle('Component gallery'),
      },
    ]
  : [];

const appRoutes: RouteObject[] = [
  {
    element: <PublicOnly />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/login',
        lazy: () => import('@/features/auth/LoginPage').then((m) => ({ Component: m.LoginPage })),
      },
      {
        path: '/forgot-password',
        lazy: () =>
          import('@/features/auth/ForgotPasswordPage').then((m) => ({
            Component: m.ForgotPasswordPage,
          })),
      },
    ],
  },
  {
    path: '/access-denied',
    errorElement: <RouteErrorPage />,
    lazy: () =>
      import('@/features/auth/AccessDeniedPage').then((m) => ({ Component: m.AccessDeniedPage })),
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <ShellLayout />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/dashboard/DashboardPage').then((m) => ({
                Component: m.DashboardPage,
              })),
            handle: handle('Dashboard'),
          },
          {
            path: 'employees',
            lazy: () =>
              import('@/features/employees/EmployeesPage').then((m) => ({
                Component: m.EmployeesPage,
              })),
            handle: handle('Employees'),
          },
          {
            path: 'employees/:employeeId',
            lazy: () =>
              import('@/features/employees/EmployeeDetailPage').then((m) => ({
                Component: m.EmployeeDetailPage,
              })),
            handle: handle('Employee details', [
              { label: 'Employees', to: '/employees' },
              { label: 'Employee details' },
            ]),
          },
          {
            path: 'leave-credits',
            lazy: () =>
              import('@/features/leave-credits/LeaveCreditsPage').then((m) => ({
                Component: m.LeaveCreditsPage,
              })),
            handle: handle('Leave Credits'),
          },
          {
            path: 'leave-usage',
            lazy: () =>
              import('@/features/leave-usage/LeaveUsagePage').then((m) => ({
                Component: m.LeaveUsagePage,
              })),
            handle: handle('Leave Usage'),
          },
          {
            path: 'leave-history',
            lazy: () =>
              import('@/features/leave-history/LeaveHistoryPage').then((m) => ({
                Component: m.LeaveHistoryPage,
              })),
            handle: handle('Leave History'),
          },
          {
            path: 'reports',
            lazy: () =>
              import('@/features/reports/ReportsPage').then((m) => ({ Component: m.ReportsPage })),
            handle: handle('Reports'),
          },
          { path: 'settings', element: <Navigate to="/settings/leave-types" replace /> },
          {
            path: 'settings/leave-types',
            lazy: () =>
              import('@/features/leave-types/LeaveTypesSettingsPage').then((m) => ({
                Component: m.LeaveTypesSettingsPage,
              })),
            handle: handle('Leave types', [
              { label: 'Settings', to: '/settings' },
              { label: 'Leave types' },
            ]),
          },
          {
            path: 'settings/account',
            lazy: () =>
              import('@/features/settings/AccountSettingsPage').then((m) => ({
                Component: m.AccountSettingsPage,
              })),
            handle: handle('Account', [
              { label: 'Settings', to: '/settings' },
              { label: 'Account' },
            ]),
          },
          ...devRoutes,
        ],
      },
    ],
  },
  { path: '*', Component: NotFoundPage },
];

// A single pathless root route carries the hydrate fallback for every lazily-loaded page.
export const routes: RouteObject[] = [{ HydrateFallback: AppLoading, children: appRoutes }];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
