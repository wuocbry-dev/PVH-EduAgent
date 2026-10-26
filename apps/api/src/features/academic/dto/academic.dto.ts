import { GRADING_TYPES, SEMESTER_NUMBERS } from '@pvh/shared';
import { z } from 'zod';

const id = z.string().regex(/^\d{1,18}$/, 'Mã không hợp lệ');
const name = (label: string, max: number) =>
  z.string().trim().min(1, `Chưa nhập ${label}`).max(max, `${label} tối đa ${max} ký tự`);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Ngày không hợp lệ');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

const rangeOk = (v: { startDate?: string; endDate?: string }) => !v.startDate || !v.endDate || v.startDate <= v.endDate;
const RANGE_MSG = { message: 'Ngày kết thúc phải sau ngày bắt đầu', path: ['endDate'] };

export const schoolYearSchema = z
  .object({
    name: name('tên năm học', 20).regex(/^\d{4}-\d{4}$/, 'Tên năm học có dạng 2026-2027'),
    startDate: date,
    endDate: date,
    isCurrent: z.boolean().optional(),
  })
  .refine(rangeOk, RANGE_MSG);
export type SchoolYearInput = z.infer<typeof schoolYearSchema>;

export const updateSchoolYearSchema = z
  .object({
    name: name('tên năm học', 20).regex(/^\d{4}-\d{4}$/, 'Tên năm học có dạng 2026-2027').optional(),
    startDate: date.optional(),
    endDate: date.optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine(rangeOk, RANGE_MSG);
export type UpdateSchoolYearInput = z.infer<typeof updateSchoolYearSchema>;

export const semesterQuerySchema = z.object({ schoolYearId: id.optional() });
export type SemesterQuery = z.infer<typeof semesterQuerySchema>;

export const semesterSchema = z
  .object({
    schoolYearId: id,
    number: z.number().int().refine((n) => (SEMESTER_NUMBERS as readonly number[]).includes(n), 'Học kỳ là 1 hoặc 2'),
    startDate: date,
    endDate: date,
  })
  .refine(rangeOk, RANGE_MSG);
export type SemesterInput = z.infer<typeof semesterSchema>;

export const updateSemesterSchema = z
  .object({ startDate: date.optional(), endDate: date.optional() })
  .refine(rangeOk, RANGE_MSG);
export type UpdateSemesterInput = z.infer<typeof updateSemesterSchema>;

export const departmentSchema = z.object({ name: name('tên tổ chuyên môn', 100) });
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const subjectSchema = z.object({
  code: name('mã môn', 20).transform((v) => v.toUpperCase()).refine((v) => /^[A-Z0-9_-]+$/.test(v), 'Mã môn chỉ gồm chữ, số, gạch'),
  name: name('tên môn', 100),
  departmentId: id.nullable().optional(),
  gradingType: z.enum(GRADING_TYPES).default('SCORE'),
});
export type SubjectInput = z.infer<typeof subjectSchema>;

export const updateSubjectSchema = z.object({
  name: name('tên môn', 100).optional(),
  departmentId: id.nullable().optional(),
  gradingType: z.enum(GRADING_TYPES).optional(),
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const roomSchema = z.object({
  name: name('tên phòng', 100),
  kind: optionalText(50).optional(),
});
export type RoomInput = z.infer<typeof roomSchema>;
export const updateRoomSchema = roomSchema.partial();
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const classQuerySchema = z.object({ schoolYearId: id.optional() });
export type ClassQuery = z.infer<typeof classQuerySchema>;

const className = name('tên lớp', 20).regex(/^[0-9A-Za-zÀ-ỹ._ -]+$/u, 'Tên lớp chỉ gồm chữ, số, dấu gạch');

export const classSchema = z.object({
  name: className,
  gradeLevel: z.number().int().min(10).max(12),
  schoolYearId: id.optional(), // bỏ trống = năm học hiện hành
  subjectCombo: optionalText(100).optional(),
  homeroomTeacherId: id.nullable().optional(),
});
export type ClassInput = z.infer<typeof classSchema>;

export const updateClassSchema = z.object({
  name: className.optional(),
  subjectCombo: optionalText(100).optional(),
  homeroomTeacherId: id.nullable().optional(),
});
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const transferStudentSchema = z.object({ classId: id });
export type TransferStudentInput = z.infer<typeof transferStudentSchema>;
