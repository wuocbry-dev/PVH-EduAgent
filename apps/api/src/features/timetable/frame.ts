import { defaultTimetableFrame, TIMETABLE_MAX_PERIODS, type TimetableFrameDto } from '@pvh/shared';
import { z } from 'zod';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:mm');

// Khung tiết lưu trong `system_settings` (khoá timetable.frame) dạng JSON. Tiết đánh số liên tục từ 1, giờ tăng dần,
// buổi sáng đứng trước buổi chiều.
export const frameSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(6)).min(1, 'Cần ít nhất một ngày học').max(6),
    periods: z
      .array(
        z.object({
          no: z.number().int().min(1).max(TIMETABLE_MAX_PERIODS),
          session: z.enum(['MORNING', 'AFTERNOON']),
          start: time,
          end: time,
        }),
      )
      .min(1, 'Cần ít nhất một tiết')
      .max(TIMETABLE_MAX_PERIODS, `Tối đa ${TIMETABLE_MAX_PERIODS} tiết/ngày`),
  })
  .superRefine((frame, ctx) => {
    if (new Set(frame.days).size !== frame.days.length) {
      ctx.addIssue({ code: 'custom', path: ['days'], message: 'Ngày học bị trùng' });
    }
    let previousEnd = '';
    let seenAfternoon = false;
    frame.periods.forEach((p, i) => {
      const path = ['periods', i];
      if (p.no !== i + 1) ctx.addIssue({ code: 'custom', path, message: 'Số tiết phải liên tục từ 1' });
      if (p.start >= p.end) ctx.addIssue({ code: 'custom', path, message: `Tiết ${p.no}: giờ kết thúc phải sau giờ bắt đầu` });
      if (previousEnd && p.start < previousEnd) ctx.addIssue({ code: 'custom', path, message: `Tiết ${p.no} bắt đầu trước khi tiết trước kết thúc` });
      if (p.session === 'AFTERNOON') seenAfternoon = true;
      else if (seenAfternoon) ctx.addIssue({ code: 'custom', path, message: 'Các tiết buổi sáng phải đứng trước buổi chiều' });
      previousEnd = p.end;
    });
  });
export type FrameInput = z.infer<typeof frameSchema>;

// Đọc khung từ giá trị đã lưu; hỏng (do sửa tay) thì dùng khung mặc định.
export function parseFrame(raw: string): TimetableFrameDto {
  try {
    const parsed = frameSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // dùng mặc định
  }
  return defaultTimetableFrame();
}
