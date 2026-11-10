import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/domain/errors';
import { AuthContext } from '@/features/auth/authContext';
import { SIGNED_IN_VALUE, makeAuthValue } from '@/features/auth/authTestHelpers';
import { LeaveTypesSettingsPage } from '@/features/leave-types/LeaveTypesSettingsPage';
import { AccountSettingsPage } from '@/features/settings/AccountSettingsPage';
import * as authService from '@/services/auth.service';
import { AuthServiceError } from '@/services/auth.errors';
import * as service from '@/services/leaveTypes.service';
import * as users from '@/services/users.service';
import type { LeaveType } from '@/types/models';

vi.mock('@/services/leaveTypes.service');
vi.mock('@/services/auth.service');
vi.mock('@/services/users.service');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function type(id: string, name: string, overrides: Partial<LeaveType> = {}): LeaveType {
  return {
    id,
    name,
    description: null,
    isActive: true,
    createdAt: null,
    createdBy: 'hr1',
    updatedAt: null,
    updatedBy: 'hr1',
    ...overrides,
  };
}
const vacation = type('vac', 'Vacation Leave', { description: 'Annual leave' });
const sick = type('sick', 'Sick Leave', { isActive: false });

function renderLeaveTypes(refreshProfile = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue({ ...SIGNED_IN_VALUE, refreshProfile })}>
        <MemoryRouter initialEntries={['/settings/leave-types']}>
          <Routes>
            <Route path="/settings/leave-types" element={<LeaveTypesSettingsPage />} />
            <Route path="/settings/account" element={<AccountSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(service.listLeaveTypes).mockResolvedValue([sick, vacation]);
  vi.mocked(service.createLeaveType).mockResolvedValue('new');
  vi.mocked(service.updateLeaveType).mockResolvedValue(undefined);
  vi.mocked(service.setLeaveTypeActive).mockResolvedValue(undefined);
  vi.mocked(service.addStarterLeaveTypes).mockResolvedValue(3);
});

describe('Leave types list (TC-LT-*)', () => {
  it('shows every type — active and inactive — with status badges', async () => {
    renderLeaveTypes();
    await screen.findByText('Vacation Leave');
    const table = screen.getByRole('table', { name: 'Leave types' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Sick Leave')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Inactive')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Active')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Annual leave')).toBeInTheDocument();
  });

  it('has one h1, section tabs, and the statutory note', async () => {
    renderLeaveTypes();
    await screen.findByRole('table', { name: 'Leave types' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    expect(screen.getByRole('link', { name: 'Leave types' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText(/does not apply any statutory entitlements/)).toBeInTheDocument();
  });

  it('TC-LT-07: offers no delete control anywhere', async () => {
    renderLeaveTypes();
    await screen.findByRole('table', { name: 'Leave types' });
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument();
  });

  it('shows an error with Retry when loading fails', async () => {
    vi.mocked(service.listLeaveTypes).mockRejectedValueOnce(new AppError('UNKNOWN'));
    renderLeaveTypes();
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Vacation Leave')).toBeInTheDocument();
  });

  it('TC-LT-06: the empty list offers Add leave type and Add starter types', async () => {
    vi.mocked(service.listLeaveTypes).mockResolvedValue([]);
    renderLeaveTypes();
    expect(await screen.findByText('No leave types yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add starter types' }));
    await waitFor(() => {
      expect(service.addStarterLeaveTypes).toHaveBeenCalledWith('hr1');
    });
    expect(toast.success).toHaveBeenCalledWith('Added 3 leave types.');
  });
});

describe('Add / edit (TC-LT-01/02/03)', () => {
  it('validates the name, then creates the type (TC-LT-01)', async () => {
    renderLeaveTypes();
    await screen.findByText('Vacation Leave');
    await userEvent.click(screen.getByRole('button', { name: 'Add leave type' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add leave type' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save leave type' }));
    expect(await within(dialog).findByText('Enter a leave type name.')).toBeInTheDocument();
    expect(service.createLeaveType).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/^Name/), '  Emergency Leave ');
    await userEvent.type(within(dialog).getByLabelText('Description'), 'Urgent');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save leave type' }));
    await waitFor(() => {
      expect(service.createLeaveType).toHaveBeenCalledWith(
        { name: 'Emergency Leave', description: 'Urgent' },
        'hr1',
      );
    });
    expect(toast.success).toHaveBeenCalledWith('Added Emergency Leave.');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add leave type' })).not.toBeInTheDocument();
    });
  });

  it('TC-LT-02: a duplicate name (any case) is rejected without calling the service', async () => {
    renderLeaveTypes();
    await screen.findByText('Vacation Leave');
    await userEvent.click(screen.getByRole('button', { name: 'Add leave type' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add leave type' });
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'vacation leave');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save leave type' }));
    expect(
      await within(dialog).findByText('A leave type with this name already exists.'),
    ).toBeInTheDocument();
    expect(service.createLeaveType).not.toHaveBeenCalled();
  });

  it('shows a duplicate reported by the server under the Name field', async () => {
    vi.mocked(service.createLeaveType).mockRejectedValue(new AppError('DUPLICATE_LEAVE_TYPE_NAME'));
    renderLeaveTypes();
    await screen.findByText('Vacation Leave');
    await userEvent.click(screen.getByRole('button', { name: 'Add leave type' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add leave type' });
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Brand New');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save leave type' }));
    expect(
      await within(dialog).findByText('A leave type with this name already exists.'),
    ).toBeInTheDocument();
  });

  it('TC-LT-03: editing prefills and saves the rename; keeping its own name is allowed', async () => {
    renderLeaveTypes();
    await screen.findByText('Vacation Leave');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Vacation Leave' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit leave type' });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Vacation Leave');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Annual leave');

    await userEvent.clear(within(dialog).getByLabelText(/^Name/));
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Annual Leave');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save leave type' }));
    await waitFor(() => {
      expect(service.updateLeaveType).toHaveBeenCalledWith(
        'vac',
        { name: 'Annual Leave', description: 'Annual leave' },
        'hr1',
      );
    });
  });

  it('asks before discarding typed changes', async () => {
    renderLeaveTypes();
    await screen.findByText('Vacation Leave');
    await userEvent.click(screen.getByRole('button', { name: 'Add leave type' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add leave type' });
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Typed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add leave type' })).not.toBeInTheDocument();
    });
  });
});

