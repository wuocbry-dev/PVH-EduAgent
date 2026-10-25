import { AUDIT_CHANNELS } from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const isoDate = z.iso.datetime({ offset: true });

export const listAuditLogsQuerySchema = z
  .object({
    userId: id.optional(),
    channel: z.enum(AUDIT_CHANNELS).optional(),
    // Tìm theo một phần tên action, không phân biệt hoa thường (vd. "post." hoặc "agent:").
    action: z.string().trim().max(80).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    // id của dòng cuối trang trước (nextCursor); nhật ký đi từ mới tới cũ.
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((v) => !v.from || !v.to || v.to > v.from, {
    message: 'to phải sau from',
    path: ['to'],
  });
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
