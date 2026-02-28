import { boolean, z } from 'zod';

// Password validation regex
// - At least one lowercase letter
// - At least one uppercase letter
// - At least one special character
// - Between 8 and 20 characters
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,20}$/;
const passwordValidation = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(20, "Password must be at most 20 characters")
  .regex(
    passwordRegex,
    "Password must contain at least one lowercase letter, one uppercase letter, and one special character"
  );

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  captchaToken: z.string().min(1, 'Captcha verification is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const dealerLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  captchaToken: z.string().min(1, 'Captcha verification is required'),
  vissibleRecaptcha:z.boolean()
});

export type DealerLoginInput = z.infer<typeof dealerLoginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordValidation,
  confirmPassword: z.string().min(1, 'Confirm password is required'),
  captchaToken: z.string().min(1, 'Captcha verification is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