describe('Activate / deactivate (TC-LT-04/05)', () => {
  it('confirms, explains the consequence, then deactivates', async () => {
    renderLeaveTypes();
    await screen.findByText('Vacation Leave');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Vacation Leave' }));
    const confirm = await screen.findByRole('dialog', { name: 'Deactivate Vacation Leave?' });
    expect(within(confirm).getByText('Deactivate Vacation Leave?')).toBeInTheDocument();
    expect(
      within(confirm).getByText(/Existing balances, history, and reports are not affected/),
    ).toBeInTheDocument();
    expect(service.setLeaveTypeActive).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => {
      expect(service.setLeaveTypeActive).toHaveBeenCalledWith('vac', false, 'hr1');
    });
  });

  it('reactivates without a confirmation', async () => {
    renderLeaveTypes();
    await screen.findByText('Sick Leave');
    await userEvent.click(screen.getByRole('button', { name: 'Activate Sick Leave' }));
    await waitFor(() => {
      expect(service.setLeaveTypeActive).toHaveBeenCalledWith('sick', true, 'hr1');
    });
    expect(toast.success).toHaveBeenCalledWith('Activated Sick Leave.');
  });
});

describe('Account settings (TC-AUTH-10)', () => {
  async function openAccount(refreshProfile = vi.fn().mockResolvedValue(undefined)) {
    renderLeaveTypes(refreshProfile);
    await screen.findByText('Vacation Leave');
    await userEvent.click(screen.getByRole('link', { name: 'Account' }));
    await screen.findByRole('heading', { level: 1, name: 'Account' });
    return refreshProfile;
  }

  it('shows email and role read-only and the current name', async () => {
    await openAccount();
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Email')).toHaveValue('maria@example.test');
    expect(screen.getByLabelText('Role')).toHaveValue('HR Administrator');
    expect(screen.getByLabelText(/^Full name/)).toHaveValue('Maria Santos');
  });

  it('saves only the name, refreshes the profile and confirms', async () => {
    vi.mocked(users.updateOwnName).mockResolvedValue(undefined);
    const refresh = await openAccount();
    const save = screen.getByRole('button', { name: 'Save profile' });
    expect(save).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/^Full name/));
    await userEvent.type(screen.getByLabelText(/^Full name/), 'Maria S. Santos');
    await userEvent.click(save);
    await waitFor(() => {
      expect(users.updateOwnName).toHaveBeenCalledWith('hr1', 'Maria S. Santos');
    });
    expect(refresh).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Your name has been updated.');
  });

  it('requires a name', async () => {
    await openAccount();
    await userEvent.clear(screen.getByLabelText(/^Full name/));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(users.updateOwnName).not.toHaveBeenCalled();
  });

  it('validates the password form with the exact messages', async () => {
    await openAccount();
    await userEvent.type(screen.getByLabelText(/^Current password/), 'old-password');
    await userEvent.type(screen.getByLabelText(/^New password/), 'short');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'other');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it('rejects a new password equal to the current one', async () => {
    await openAccount();
    await userEvent.type(screen.getByLabelText(/^Current password/), 'same-password');
    await userEvent.type(screen.getByLabelText(/^New password/), 'same-password');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'same-password');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Choose a different password.')).toBeInTheDocument();
  });

  it('shows a wrong current password under that field', async () => {
    vi.mocked(authService.changePassword).mockRejectedValue(
      new AuthServiceError('INVALID_CREDENTIALS'),
    );
    await openAccount();
    await userEvent.type(screen.getByLabelText(/^Current password/), 'wrong-password');
    await userEvent.type(screen.getByLabelText(/^New password/), 'new-password-1');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('changes the password, clears the form and confirms', async () => {
    vi.mocked(authService.changePassword).mockResolvedValue(undefined);
    await openAccount();
    await userEvent.type(screen.getByLabelText(/^Current password/), 'old-password');
    await userEvent.type(screen.getByLabelText(/^New password/), 'new-password-1');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(authService.changePassword).toHaveBeenCalledWith('old-password', 'new-password-1');
    });
    expect(toast.success).toHaveBeenCalledWith('Your password has been updated.');
    await waitFor(() => {
      expect(screen.getByLabelText(/^Current password/)).toHaveValue('');
    });
  });

  it('has a Log out button', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={makeAuthValue({ ...SIGNED_IN_VALUE, signOut })}>
          <MemoryRouter>
            <AccountSettingsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(signOut).toHaveBeenCalled();
  });
});
