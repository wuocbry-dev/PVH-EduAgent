import { ASSESSMENT_TYPES, SCORE_ADJUSTMENT_STATUSES, SCORE_NOTE_MAX, SCORE_REASON_MAX } from '@pvh/shared';
import { z } from 'zod';

// Bước 19 – xem điểm, thống kê, hạn nhập/khoá sổ, đề nghị điều chỉnh điểm.
const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const reason = z.string().trim().min(5, 'Lý do cần ít nhất 5 ký tự').max(SCORE_REASON_MAX, `Lý do tối đa ${SCORE_REASON_MAX} ký tự`);

export const gradebookQuerySchema = z.object({ classId: id, subjectId: id, semesterId: id });
export type GradebookQuery = z.infer<typeof gradebookQuerySchema>;

// semesterId bỏ trống = cả năm học của lớp.
export const classSummaryQuerySchema = z.object({ semesterId: id.optional() });
export type ClassSummaryQuery = z.infer<typeof classSummaryQuerySchema>;

export const statsQuerySchema = z.object({
  semesterId: id.optional(),
  gradeLevel: z.coerce.number().int().min(10).max(12).optional(),
  subjectId: id.optional(),
});
export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const deadlineSchema = z.object({
  semesterId: id,
  type: z.enum(ASSESSMENT_TYPES),
  deadline: z.iso.datetime({ offset: true, error: 'Hạn nhập điểm không hợp lệ' }).nullable(),
});
export type DeadlineInput = z.infer<typeof deadlineSchema>;

export const lockSchema = z.object({
  locked: z.boolean(),
  reason: z.string().trim().max(SCORE_REASON_MAX).optional(),
});
export type LockInput = z.infer<typeof lockSchema>;

// Điểm mới dạng chuỗi ("8,5") hoặc số, null = xoá điểm; vắng có lý do thì điểm trống và bắt buộc ghi chú.
export const createAdjustmentSchema = z.object({
  assessmentId: id,
  classId: id,
  studentId: id,
  value: z.union([z.string().max(10), z.number(), z.null()]),
  status: z.enum(['GRADED', 'ABSENT']).optional(),
  note: z.string().trim().max(SCORE_NOTE_MAX).nullable().optional(),
  reason,
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const adjustmentsQuerySchema = z.object({
  status: z.enum(SCORE_ADJUSTMENT_STATUSES).optional(),
});
export type AdjustmentsQuery = z.infer<typeof adjustmentsQuerySchema>;

export const reviewAdjustmentSchema = z.object({
  note: z.string().trim().max(SCORE_REASON_MAX).optional(),
});
export type ReviewAdjustmentInput = z.infer<typeof reviewAdjustmentSchema>;
