import { describe, expect, it } from 'vitest';

import { forgotPasswordSchema, loginSchema } from '@/domain/schemas/auth';

const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe('loginSchema (UI spec §12 copy)', () => {
  it('accepts a valid email and any non-empty password, trimming the email', () => {
    const parsed = loginSchema.safeParse({ email: '  maria@example.test ', password: 'x' });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.email).toBe('maria@example.test');
  });

  it.each(['', '   ', 'not-an-email', 'a@', '@b.test', 'two@@example.test'])(
    'rejects the email %j with the exact message',
    (email) => {
      expect(messages(loginSchema.safeParse({ email, password: 'x' }))).toContain(
        'Enter a valid email address.',
      );
    },
  );

  it('requires a password, and does not trim or restrict it', () => {
    expect(messages(loginSchema.safeParse({ email: 'a@example.test', password: '' }))).toEqual([
      'Enter your password.',
    ]);
    expect(loginSchema.safeParse({ email: 'a@example.test', password: '  spaces  ' }).success).toBe(
      true,
    );
  });
});

describe('forgotPasswordSchema', () => {
  it('shares the email rule', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'maria@example.test' }).success).toBe(true);
    expect(messages(forgotPasswordSchema.safeParse({ email: 'nope' }))).toEqual([
      'Enter a valid email address.',
    ]);
  });
});
