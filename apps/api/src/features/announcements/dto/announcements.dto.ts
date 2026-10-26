import { ANNOUNCEMENT_CONTENT_MAX, ANNOUNCEMENT_TITLE_MAX, AUDIENCES } from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1, 'Chưa nhập tiêu đề').max(ANNOUNCEMENT_TITLE_MAX),
  content: z.string().trim().min(1, 'Chưa nhập nội dung').max(ANNOUNCEMENT_CONTENT_MAX, 'Nội dung quá dài'),
  audience: z.enum(AUDIENCES),
  gradeLevel: z.number().int().min(10).max(12).nullish(),
  classId: id.nullish(),
  pinned: z.boolean().optional(),
  expiresAt: z.iso.datetime({ offset: true, error: 'Hạn hiển thị không hợp lệ' }).nullish(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

// Đánh dấu đã đọc: theo từng mục, hoặc tất cả.
export const markReadSchema = z.object({
  announcementIds: z.array(id).max(200).optional(),
  notificationIds: z.array(id).max(200).optional(),
  all: z.boolean().optional(),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;
