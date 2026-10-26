import { POST_STATUSES } from '@pvh/shared';
import { z } from 'zod';

// Dùng cho tool của AI Agent (chỉ tiêu đề, tóm tắt, nội dung).
export const createPostSchema = z.object({
  title: z.string().trim().min(5).max(255),
  summary: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
// Ảnh đại diện phải là ảnh đã tải lên qua /media (PostsService đối chiếu với bảng media), không nhận địa chỉ tùy ý.
const thumbnailUrl = z.string().trim().max(500);

// Dùng cho trang soạn bài trên web.
export const createPostFormSchema = createPostSchema.extend({
  summary: z.string().trim().max(500).nullish(),
  categoryId: id.nullish(),
  thumbnailUrl: thumbnailUrl.nullish(),
});
export type CreatePostFormInput = z.infer<typeof createPostFormSchema>;

export const updatePostSchema = createPostFormSchema.partial();
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

// publishAt là ISO string; bỏ trống khi duyệt = đăng ngay.
const publishAt = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const listPostsQuerySchema = z.object({
  status: z.enum(POST_STATUSES).optional(),
  categoryId: id.optional(),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

export const approvePostSchema = z.object({ publishAt: publishAt.optional() });
export type ApprovePostInput = z.infer<typeof approvePostSchema>;

export const reschedulePostSchema = z.object({ publishAt });
export type ReschedulePostInput = z.infer<typeof reschedulePostSchema>;

export const rejectPostSchema = z.object({
  reason: z.string().trim().min(1, 'Cần nhập lý do từ chối').max(1000),
});
export type RejectPostInput = z.infer<typeof rejectPostSchema>;
