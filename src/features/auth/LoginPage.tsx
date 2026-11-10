import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { FormField } from '@/components/form/FormField';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginSchema, type LoginInput } from '@/domain/schemas/auth';
import { authErrorMessage } from '@/features/auth/authErrors';
import { useAuth } from '@/features/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

/** The Google "G" (brand mark: its colours are Google's, not ours). */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path
        style={{ fill: 'var(--color-google-red)' }}
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        style={{ fill: 'var(--color-google-blue)' }}
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"
      />
      <path
        style={{ fill: 'var(--color-google-yellow)' }}
        d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"
      />
      <path
        style={{ fill: 'var(--color-google-green)' }}
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

/**
 * Sign in (UI spec §6.1). There is no sign-up link or text anywhere (FR-AUTH-06). Google is an extra way to prove identity; access still depends on the provisioned profile. On success the
 * auth provider moves to `signedIn` and `PublicOnly` redirects to the page the user was heading
 * for, so this component never navigates itself.
 */
export function LoginPage() {
  useDocumentTitle('Sign in');
  const { signIn, signInWithGoogle } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const { run, pending } = useSubmitGuard(async (values: LoginInput) => {
    setServerError(null);
    try {
      await signIn(values.email, values.password);
    } catch (error) {
      setServerError(authErrorMessage(error));
    }
  });

  const google = useSubmitGuard(async () => {
    setServerError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      // Closing the Google window is a choice, not an error.
      const message = authErrorMessage(error);
      if (message !== '') setServerError(message);
    }
  });
  const busy = pending || google.pending;

  return (
    <AuthLayout>
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-fg">Sign in</h1>

        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit((values) => run(values))(event);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="Email" error={errors.email?.message}>
            {(control) => (
              <Input
                {...control}
                {...register('email')}
                type="email"
                autoComplete="email"
                disabled={pending}
              />
            )}
          </FormField>

          <FormField label="Password" error={errors.password?.message}>
            {(control) => (
              <div className="relative">
                <Input
                  {...control}
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={pending}
                  className="pr-11"
                />
                <button
                  type="button"
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  onClick={() => {
                    setShowPassword((previous) => !previous);
                  }}
                  className="absolute top-1/2 right-1 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
            )}
          </FormField>

          <div className="-mt-1 text-right">
            <Link
              to="/forgot-password"
              className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="lg" className="w-full" loading={pending} disabled={busy}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="flex items-center gap-3 text-caption text-fg-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          loading={google.pending}
          disabled={busy}
          onClick={() => void google.run()}
        >
          <GoogleMark />
          Continue with Google
        </Button>

        <p className="text-center text-caption text-fg-muted">
          Access is limited to authorized HR personnel.
        </p>
      </div>
    </AuthLayout>
  );
}
