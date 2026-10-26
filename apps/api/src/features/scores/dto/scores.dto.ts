import { ASSESSMENT_CODE_PATTERN, ASSESSMENT_TYPES, SCORE_NOTE_MAX } from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD');
const description = z.string().trim().max(500, 'Mô tả tối đa 500 ký tự');
const deadline = z.iso.datetime({ offset: true, error: 'Hạn nhập điểm không hợp lệ' });

export const assessmentsQuerySchema = z.object({
  semesterId: id.optional(),
  classId: id.optional(),
  subjectId: id.optional(),
  type: z.enum(ASSESSMENT_TYPES).optional(),
});
export type AssessmentsQuery = z.infer<typeof assessmentsQuerySchema>;

export const progressQuerySchema = z.object({
  semesterId: id.optional(),
  subjectId: id.optional(),
  gradeLevel: z.coerce.number().int().min(10).max(12).optional(),
  type: z.enum(ASSESSMENT_TYPES).optional(),
});
export type ProgressQuery = z.infer<typeof progressQuerySchema>;

// Đợt thường xuyên (giáo viên): một lớp. Đợt giữa kỳ/cuối kỳ (BGH): một khối, mặc định mọi lớp của khối.
export const createAssessmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('THUONG_XUYEN'),
    semesterId: id,
    subjectId: id,
    classId: id,
    testDate: date,
    description: description.optional(),
  }),
  z.object({
    type: z.enum(['GIUA_KY', 'CUOI_KY']),
    semesterId: id,
    subjectId: id,
    gradeLevel: z.number().int().min(10).max(12),
    classIds: z.array(id).min(1).max(100).optional(),
    testDate: date,
    description: description.optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(ASSESSMENT_CODE_PATTERN, 'Mã đợt chỉ gồm chữ in hoa, số và dấu gạch ngang (3–40 ký tự)')
      .optional(),
    entryDeadline: deadline.nullable().optional(),
  }),
]);
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentSchema = z.object({
  testDate: date.optional(),
  description: description.nullable().optional(),
  entryDeadline: deadline.nullable().optional(), // chỉ BGH
});
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

const note = z.string().trim().max(SCORE_NOTE_MAX, `Ghi chú tối đa ${SCORE_NOTE_MAX} ký tự`);

// Giá trị điểm nhận dạng chuỗi ("8,5") hoặc số; chuẩn hoá và kiểm tra 0–10 trong service (parseScore).
export const saveScoresSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: id,
        value: z.union([z.string().max(10), z.number(), z.null()]),
        status: z.enum(['GRADED', 'ABSENT']).optional(),
        note: note.nullable().optional(),
      }),
    )
    .min(1, 'Không có điểm nào để lưu')
    .max(200),
});
export type SaveScoresInput = z.infer<typeof saveScoresSchema>;

export const exemptionSchema = z.object({
  exempt: z.boolean(),
  note: note.optional(),
});
export type ExemptionInput = z.infer<typeof exemptionSchema>;
