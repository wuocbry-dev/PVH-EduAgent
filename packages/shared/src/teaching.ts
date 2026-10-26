// Phân công giảng dạy (bước 16): định mức tiết/tuần của môn theo khối, phân công giáo viên–môn–lớp, cảnh báo và thống kê.
// Số liệu mẫu trong seed là MẪU theo chương trình GDPT 2018, cần đối chiếu với kế hoạch giáo dục của nhà trường.

// Định mức tiết/tuần mặc định của một giáo viên THPT (có thể đổi ở cấu hình `teaching.default_quota` hoặc ghi đè theo người).
export const TEACHING_DEFAULT_WEEKLY_QUOTA = 17;
export const TEACHING_MAX_PERIODS = 10;
export const TEACHING_SAMPLE_NOTE =
  'Số tiết mẫu theo chương trình GDPT 2018, cần đối chiếu với kế hoạch giáo dục của nhà trường trước khi dùng thật.';

// GET /api/teaching/quotas
export interface PeriodQuotasDto {
  schoolYearId: string;
  // Số tiết/tuần theo khối (chỉ môn đã đặt); môn chưa có dòng nghĩa là chưa đặt định mức.
  grades: { gradeLevel: number; quotas: { subjectId: string; periodsPerWeek: number }[] }[];
  // Ghi đè cho từng lớp.
  classOverrides: { classId: string; subjectId: string; periodsPerWeek: number }[];
}

// GET /api/teaching/assignments
export interface TeachingAssignmentDto {
  id: string;
  schoolYearId: string;
  semesterId: string | null; // null = cả năm học
  semesterName: string | null;
  classId: string;
  className: string;
  gradeLevel: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  periodsPerWeek: number;
  // Giáo viên khác tổ chuyên môn với môn học (dạy chéo môn, cần xác nhận khi giao).
  crossDepartment: boolean;
}

// GET /api/teaching/mine – lớp tôi dạy
export interface MyTeachingDto {
  schoolYearName: string | null;
  weeklyQuota: number;
  totalPeriods: number;
  items: {
    classId: string;
    className: string;
    studentCount: number;
    subjectCode: string;
    subjectName: string;
    semesterName: string | null;
    periodsPerWeek: number;
  }[];
}

export const TEACHING_ISSUE_TYPES = [
  'SUBJECT_UNASSIGNED',
  'PERIODS_SHORT',
  'PERIODS_EXCESS',
  'NO_QUOTA',
  'TEACHER_OVER',
  'TEACHER_UNDER',
  'CROSS_DEPARTMENT',
] as const;
export type TeachingIssueType = (typeof TEACHING_ISSUE_TYPES)[number];

export const TEACHING_ISSUE_NAMES: Record<TeachingIssueType, string> = {
  SUBJECT_UNASSIGNED: 'Môn chưa có giáo viên',
  PERIODS_SHORT: 'Lớp thiếu tiết',
  PERIODS_EXCESS: 'Lớp thừa tiết',
  NO_QUOTA: 'Phân công môn chưa có định mức',
  TEACHER_OVER: 'Giáo viên vượt định mức',
  TEACHER_UNDER: 'Giáo viên thiếu định mức',
  CROSS_DEPARTMENT: 'Dạy chéo tổ chuyên môn',
};

export interface TeachingIssueDto {
  type: TeachingIssueType;
  severity: 'error' | 'warning';
  message: string;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
}

export interface ClassTeachingDto {
  classId: string;
  className: string;
  gradeLevel: number;
  requiredPeriods: number; // tổng định mức các môn
  assignedPeriods: number; // tổng tiết đã phân công (chỉ các môn có định mức)
  subjects: {
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    requiredPeriods: number;
    assignedPeriods: number;
    teachers: { teacherId: string; teacherName: string; periodsPerWeek: number }[];
  }[];
}

export interface TeacherLoadDto {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  departmentName: string | null;
  periods: number; // tổng tiết/tuần đang dạy
  quota: number; // định mức (ghi đè hoặc mặc định)
  quotaOverridden: boolean;
  delta: number; // periods - quota (âm = thiếu, dương = vượt)
  assignments: { classId: string; className: string; subjectName: string; periodsPerWeek: number }[];
}

export interface DepartmentLoadDto {
  departmentName: string;
  teachers: number;
  periods: number;
  quota: number;
}

// GET /api/teaching/summary
export interface TeachingSummaryDto {
  schoolYearId: string;
  schoolYearName: string;
  semesterId: string | null;
  defaultQuota: number;
  totals: {
    classes: number;
    teachers: number;
    requiredPeriods: number;
    assignedPeriods: number;
    unassignedSubjects: number; // số cặp lớp–môn có định mức nhưng chưa có giáo viên
  };
  classes: ClassTeachingDto[];
  teachers: TeacherLoadDto[];
  departments: DepartmentLoadDto[];
  issues: TeachingIssueDto[];
}

// POST /api/teaching/assignments/copy
export interface CopyAssignmentsResultDto {
  copied: number;
  skipped: { className: string; subjectName: string; reason: string }[];
}
