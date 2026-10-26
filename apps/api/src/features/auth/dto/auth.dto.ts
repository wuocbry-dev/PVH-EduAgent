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

const identifier = z.string().trim().min(1, 'Chưa nhập email hoặc mã đăng nhập').max(150);

// Ô đăng nhập nhận email hoặc mã học sinh/giáo viên. `email` được giữ để tương thích với client cũ.
export const loginSchema = z
  .object({
    identifier: identifier.optional(),
    email: identifier.optional(),
    password: z.string().min(1, 'Chưa nhập mật khẩu').max(128),
  })
  .transform((v, ctx) => {
    const id = v.identifier ?? v.email;
    if (!id) {
      ctx.addIssue({ code: 'custom', path: ['identifier'], message: 'Chưa nhập email hoặc mã đăng nhập' });
      return z.NEVER;
    }
    return { identifier: id, password: v.password };
  });
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Chưa nhập mật khẩu hiện tại').max(128),
  newPassword,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const activateSchema = z.object({
  identifier,
  activationCode: z.string().trim().min(1, 'Chưa nhập mã kích hoạt').max(40),
  newPassword,
});
export type ActivateInput = z.infer<typeof activateSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(2000),
  newPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
