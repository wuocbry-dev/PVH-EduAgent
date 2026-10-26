import { AUDIENCES } from '@pvh/shared';
import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const title = z.string().trim().min(1, 'Chưa nhập tên sự kiện').max(255);
const location = z.string().trim().max(255).nullish();
// Bước 20: đối tượng xem (mặc định toàn trường); khối/lớp/chỉ nhân sự chỉ hiện trong cổng.
const audience = {
  audience: z.enum(AUDIENCES).optional(),
  gradeLevel: z.number().int().min(10).max(12).nullish(),
  classId: z.string().regex(/^\d{1,18}$/, 'Mã lớp không hợp lệ').nullish(),
};

export const createEventSchema = z
  .object({ title, location, startAt: isoDate, endAt: isoDate, ...audience })
  .refine((v) => v.endAt > v.startAt, {
    message: 'Thời điểm kết thúc phải sau thời điểm bắt đầu',
    path: ['endAt'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

// Khi sửa, ràng buộc end_at > start_at được kiểm tra lại ở service trên giá trị đã gộp với bản ghi cũ.
export const updateEventSchema = z.object({
  title: title.optional(),
  location,
  startAt: isoDate.optional(),
  endAt: isoDate.optional(),
  ...audience,
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const listEventsQuerySchema = z
  .object({
    // Khoảng cần xem (lịch tháng): sự kiện có giao với [from, to]. Mặc định: từ bây giờ trở đi.
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => !v.from || !v.to || v.to > v.from, {
    message: 'to phải sau from',
    path: ['to'],
  });
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
