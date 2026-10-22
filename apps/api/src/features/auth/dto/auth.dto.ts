import { PASSWORD_MIN_LENGTH } from '@pvh/shared';
import { z } from 'zod';

const email = z.email('Email không hợp lệ').trim().toLowerCase();
const newPassword = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Mật khẩu mới cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự`,
  )
  .max(128);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Chưa nhập mật khẩu').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Chưa nhập mật khẩu hiện tại').max(128),
  newPassword,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(2000),
  newPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
