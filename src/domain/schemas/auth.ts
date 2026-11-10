import { z } from 'zod';

/** Messages are the exact copy from planning/UI_UX_DESIGN_SPECIFICATION.md §12. */
const email = z
  .string()
  .trim()
  .min(1, 'Enter a valid email address.')
  .pipe(z.email('Enter a valid email address.'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Account → Profile (UI §6.14, FR-AUTH-10). */
export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(100, 'Name is too long (100 characters max).'),
});
export type ProfileInput = z.infer<typeof profileSchema>;

/** Account → Password. The new password must be ≥ 8 characters, differ from the current one, and match. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string().min(1, "Passwords don't match."),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword.length >= 8 && value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Choose a different password.',
      });
    }
    if (value.confirmPassword !== value.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: "Passwords don't match.",
      });
    }
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
