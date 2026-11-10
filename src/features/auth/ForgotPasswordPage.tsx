import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { FormField } from '@/components/form/FormField';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/domain/schemas/auth';
import { authErrorMessage } from '@/features/auth/authErrors';
import { useAuth } from '@/features/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

const GENERIC_CONFIRMATION = 'If an account exists for that email, a reset link has been sent.';

/**
 * Password reset request (UI spec §6.2). Whatever the account state, success shows the same
 * generic confirmation (BR-AUTH-04). Only an invalid email or a network failure is shown as an error.
 */
export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const { sendReset } = useAuth();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  });

  const { run, pending } = useSubmitGuard(async (values: ForgotPasswordInput) => {
    setServerError(null);
    try {
      await sendReset(values.email);
      setSent(true);
    } catch (error) {
      setServerError(authErrorMessage(error));
    }
  });

  return (
    <AuthLayout>
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-fg">Reset your password</h1>

        {sent ? (
          <div className="flex flex-col gap-4">
            <div
              role="status"
              className="flex items-start gap-2 rounded-control border border-success/30 bg-success-soft p-3 text-sm text-success"
            >
              <MailCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{GENERIC_CONFIRMATION}</span>
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

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
              <Button type="submit" size="lg" className="w-full" loading={pending}>
                {pending ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>

            <Link
              to="/login"
              className="self-center rounded-sm text-sm font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
