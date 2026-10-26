import { TEACHING_MAX_PERIODS } from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const periods = (min: number) =>
  z
    .number({ error: 'Số tiết phải là số nguyên' })
    .int('Số tiết phải là số nguyên')
    .min(min, `Số tiết tối thiểu là ${min}`)
    .max(TEACHING_MAX_PERIODS, `Số tiết tối đa là ${TEACHING_MAX_PERIODS}`);

export const quotasQuerySchema = z.object({ schoolYearId: id.optional() });
export type QuotasQuery = z.infer<typeof quotasQuerySchema>;

// periodsPerWeek = null: xoá định mức (quay về "chưa đặt").
export const setGradeQuotaSchema = z.object({
  schoolYearId: id.optional(),
  gradeLevel: z.number().int().min(10).max(12),
  subjectId: id,
  periodsPerWeek: periods(0).nullable(),
});
export type SetGradeQuotaInput = z.infer<typeof setGradeQuotaSchema>;

export const setClassQuotaSchema = z.object({
  classId: id,
  subjectId: id,
  periodsPerWeek: periods(0).nullable(),
});
export type SetClassQuotaInput = z.infer<typeof setClassQuotaSchema>;

export const assignmentsQuerySchema = z.object({
  schoolYearId: id.optional(),
  classId: id.optional(),
  teacherId: id.optional(),
  semesterId: id.optional(),
});
export type AssignmentsQuery = z.infer<typeof assignmentsQuerySchema>;

export const createAssignmentSchema = z.object({
  classId: id,
  subjectId: id,
  teacherId: id,
  semesterId: id.nullable().optional(), // bỏ trống = cả năm học
  periodsPerWeek: periods(1),
  // Giáo viên khác tổ chuyên môn với môn học: phải xác nhận rõ ràng.
  confirmCrossDepartment: z.boolean().optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  teacherId: id.optional(),
  periodsPerWeek: periods(1).optional(),
  confirmCrossDepartment: z.boolean().optional(),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

const scope = z.object({ schoolYearId: id, semesterId: id.nullable().optional() });
export const copyAssignmentsSchema = z.object({ from: scope, to: scope });
export type CopyAssignmentsInput = z.infer<typeof copyAssignmentsSchema>;

export const summaryQuerySchema = z.object({ schoolYearId: id.optional(), semesterId: id.optional() });
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const teacherQuotaSchema = z.object({
  weeklyQuota: z.number().int().min(0).max(40).nullable(),
});
export type TeacherQuotaInput = z.infer<typeof teacherQuotaSchema>;
