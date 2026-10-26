import { MEDIA_MIME_TYPES } from '@pvh/shared';
import { z } from 'zod';

// Kích thước tối đa theo từng loại được kiểm tra trong MediaService (ảnh 10 MB, video 100 MB).
export const presignSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(MEDIA_MIME_TYPES, { error: 'Chỉ chấp nhận ảnh JPEG, PNG, WebP, GIF hoặc video MP4, WebM' }),
  size: z.number().int().positive(),
});
export type PresignInput = z.infer<typeof presignSchema>;

export const listMediaQuerySchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO']).optional(),
});
