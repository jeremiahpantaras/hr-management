import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/AppShell';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { NAV_ITEMS } from '@/components/layout/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Crumb } from '@/types/navigation';

const user = { name: 'Maria Santos', caption: 'HR Administrator' };

function renderShell(
  path = '/',
  onLogout = vi.fn(),
  crumbs: readonly Crumb[] = [{ label: 'Dashboard' }],
) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <AppShell title="Dashboard" crumbs={crumbs} user={user} onLogout={onLogout}>
              <PageHeader title="Dashboard" />
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return onLogout;
}

function getSidebar(): HTMLElement {
  const aside = screen.getByRole('navigation', { name: 'Primary' }).closest('aside');
  if (!aside) throw new Error('Desktop sidebar (<aside>) not found');
  return aside;
}

describe('navigation config', () => {
  it('lists exactly the seven planned items, in order', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Dashboard',
      'Employees',
      'Leave Credits',
      'Leave Usage',
      'Leave History',
      'Reports',
      'Settings',
    ]);
  });
});

describe('AppShell (UI spec §5)', () => {
  it('has the landmarks: skip link first, primary nav, header, main with one h1', async () => {
    renderShell();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders all seven links and marks the current page', () => {
    renderShell('/leave-credits');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getAllByRole('link')).toHaveLength(7);
    expect(within(nav).getByRole('link', { name: 'Leave Credits' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('Dashboard is active only on "/" while sub-routes keep their parent active', () => {
    renderShell('/employees/abc123');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Employees' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('Settings stays active on its sub-pages', () => {
    renderShell('/settings/account');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the user block and Log out calls the handler', async () => {
    const onLogout = renderShell();
    const sidebar = within(getSidebar());
    expect(sidebar.getByText('Maria Santos')).toBeInTheDocument();
    await userEvent.click(sidebar.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('mobile drawer: opens from the hamburger, traps focus, closes on navigation', async () => {
    renderShell('/');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const drawer = await screen.findByRole('dialog', { name: 'Navigation menu' });
    const drawerNav = within(drawer).getByRole('navigation', { name: 'Primary' });
    expect(within(drawerNav).getAllByRole('link')).toHaveLength(7);

    await userEvent.click(within(drawerNav).getByRole('link', { name: 'Reports' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('mobile drawer closes with Escape', async () => {
    renderShell('/');
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    await screen.findByRole('dialog', { name: 'Navigation menu' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('the user menu offers Account settings and Log out', async () => {
    const onLogout = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Maria Santos' }));
    expect(await screen.findByRole('menuitem', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('Breadcrumbs', () => {
  it('links earlier crumbs and marks the last as the current page', () => {
    renderShell('/employees/1', vi.fn(), [
      { label: 'Employees', to: '/employees' },
      { label: 'Juan Dela Cruz' },
    ]);
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByRole('link', { name: 'Employees' })).toHaveAttribute(
      'href',
      '/employees',
    );
    expect(within(trail).getByText('Juan Dela Cruz')).toHaveAttribute('aria-current', 'page');
    expect(within(trail).getAllByRole('link')).toHaveLength(1);
  });

  it('renders nothing for an empty trail', () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PageHeader', () => {
  it('renders the title as the page h1 with optional description and actions', () => {
    render(
      <PageHeader
        title="Employees"
        description="Manage records."
        actions={<button type="button">Add employee</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(screen.getByText('Manage records.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add employee' })).toBeInTheDocument();
  });
});
