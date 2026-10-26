// Dữ liệu học vụ gốc (bước 14): năm học, lớp, môn, hồ sơ giáo viên/học sinh, nhập danh sách, mã kích hoạt.
// Chỉ lưu dữ liệu tối thiểu: không có thông tin gia đình, địa chỉ, CCCD hay điểm số.

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_NAMES: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ' };

export const GRADING_TYPES = ['SCORE', 'COMMENT'] as const;
export type GradingType = (typeof GRADING_TYPES)[number];
export const GRADING_TYPE_NAMES: Record<GradingType, string> = {
  SCORE: 'Tính điểm số',
  COMMENT: 'Nhận xét',
};

export const SEMESTER_NUMBERS = [1, 2] as const;

export interface SchoolYearDto {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  isCurrent: boolean;
}

export interface SemesterDto {
  id: string;
  schoolYearId: string;
  number: number; // 1 | 2
  name: string;
  startDate: string;
  endDate: string;
}

export interface GradeDto {
  id: string;
  level: number; // 10 | 11 | 12
  name: string;
}

export interface DepartmentDto {
  id: string;
  name: string;
}

export interface SubjectDto {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  gradingType: GradingType;
}

export interface RoomDto {
  id: string;
  name: string;
  kind: string | null;
}

import type { ClassSessions } from './timetable.js';

export interface ClassDto {
  id: string;
  name: string;
  gradeId: string;
  gradeLevel: number;
  schoolYearId: string;
  schoolYearName: string;
  subjectCombo: string | null;
  homeroomTeacherId: string | null;
  homeroomTeacherName: string | null;
  studentCount: number;
  // Lớp học buổi nào (thời khoá biểu).
  sessions: ClassSessions;
}

export interface ClassStudentDto {
  userId: string;
  studentCode: string;
  fullName: string;
  birthDate: string | null;
  gender: Gender | null;
  status: 'ACTIVE' | 'LOCKED' | 'PENDING';
  lastLoginAt: string | null; // lần đăng nhập thành công gần nhất (từ nhật ký), cho giáo viên chủ nhiệm theo dõi
}

export interface TeacherOptionDto {
  userId: string;
  teacherCode: string;
  fullName: string;
}

// ───────────────────────────── Nhập danh sách từ Excel ─────────────────────────────

export const ROSTER_KINDS = ['STUDENT', 'TEACHER'] as const;
export type RosterKind = (typeof ROSTER_KINDS)[number];

export const ROSTER_MAX_BYTES = 2 * 1024 * 1024;
export const ROSTER_MAX_ROWS = 3000;
export const ACTIVATION_CODE_TTL_DAYS = 14;

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type RosterRowStatus = 'ok' | 'skip' | 'error';

export interface RosterPreviewRow {
  row: number; // số dòng trong file (dòng tiêu đề là 1)
  status: RosterRowStatus;
  messages: string[];
  code: string;
  fullName: string;
  className: string | null; // học sinh: lớp; giáo viên: lớp chủ nhiệm
  email: string | null;
  department: string | null;
}

export interface RosterPreviewDto {
  previewId: string;
  kind: RosterKind;
  total: number;
  ok: number;
  skipped: number;
  errors: number;
  rows: RosterPreviewRow[];
  expiresAt: string;
}

// Phiếu tài khoản: mã kích hoạt gốc chỉ có trong phản hồi lúc phát hành, không lưu và không xem lại được.
export interface AccountSlipDto {
  userId: string;
  loginId: string; // mã học sinh / mã giáo viên
  fullName: string;
  className: string | null;
  email: string | null;
  activationCode: string; // dạng XXXXX-XXXXX
  expiresAt: string;
}

export interface RosterConfirmDto {
  created: number;
  skipped: number;
  slips: AccountSlipDto[];
}

// GET /api/academic/me – thông tin học vụ của chính người đăng nhập (trang tổng quan cổng học sinh/giáo viên).
export interface MyAcademicDto {
  studentCode: string | null;
  teacherCode: string | null;
  schoolYearName: string | null; // năm học hiện hành
  className: string | null; // học sinh: lớp đang học
  homeroomTeacherName: string | null; // học sinh: giáo viên chủ nhiệm lớp mình
  homeroomClasses: { id: string; name: string; studentCount: number }[]; // giáo viên: lớp chủ nhiệm (năm hiện hành)
}

// GET /api/system/overview – số liệu toàn trường cho trang tổng quan của Ban giám hiệu.
export interface SchoolOverviewDto {
  schoolYearName: string | null;
  classes: number;
  students: number;
  teachers: number;
}
