// Thời khoá biểu (bước 17): khung tiết, phiên bản (nháp/công bố/lưu trữ), tiết cố định, tiết bận, xem theo tuần.
// Thứ: 1 = thứ Hai … 6 = thứ Bảy. Mỗi lớp một thời khoá biểu; học sinh cùng lớp dùng chung.

export const TIMETABLE_DAYS = [1, 2, 3, 4, 5, 6] as const;
export const TIMETABLE_DAY_NAMES: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
};
export const TIMETABLE_MAX_PERIODS = 10;

export const CLASS_SESSIONS = ['MORNING', 'AFTERNOON', 'BOTH'] as const;
export type ClassSessions = (typeof CLASS_SESSIONS)[number];
export const CLASS_SESSION_NAMES: Record<ClassSessions, string> = {
  MORNING: 'Buổi sáng',
  AFTERNOON: 'Buổi chiều',
  BOTH: 'Cả sáng và chiều',
};

export type PeriodSession = 'MORNING' | 'AFTERNOON';

export interface FramePeriod {
  no: number; // số tiết 1..N (liên tục)
  session: PeriodSession;
  start: string; // HH:mm
  end: string;
}

// Khung tiết lưu trong cấu hình hệ thống `timetable.frame` (JSON), BGH và ADMIN chỉnh được.
export interface TimetableFrameDto {
  days: number[];
  periods: FramePeriod[];
}

// Mặc định: thứ Hai–thứ Bảy, sáng 5 tiết từ 7:00, chiều 4 tiết từ 13:00; tiết 45 phút, ra chơi 5 phút
// (20 phút sau tiết 2 buổi sáng).
export function defaultTimetableFrame(): TimetableFrameDto {
  const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const periods: FramePeriod[] = [];
  const build = (session: PeriodSession, startMinutes: number, count: number, longBreakAfter: number | null) => {
    let t = startMinutes;
    for (let i = 1; i <= count; i++) {
      periods.push({ no: periods.length + 1, session, start: toTime(t), end: toTime(t + 45) });
      t += 45 + (i === longBreakAfter ? 20 : 5);
    }
  };
  build('MORNING', 7 * 60, 5, 2);
  build('AFTERNOON', 13 * 60, 4, null);
  return { days: [1, 2, 3, 4, 5, 6], periods };
}

export const TIMETABLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TimetableStatus = (typeof TIMETABLE_STATUSES)[number];
export const TIMETABLE_STATUS_NAMES: Record<TimetableStatus, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã công bố',
  ARCHIVED: 'Đã lưu trữ',
};

export interface TimetableVersionDto {
  id: string;
  semesterId: string;
  semesterName: string;
  schoolYearName: string;
  name: string;
  status: TimetableStatus;
  effectiveDate: string | null; // YYYY-MM-DD
  publishedAt: string | null;
  publishedByName: string | null;
  createdAt: string;
  slotCount: number;
}

export interface TimetableSlotDto {
  id: string;
  timetableId: string;
  day: number;
  period: number;
  classId: string;
  className: string;
  assignmentId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  roomId: string | null;
  roomName: string | null;
}

export const FIXED_PERIOD_KINDS = ['SCHOOL', 'CLASS_MEETING'] as const;
export type FixedPeriodKind = (typeof FIXED_PERIOD_KINDS)[number];
export const FIXED_PERIOD_KIND_NAMES: Record<FixedPeriodKind, string> = {
  SCHOOL: 'Cả trường / khối (không xếp môn)',
  CLASS_MEETING: 'Sinh hoạt lớp (chủ nhiệm bận)',
};

export interface FixedPeriodDto {
  id: string;
  name: string;
  kind: FixedPeriodKind;
  day: number;
  period: number;
  gradeLevel: number | null; // rỗng = cả trường
}

export interface TeacherUnavailabilityDto {
  teacherId: string;
  teacherName: string;
  day: number;
  period: number;
  note: string | null;
}

// Ô trên lưới khi đang chọn một phân công: đặt được không, và vì sao không / cần lưu ý.
export interface PlacementOptionDto {
  day: number;
  period: number;
  ok: boolean;
  blocking: string[]; // lý do không đặt được
  warnings: string[]; // đặt được nhưng cần xác nhận (vd. giáo viên đăng ký bận)
}

export interface TimetableStatsDto {
  // Lớp còn thiếu tiết môn nào (so với số tiết đã phân công).
  classes: { classId: string; className: string; missing: { assignmentId: string; subjectName: string; missing: number }[] }[];
  // Mỗi giáo viên mỗi ngày: số tiết và số tiết trống xen kẽ giữa các tiết dạy.
  teachers: { teacherId: string; teacherName: string; days: { day: number; periods: number; gaps: number }[]; total: number }[];
}

// Một ô trong lịch xem theo tuần (lớp hoặc giáo viên).
export interface ViewSlotDto {
  period: number;
  className: string;
  subjectName: string | null; // rỗng khi là tiết cố định
  teacherName: string | null;
  roomName: string | null;
  fixedName: string | null; // Chào cờ, Sinh hoạt lớp…
}

export interface WeekDayDto {
  day: number;
  date: string; // YYYY-MM-DD
  versionId: string | null; // phiên bản có hiệu lực vào ngày này
  versionName: string | null;
  effectiveDate: string | null;
  slots: ViewSlotDto[];
}

export interface WeekViewDto {
  title: string;
  weekStart: string; // thứ Hai của tuần
  today: string;
  frame: TimetableFrameDto;
  days: WeekDayDto[];
}
