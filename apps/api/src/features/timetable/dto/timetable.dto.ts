import { FIXED_PERIOD_KINDS, TIMETABLE_MAX_PERIODS } from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const day = z.number().int().min(1, 'Thứ từ 1 (Hai) đến 6 (Bảy)').max(6, 'Thứ từ 1 (Hai) đến 6 (Bảy)');
const period = z.number().int().min(1).max(TIMETABLE_MAX_PERIODS);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Ngày không hợp lệ');
const name = (label: string, max: number) => z.string().trim().min(1, `Chưa nhập ${label}`).max(max, `${label} tối đa ${max} ký tự`);

export const versionsQuerySchema = z.object({ semesterId: id.optional() });
export type VersionsQuery = z.infer<typeof versionsQuerySchema>;

export const createVersionSchema = z.object({
  semesterId: id,
  name: name('tên phiên bản', 120),
  copyFromId: id.optional(), // sao chép các tiết đã xếp từ một phiên bản khác (cùng năm học)
});
export type CreateVersionInput = z.infer<typeof createVersionSchema>;

export const slotsQuerySchema = z.object({
  classId: id.optional(),
  teacherId: id.optional(),
  roomId: id.optional(),
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const placeSlotSchema = z.object({
  assignmentId: id,
  day,
  period,
  roomId: id.nullable().optional(),
  // Giáo viên đã đăng ký bận ở tiết này: BGH xác nhận xếp đè (ghi audit_logs).
  confirmUnavailable: z.boolean().optional(),
});
export type PlaceSlotInput = z.infer<typeof placeSlotSchema>;

export const moveSlotSchema = z.object({
  day,
  period,
  roomId: id.nullable().optional(),
  confirmUnavailable: z.boolean().optional(),
});
export type MoveSlotInput = z.infer<typeof moveSlotSchema>;

export const optionsQuerySchema = z.object({ assignmentId: id, roomId: id.optional() });
export type OptionsQuery = z.infer<typeof optionsQuerySchema>;

export const publishSchema = z.object({ effectiveDate: date });
export type PublishInput = z.infer<typeof publishSchema>;

export const fixedPeriodSchema = z.object({
  name: name('tên tiết', 80),
  kind: z.enum(FIXED_PERIOD_KINDS),
  day,
  period,
  gradeLevel: z.number().int().min(10).max(12).nullable().optional(), // rỗng = cả trường
});
export type FixedPeriodInput = z.infer<typeof fixedPeriodSchema>;

export const unavailabilityQuerySchema = z.object({ teacherId: id.optional() });
export type UnavailabilityQuery = z.infer<typeof unavailabilityQuerySchema>;

export const setUnavailabilitySchema = z.object({
  slots: z
    .array(z.object({ day, period, note: z.string().trim().max(200).optional() }))
    .max(60)
    .refine((s) => new Set(s.map((x) => `${x.day}:${x.period}`)).size === s.length, 'Có tiết bận bị trùng'),
});
export type SetUnavailabilityInput = z.infer<typeof setUnavailabilitySchema>;

export const weekQuerySchema = z.object({ date: date.optional() });
export type WeekQuery = z.infer<typeof weekQuerySchema>;

export const exportQuerySchema = z.object({
  scope: z.enum(['class', 'teacher', 'school']),
  id: id.optional(),
  versionId: id.optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
