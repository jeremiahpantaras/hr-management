import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormField } from '@/components/form/FormField';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { appErrorMessage } from '@/domain/errors';
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordInput,
  type ProfileInput,
} from '@/domain/schemas/auth';
import { authErrorMessage } from '@/features/auth/authErrors';
import { useAuth } from '@/features/auth/useAuth';
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { changePassword } from '@/services/auth.service';
import { AuthServiceError } from '@/services/auth.errors';
import { updateOwnName } from '@/services/users.service';

function ErrorBanner({ message }: { readonly message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function ProfileCard() {
  const { user, profile, refreshProfile } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: profile?.fullName ?? '' },
    mode: 'onTouched',
  });

  const { run, pending } = useSubmitGuard(async (values: ProfileInput) => {
    setServerError(null);
    try {
      await updateOwnName(user?.uid ?? '', values.fullName);
      await refreshProfile(); // the shell and "Recorded by" use the profile name
      reset({ fullName: values.fullName });
      toast.success('Your name has been updated.');
    } catch (error) {
      setServerError(appErrorMessage(error));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Your name appears as “Recorded by” on the entries you make.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit((values) => run(values))(event);
          }}
          className="flex max-w-md flex-col gap-4"
        >
          {serverError ? <ErrorBanner message={serverError} /> : null}
          <FormField label="Email" helper="Your sign-in email can't be changed here.">
            {(field) => <Input {...field} value={profile?.email ?? user?.email ?? ''} readOnly />}
          </FormField>
          <FormField label="Role">
            {(field) => <Input {...field} value="HR Administrator" readOnly />}
          </FormField>
          <FormField label="Full name" required error={errors.fullName?.message}>
            {(field) => (
              <Input {...field} {...register('fullName')} autoComplete="name" disabled={pending} />
            )}
          </FormField>
          <div>
            <Button type="submit" loading={pending} disabled={pending || !isDirty}>
              Save profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { user } = useAuth();
  if (user?.hasPassword === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            You signed in with Google, so there is no password to change here. Manage your Google
            account&apos;s security in your Google settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <PasswordForm />;
}

function PasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onTouched',
  });

  const { run, pending } = useSubmitGuard(async (values: ChangePasswordInput) => {
    setServerError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      reset();
      toast.success('Your password has been updated.');
    } catch (error) {
      if (error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS') {
        setError('currentPassword', {
          type: 'server',
          message: 'Your current password is incorrect.',
        });
        setFocus('currentPassword');
      } else {
        setServerError(authErrorMessage(error));
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Use at least 8 characters. You stay signed in on this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit((values) => run(values))(event);
          }}
          className="flex max-w-md flex-col gap-4"
        >
          {serverError ? <ErrorBanner message={serverError} /> : null}
          <FormField label="Current password" required error={errors.currentPassword?.message}>
            {(field) => (
              <Input
                {...field}
                {...register('currentPassword')}
                type="password"
                autoComplete="current-password"
                disabled={pending}
              />
            )}
          </FormField>
          <FormField label="New password" required error={errors.newPassword?.message}>
            {(field) => (
              <Input
                {...field}
                {...register('newPassword')}
                type="password"
                autoComplete="new-password"
                disabled={pending}
              />
            )}
          </FormField>
          <FormField label="Confirm new password" required error={errors.confirmPassword?.message}>
            {(field) => (
              <Input
                {...field}
                {...register('confirmPassword')}
                type="password"
                autoComplete="new-password"
                disabled={pending}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" loading={pending} disabled={pending}>
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Settings → Account (UI spec §6.14, FR-AUTH-10). */
export function AccountSettingsPage() {
  const { signOut } = useAuth();
  return (
    <PageContainer>
      <PageHeader title="Account" description="Your profile and password." />
      <SettingsLayout>
        <div className="flex flex-col gap-6">
          <ProfileCard />
          <PasswordCard />
          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
              <CardDescription>Sign out of this device.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="secondary"
                onClick={() => {
                  void signOut();
                }}
              >
                <LogOut aria-hidden="true" />
                Log out
              </Button>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
