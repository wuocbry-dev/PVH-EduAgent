import {
  LIBRARY_AUDIENCES,
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_KINDS,
  LIBRARY_LICENSE_MIN,
  LIBRARY_SOURCES,
  LIBRARY_STATUSES,
  LIBRARY_TITLE_MAX,
} from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const itemFields = {
  title: z.string().trim().min(1, 'Chưa nhập tên tài liệu').max(LIBRARY_TITLE_MAX),
  author: optionalText(200),
  publisher: optionalText(200),
  publishYear: z.number().int().min(1800).max(2200).nullish(),
  description: optionalText(LIBRARY_DESCRIPTION_MAX),
  kind: z.enum(LIBRARY_KINDS),
  categoryId: id,
  subjectId: id.nullish(),
  gradeLevel: z.number().int().min(10).max(12).nullish(),
  // Nguồn và giấy phép bắt buộc: thư viện chỉ nhận tài liệu được phép chia sẻ.
  source: z.enum(LIBRARY_SOURCES, { error: 'Chưa chọn nguồn tài liệu' }),
  license: z
    .string({ error: 'Chưa ghi giấy phép / xuất xứ' })
    .trim()
    .min(LIBRARY_LICENSE_MIN, 'Ghi rõ giấy phép hoặc xuất xứ (ít nhất 5 ký tự)')
    .max(500),
  allowDownload: z.boolean().default(false),
  audience: z.enum(LIBRARY_AUDIENCES).default('ALL'),
  gradeLevels: z.array(z.number().int().min(10).max(12)).max(3).default([]),
  classIds: z.array(id).max(100).default([]),
};

export const createItemSchema = z.object(itemFields);
export type CreateItemInput = z.infer<typeof createItemSchema>;

// Sửa: gửi lại đủ các trường như khi tạo (form luôn gửi cả bộ), riêng `kind` không đổi được sau khi đã có file.
export const updateItemSchema = z.object(itemFields);
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional(),
  kind: z.enum(LIBRARY_KINDS).optional(),
  subjectId: id.optional(),
  gradeLevel: z.coerce.number().int().min(10).max(12).optional(),
  sort: z.enum(['new', 'popular']).default('new'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const submissionsQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.enum(LIBRARY_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
});
export type SubmissionsQuery = z.infer<typeof submissionsQuerySchema>;

// Tải lên: `file` = file tài liệu vào kho riêng tư, `cover` = ảnh bìa vào kho công khai (qua bảng media).
export const uploadSchema = z.object({
  target: z.enum(['file', 'cover']),
  mimeType: z.string().trim().toLowerCase().max(100),
  size: z.number().int().positive(),
});
export type UploadInput = z.infer<typeof uploadSchema>;

export const completeUploadSchema = z.object({
  target: z.enum(['file', 'cover']),
  uploadId: id.optional(), // ảnh bìa: id media trả về ở bước presign
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export const reviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'archive', 'restore']),
  reason: z.string().trim().max(500).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const accessSchema = z.object({ download: z.boolean().default(false) });
export type AccessInput = z.infer<typeof accessSchema>;

export const progressSchema = z.object({ position: z.number().min(0).max(1_000_000) });
export type ProgressInput = z.infer<typeof progressSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Chưa nhập tên danh mục').max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang')
    .max(120)
    .optional(),
  parentId: id.nullish(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type CategoryInput = z.infer<typeof categorySchema>;
