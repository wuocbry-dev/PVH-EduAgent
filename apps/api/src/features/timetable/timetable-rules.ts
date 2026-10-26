import { TIMETABLE_DAY_NAMES, type ClassSessions, type TimetableFrameDto } from '@pvh/shared';

export interface FixedLike {
  name: string;
  kind: 'SCHOOL' | 'CLASS_MEETING';
  day: number;
  period: number;
  gradeLevel: number | null;
}

// Dữ liệu đã nạp sẵn để kiểm tra một ô (thứ, tiết) có đặt được phân công này không. Không chạm CSDL nên kiểm thử trực tiếp.
export interface PlacementContext {
  frame: TimetableFrameDto;
  assignmentInSemester: boolean;
  className: string;
  gradeLevel: number;
  sessions: ClassSessions;
  teacherName: string;
  subjectName: string;
  periodsPerWeek: number;
  placedCount: number; // số tiết của phân công này đã xếp trong phiên bản (không tính tiết đang chuyển)
  fixed: FixedLike[];
  classSlots: { day: number; period: number; subjectName: string }[];
  teacherSlots: { day: number; period: number; className: string; subjectName: string }[];
  // Các lớp mà giáo viên là chủ nhiệm (bận ở tiết sinh hoạt lớp của lớp đó).
  homeroomClasses: { className: string; gradeLevel: number }[];
  room: { name: string; slots: { day: number; period: number; className: string }[] } | null;
  unavailable: { day: number; period: number; note: string | null }[];
}

export interface PlacementResult {
  blocking: string[];
  warnings: string[];
}

const dayName = (day: number) => TIMETABLE_DAY_NAMES[day] ?? `thứ ${day}`;
const where = (day: number, period: number) => `${dayName(day)} tiết ${period}`;

// Lý do không đặt được (blocking) và lưu ý cần xác nhận (warnings) cho ô (day, period).
export function evaluatePlacement(ctx: PlacementContext, day: number, period: number): PlacementResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!ctx.assignmentInSemester) {
    blocking.push('Phân công không thuộc học kỳ của phiên bản này');
    return { blocking, warnings };
  }
  const framePeriod = ctx.frame.periods.find((p) => p.no === period);
  if (!ctx.frame.days.includes(day) || !framePeriod) {
    blocking.push(`${where(day, period)} không nằm trong khung tiết học`);
    return { blocking, warnings };
  }
  if (ctx.sessions !== 'BOTH' && ctx.sessions !== framePeriod.session) {
    blocking.push(`Lớp ${ctx.className} chỉ học ${ctx.sessions === 'MORNING' ? 'buổi sáng' : 'buổi chiều'}`);
  }

  for (const f of ctx.fixed) {
    if (f.day === day && f.period === period && (f.gradeLevel === null || f.gradeLevel === ctx.gradeLevel)) {
      blocking.push(`Tiết cố định "${f.name}"${f.gradeLevel === null ? ' (cả trường)' : ` (khối ${f.gradeLevel})`}`);
    }
  }
  const clash = ctx.classSlots.find((s) => s.day === day && s.period === period);
  if (clash) blocking.push(`Lớp ${ctx.className} đã có tiết ${clash.subjectName}`);
  const busy = ctx.teacherSlots.find((s) => s.day === day && s.period === period);
  if (busy) blocking.push(`${ctx.teacherName} đang dạy lớp ${busy.className} (${busy.subjectName})`);
  for (const hc of ctx.homeroomClasses) {
    const meeting = ctx.fixed.find(
      (f) => f.kind === 'CLASS_MEETING' && f.day === day && f.period === period && (f.gradeLevel === null || f.gradeLevel === hc.gradeLevel),
    );
    if (meeting) blocking.push(`${ctx.teacherName} chủ nhiệm lớp ${hc.className}, đang là tiết "${meeting.name}"`);
  }
  if (ctx.room) {
    const used = ctx.room.slots.find((s) => s.day === day && s.period === period);
    if (used) blocking.push(`Phòng ${ctx.room.name} đang được lớp ${used.className} dùng`);
  }
  if (ctx.placedCount >= ctx.periodsPerWeek) {
    blocking.push(`${ctx.subjectName} của lớp ${ctx.className} đã đủ ${ctx.periodsPerWeek} tiết/tuần`);
  }

  const off = ctx.unavailable.find((u) => u.day === day && u.period === period);
  if (off) warnings.push(`${ctx.teacherName} đăng ký bận ${where(day, period)}${off.note ? ` (${off.note})` : ''}`);

  return { blocking, warnings };
}

// Số tiết trống xen kẽ trong ngày: các tiết nằm giữa tiết dạy đầu và cuối mà giáo viên không dạy.
export function countGaps(periods: readonly number[]): number {
  if (periods.length < 2) return 0;
  const sorted = [...periods].sort((a, b) => a - b);
  return sorted[sorted.length - 1]! - sorted[0]! + 1 - sorted.length;
}
