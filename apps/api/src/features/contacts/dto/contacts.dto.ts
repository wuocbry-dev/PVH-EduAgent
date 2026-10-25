import { CONTACT_STATUSES } from '@pvh/shared';
import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const createContactSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Chưa nhập họ tên').max(120),
    email: optionalText(150).pipe(z.email('Email không hợp lệ').nullable()),
    phone: optionalText(20).pipe(
      z
        .string()
        .regex(/^[0-9+\s().-]{6,20}$/, 'Số điện thoại không hợp lệ')
        .nullable(),
    ),
    subject: z.string().trim().min(1, 'Chưa nhập tiêu đề').max(200),
    message: z
      .string()
      .trim()
      .min(10, 'Nội dung cần ít nhất 10 ký tự')
      .max(5000),
    // Ô ẩn chống bot: người thật để trống.
    website: z.string().max(200).optional(),
  })
  .refine((v) => v.email || v.phone, {
    message: 'Cần nhập email hoặc số điện thoại để nhà trường phản hồi',
    path: ['email'],
  });
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const listContactsQuerySchema = z.object({
  status: z.enum(CONTACT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

export const updateContactStatusSchema = z.object({
  status: z.enum(CONTACT_STATUSES),
});
export type UpdateContactStatusInput = z.infer<
  typeof updateContactStatusSchema
>;
