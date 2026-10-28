import { BULK_USER_ACTION_MAX, BULK_USER_ACTIONS, PASSWORD_MIN_LENGTH, ROLES, USER_STATUSES } from '@pvh/shared';
import { z } from 'zod';

const email = z.email('Email không hợp lệ').trim().toLowerCase().max(150);
const fullName = z.string().trim().min(1, 'Chưa nhập họ tên').max(120);
const phone = z
  .string()
  .trim()
  .max(20)
  .transform((v) => v || null)
  .nullable();
const password = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự`,
  )
  .max(128);
const roles = z
  .array(z.enum(ROLES))
  .min(1, 'Cần ít nhất một vai trò')
  .transform((v) => [...new Set(v)]);

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(150).optional(),
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(ROLES).optional(),
  classId: z.string().regex(/^\d{1,18}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const createUserSchema = z.object({
  email,
  fullName,
  phone: phone.optional(),
  password,
  roles,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: fullName.optional(),
  phone: phone.optional(),
  roles: roles.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Chỉ khóa/mở khóa; PENDING do hệ thống đặt khi nhập hàng loạt và tự mất khi kích hoạt.
export const setUserStatusSchema = z.object({ status: z.enum(['ACTIVE', 'LOCKED']) });
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

export const resetUserPasswordSchema = z.object({ newPassword: password });
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

// Bước 26: khoá / buộc đăng xuất hàng loạt, cần nhập lại mật khẩu của người thao tác.
export const bulkUserActionSchema = z.object({
  action: z.enum(BULK_USER_ACTIONS),
  userIds: z
    .array(z.string().regex(/^[1-9][0-9]{0,18}$/, 'Mã người dùng không hợp lệ'))
    .min(1, 'Chưa chọn người dùng nào')
    .max(BULK_USER_ACTION_MAX, `Tối đa ${BULK_USER_ACTION_MAX} người mỗi lần`)
    .transform((v) => [...new Set(v)]),
  password: z.string().min(1, 'Nhập mật khẩu của bạn để xác nhận').max(128),
});
export type BulkUserActionBody = z.infer<typeof bulkUserActionSchema>;
