// DỮ LIỆU DEMO để xem thử các chức năng (KHÔNG phải dữ liệu thật của nhà trường). Chạy SAU `db:seed`:
//   pnpm --filter api db:seed-demo
// Tạo: 3 giáo viên mỗi môn (45 tài khoản), 10 lớp khối 10–12, 60 học sinh, định mức tiết khối 11–12, phân công cả năm,
// tiết bận của giáo viên, thời khoá biểu HK I (một bản đã công bố xếp đủ + một bản nháp xếp dở để thử), điểm HK I
// (thường xuyên, giữa kỳ), thông báo theo đối tượng, sự kiện, công việc.
// Chỉ chạy một lần: nếu đã có giáo viên GVTOAN1 thì dừng. Làm lại từ đầu: `pnpm --filter api db:seed-demo --reset` (chỉ xoá
// đúng dữ liệu demo rồi tạo lại; dữ liệu seed gốc và dữ liệu bạn tự nhập ngoài các lớp/tài khoản demo được giữ). Chỉ xoá:
// `--reset --only`. Mỗi lần chạy nằm trong một transaction: lỗi giữa chừng thì không để lại gì.
import 'dotenv/config';
import { requiredRegularCount, DEFAULT_SCORE_FORMULA } from '@pvh/shared';
import { hashPassword } from '../src/features/auth/password.js';
import { buildAssessmentCode } from '../src/features/scores/score-rules.js';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createPgAdapter } from '../src/infrastructure/database/pg-adapter.js';

const prisma = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
const PASSWORD = process.env.SEED_PASSWORD ?? 'Pvh@2026';
type Tx = Prisma.TransactionClient;

// Sinh số giả ngẫu nhiên có hạt giống: chạy lại trên CSDL mới cho ra cùng một bộ dữ liệu.
let seed = 20262027;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const NAM = { dem: ['Văn', 'Minh', 'Quốc', 'Đức', 'Gia', 'Hữu', 'Thanh', 'Hoàng'], ten: ['An', 'Bình', 'Dũng', 'Hải', 'Hiếu', 'Hùng', 'Khang', 'Khoa', 'Long', 'Nam', 'Phát', 'Phúc', 'Quân', 'Sơn', 'Thịnh', 'Trí', 'Tuấn', 'Vinh'] };
const NU = { dem: ['Thị', 'Ngọc', 'Thu', 'Kim', 'Phương', 'Thanh', 'Bảo', 'Hoài'], ten: ['Anh', 'Châu', 'Giang', 'Hà', 'Hạnh', 'Lan', 'Linh', 'Mai', 'Ngân', 'Nhi', 'Quyên', 'Tâm', 'Thảo', 'Trang', 'Uyên', 'Vy', 'Yến'] };
const fullName = (female: boolean) => {
  const g = female ? NU : NAM;
  return `${pick(HO)} ${pick(g.dem)} ${pick(g.ten)}`;
};

// Lớp: 10A1–10A3 đã có từ seed gốc; thêm 7 lớp. `homeroom` = giáo viên chủ nhiệm (mã giáo viên).
const CLASSES = [
  { name: '10A1', grade: 10, combo: 'Khoa học tự nhiên', homeroom: null },
  { name: '10A2', grade: 10, combo: 'Khoa học tự nhiên', homeroom: 'GVLI1' },
  { name: '10A3', grade: 10, combo: 'Khoa học xã hội', homeroom: 'GVVAN1' },
  { name: '10A4', grade: 10, combo: 'Khoa học xã hội', homeroom: 'GVANH1' },
  { name: '11A1', grade: 11, combo: 'Khoa học tự nhiên', homeroom: 'GVHOA1' },
  { name: '11A2', grade: 11, combo: 'Khoa học tự nhiên', homeroom: 'GVTOAN2' },
  { name: '11A3', grade: 11, combo: 'Khoa học xã hội', homeroom: 'GVSU1' },
  { name: '12A1', grade: 12, combo: 'Khoa học tự nhiên', homeroom: 'GVSINH1' },
  { name: '12A2', grade: 12, combo: 'Khoa học tự nhiên', homeroom: 'GVTIN1' },
  { name: '12A3', grade: 12, combo: 'Khoa học xã hội', homeroom: 'GVDIA1' },
];
const STUDENTS_PER_CLASS = 6;
// Phòng dùng cho môn (để thử ràng buộc trùng phòng).
const SUBJECT_ROOM: Record<string, string> = { TIN: 'Phòng Tin học 1' };

// Nhận diện dữ liệu demo khi xoá: mã giáo viên GV<MÔN><số>, mã học sinh HS26…, tên phiên bản TKB, tiêu đề cố định.
const TEACHER_CODE = /^GV[A-Z]+[1-3]$/;
const STUDENT_PREFIX = 'HS26';
const SEED_CLASSES = ['10A1', '10A2', '10A3'];
const DEMO_TAG = ' (dữ liệu demo)';
const TIMETABLE_PUBLISHED = 'TKB học kỳ I (áp dụng từ 07/09/2026)';
const TIMETABLE_DRAFT = 'Bản nháp HK I – thử xếp lại';
const ANNOUNCEMENTS = ['Lịch kiểm tra cuối kỳ I năm học 2026–2027', 'Khối 10: đăng ký câu lạc bộ STEM', 'Khối 12: tư vấn tuyển sinh đại học',
  'Lớp 10A2: nộp ảnh thẻ làm thẻ học sinh', 'Họp hội đồng sư phạm tháng 11'] as const;
const EVENTS = ['Hội thao chào mừng 20/11', 'Ngoại khoá khối 11: tham quan bảo tàng', 'Họp phụ huynh lớp 10A2', 'Chấm thi giữa kỳ – họp tổ trưởng'] as const;
const TASKS = ['Nộp đề kiểm tra cuối kỳ I môn Toán', 'Báo cáo tiến độ chương trình Ngữ văn', 'Kiểm kê thiết bị phòng thí nghiệm Hóa', 'Viết bài tin hội thao 20/11'] as const;

// Ngày theo giờ Việt Nam → Date UTC.
const vn = (date: string, hour = 7, minute = 0) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hour - 7, minute));
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const daysFromNow = (n: number, hour: number) => {
  const d = new Date(Date.now() + n * 24 * 3600 * 1000);
  d.setUTCHours(hour - 7, 0, 0, 0);
  return d;
};

async function main() {
  if (process.argv.includes('--reset')) {
    await prisma.$transaction((tx) => removeDemo(tx), { timeout: 600_000, maxWait: 30_000 });
    console.log('Đã xoá dữ liệu demo.');
    if (process.argv.includes('--only')) return;
  }
  if (await prisma.teacherProfile.findUnique({ where: { teacherCode: 'GVTOAN1' } })) {
    console.log('Dữ liệu demo đã có (giáo viên GVTOAN1). Làm lại: pnpm --filter api db:seed-demo --reset');
    return;
  }
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.$transaction((tx) => seedAll(tx, passwordHash), { timeout: 600_000, maxWait: 30_000 });
  console.log(`Đã tạo dữ liệu demo. Mật khẩu chung: ${PASSWORD}. Danh sách tài khoản: docs/06-du-lieu-demo.md`);
}

// Xoá đúng những gì seedAll tạo ra (theo thứ tự khoá ngoại). score_history chỉ thêm, phải bật cờ purge trong transaction.
async function removeDemo(tx: Tx) {
  const principal = await tx.user.findUniqueOrThrow({ where: { email: 'bgh@pvh.edu.vn' } });
  const teachers = (await tx.teacherProfile.findMany({ select: { userId: true, teacherCode: true } }))
    .filter((t) => TEACHER_CODE.test(t.teacherCode))
    .map((t) => t.userId);
  const students = (await tx.studentProfile.findMany({ where: { studentCode: { startsWith: STUDENT_PREFIX } }, select: { userId: true } })).map((s) => s.userId);
  const assessments = (
    await tx.assessment.findMany({
      where: { OR: [{ createdBy: { in: teachers } }, { createdBy: principal.id, description: { endsWith: DEMO_TAG } }, { scores: { some: { studentId: { in: students } } } }] },
      select: { id: true },
    })
  ).map((a) => a.id);
  const year = await tx.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
  const demoClasses = (
    await tx.schoolClass.findMany({ where: { schoolYearId: year.id, name: { in: CLASSES.map((c) => c.name).filter((n) => !SEED_CLASSES.includes(n)) } }, select: { id: true } })
  ).map((c) => c.id);

  await tx.$executeRaw`SET LOCAL pvh.allow_score_history_purge = 'on'`;
  await tx.scoreAdjustment.deleteMany({ where: { OR: [{ assessmentId: { in: assessments } }, { studentId: { in: students } }] } });
  await tx.scoreHistory.deleteMany({ where: { OR: [{ assessmentId: { in: assessments } }, { studentId: { in: students } }] } });
  await tx.score.deleteMany({ where: { OR: [{ assessmentId: { in: assessments } }, { studentId: { in: students } }] } });
  await tx.assessment.deleteMany({ where: { id: { in: assessments } } });
  await tx.scoreDeadline.deleteMany({ where: { updatedBy: principal.id, deadline: { in: [vn('2026-11-07', 23, 59), vn('2027-01-10', 23, 59)] } } });
  await tx.timetable.deleteMany({ where: { name: { in: [TIMETABLE_PUBLISHED, TIMETABLE_DRAFT] } } });
  await tx.timetableSlot.deleteMany({ where: { OR: [{ teacherId: { in: teachers } }, { classId: { in: demoClasses } }] } });
  await tx.announcement.deleteMany({ where: { OR: [{ title: { in: [...ANNOUNCEMENTS] } }, { createdBy: { in: teachers } }, { classId: { in: demoClasses } }] } });
  await tx.event.deleteMany({ where: { OR: [{ title: { in: [...EVENTS] } }, { createdBy: { in: teachers } }, { classId: { in: demoClasses } }] } });
  await tx.task.deleteMany({ where: { OR: [{ title: { in: [...TASKS] } }, { assigneeId: { in: teachers } }, { createdBy: { in: teachers } }] } });
  await tx.teachingAssignment.deleteMany({ where: { OR: [{ teacherId: { in: teachers } }, { classId: { in: demoClasses } }] } });
  await tx.schoolClass.updateMany({ where: { homeroomTeacherId: { in: teachers } }, data: { homeroomTeacherId: null } });
  await tx.classEnrollment.deleteMany({ where: { classId: { in: demoClasses } } });
  await tx.classPeriodQuota.deleteMany({ where: { classId: { in: demoClasses } } });
  await tx.schoolClass.deleteMany({ where: { id: { in: demoClasses } } });
  await tx.subjectPeriodQuota.deleteMany({ where: { schoolYearId: year.id, grade: { level: { in: [11, 12] } } } });
  const users = [...teachers, ...students];
  await tx.auditLog.deleteMany({ where: { userId: { in: users } } });
  await tx.refreshToken.deleteMany({ where: { userId: { in: users } } });
  await tx.user.deleteMany({ where: { id: { in: users } } });
}

async function seedAll(tx: Tx, passwordHash: string) {
  const year = await tx.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
  const hk1 = await tx.semester.findFirstOrThrow({ where: { schoolYearId: year.id, number: 1 } });
  const principal = await tx.user.findUniqueOrThrow({ where: { email: 'bgh@pvh.edu.vn' } });
  const editor = await tx.user.findUniqueOrThrow({ where: { email: 'bientap@pvh.edu.vn' } });
  const subjects = await tx.subject.findMany({ orderBy: { id: 'asc' } });
  const grades = new Map((await tx.grade.findMany()).map((g) => [g.level, g.id]));
  const rooms = new Map((await tx.room.findMany()).map((r) => [r.name, r.id]));
  const [teacherRole, studentRole] = await Promise.all(
    ['TEACHER', 'STUDENT'].map((code) => tx.role.findUniqueOrThrow({ where: { code } })),
  );

  // ── Giáo viên: 3 người mỗi môn, đăng nhập bằng email gv.<môn><n>@pvh.edu.vn hoặc mã GV<MÔN><n>. ──
  const teachersBySubject = new Map<bigint, { id: bigint; code: string; name: string }[]>();
  const teacherByCode = new Map<string, bigint>();
  for (const s of subjects) {
    const list: { id: bigint; code: string; name: string }[] = [];
    for (let n = 1; n <= 3; n++) {
      const code = `GV${s.code}${n}`;
      const name = fullName(rand() < 0.6);
      const user = await tx.user.create({
        data: {
          email: `gv.${s.code.toLowerCase()}${n}@pvh.edu.vn`,
          fullName: name,
          phone: `09${String(10000000 + Math.floor(rand() * 89999999))}`,
          passwordHash,
          roles: { create: { roleId: teacherRole!.id } },
          teacherProfile: { create: { teacherCode: code, departmentId: s.departmentId } },
        },
      });
      list.push({ id: user.id, code, name });
      teacherByCode.set(code, user.id);
    }
    teachersBySubject.set(s.id, list);
  }

  // ── Lớp và chủ nhiệm ──
  const classes: { id: bigint; name: string; grade: number; homeroom: bigint | null }[] = [];
  for (const c of CLASSES) {
    const homeroom = c.homeroom ? teacherByCode.get(c.homeroom)! : null;
    const existing = await tx.schoolClass.findUnique({ where: { schoolYearId_name: { schoolYearId: year.id, name: c.name } } });
    const cls = existing
      ? homeroom
        ? await tx.schoolClass.update({ where: { id: existing.id }, data: { homeroomTeacherId: homeroom } })
        : existing
      : await tx.schoolClass.create({
          data: { name: c.name, gradeId: grades.get(c.grade)!, schoolYearId: year.id, subjectCombo: c.combo, homeroomTeacherId: homeroom },
        });
    classes.push({ id: cls.id, name: c.name, grade: c.grade, homeroom: cls.homeroomTeacherId });
  }

  // ── Học sinh: 6 em mỗi lớp, mã HS26xxxx (không có email, đăng nhập bằng mã). ──
  const studentsByClass = new Map<bigint, { id: bigint; ability: number }[]>();
  let seq = 1;
  for (const c of classes) {
    const list: { id: bigint; ability: number }[] = [];
    for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
      const female = rand() < 0.5;
      const name = fullName(female);
      const user = await tx.user.create({
        data: {
          fullName: name,
          passwordHash,
          roles: { create: { roleId: studentRole!.id } },
          studentProfile: {
            create: {
              studentCode: `HS26${String(seq++).padStart(4, '0')}`,
              gender: female ? 'FEMALE' : 'MALE',
              birthDate: day(`${2026 - c.grade + 10 - 16}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`),
            },
          },
          enrollments: { create: { classId: c.id, schoolYearId: year.id } },
        },
      });
      list.push({ id: user.id, ability: 5 + rand() * 4 });
    }
    // Học sinh mẫu HSMAU của seed gốc vẫn ở lớp cũ, được tính vào khi nhập điểm.
    const old = await tx.classEnrollment.findMany({ where: { classId: c.id, schoolYearId: year.id, studentId: { notIn: list.map((s) => s.id) } } });
    for (const e of old) list.push({ id: e.studentId, ability: 6.5 });
    studentsByClass.set(c.id, list);
  }

  // ── Định mức tiết khối 11, 12 (chép từ khối 10, là MẪU). ──
  const quotas = await tx.subjectPeriodQuota.findMany({ where: { schoolYearId: year.id, gradeId: grades.get(10)! } });
  const quotaBySubject = new Map(quotas.map((q) => [q.subjectId, q.periodsPerWeek]));
  for (const level of [11, 12]) {
    for (const q of quotas) {
      await tx.subjectPeriodQuota.upsert({
        where: { schoolYearId_gradeId_subjectId: { schoolYearId: year.id, gradeId: grades.get(level)!, subjectId: q.subjectId } },
        update: {},
        create: { schoolYearId: year.id, gradeId: grades.get(level)!, subjectId: q.subjectId, periodsPerWeek: q.periodsPerWeek },
      });
    }
  }

  // ── Phân công cả năm: mỗi lớp–môn một giáo viên, chia vòng trong 3 giáo viên của môn. Giữ phân công đã có. ──
  type Assign = { id: bigint; classId: bigint; subjectId: bigint; teacherId: bigint; periods: number };
  const assignments: Assign[] = [];
  for (const [ci, c] of classes.entries()) {
    for (const s of subjects) {
      const periods = quotaBySubject.get(s.id);
      if (!periods) continue;
      const existing = await tx.teachingAssignment.findFirst({ where: { schoolYearId: year.id, classId: c.id, subjectId: s.id } });
      const a =
        existing ??
        (await tx.teachingAssignment.create({
          data: {
            schoolYearId: year.id,
            classId: c.id,
            subjectId: s.id,
            teacherId: teachersBySubject.get(s.id)![ci % 3]!.id,
            periodsPerWeek: periods,
          },
        }));
      assignments.push({ id: a.id, classId: c.id, subjectId: s.id, teacherId: a.teacherId, periods: a.periodsPerWeek });
    }
  }

  // ── Tiết bận đăng ký của giáo viên (chiều thứ Năm, thứ Sáu của giáo viên số 3 mỗi môn). ──
  const unavailable = new Set<string>();
  for (const list of teachersBySubject.values()) {
    const t = list[2]!;
    for (const [d, p] of [[4, 6], [4, 7], [5, 8], [5, 9]] as const) {
      await tx.teacherUnavailability.create({ data: { teacherId: t.id, day: d, period: p, note: 'Đi học bồi dưỡng chuyên môn' } });
      unavailable.add(`${t.id}:${d}:${p}`);
    }
  }

  // ── Thời khoá biểu HK I: xếp tham lam, ưu tiên buổi sáng, mỗi môn tối đa 1 tiết/ngày (môn 3 tiết được 2). ──
  const fixed = await tx.fixedPeriod.findMany();
  const blocked = (d: number, p: number, grade: number) => fixed.some((f) => f.day === d && f.period === p && (f.gradeLevel === null || f.gradeLevel === grade));
  const SLOTS: [number, number][] = [];
  for (const p of [1, 2, 3, 4, 5, 6, 7, 8, 9]) for (const d of [1, 2, 3, 4, 5, 6]) SLOTS.push([d, p]);
  const classBusy = new Set<string>();
  const teacherBusy = new Set<string>();
  const roomBusy = new Set<string>();
  const perDay = new Map<string, number>();
  const placed: { day: number; period: number; a: Assign; roomId: bigint | null }[] = [];
  const subjectCode = new Map(subjects.map((s) => [s.id, s.code]));
  const gradeOf = new Map(classes.map((c) => [c.id, c.grade]));
  // Môn nhiều tiết xếp trước; trong cùng mức thì xáo để mỗi lớp có thời khoá biểu khác nhau.
  const queue = assignments.flatMap((a) => Array.from({ length: a.periods }, () => a)).sort((x, y) => y.periods - x.periods || rand() - 0.5);
  for (const a of queue) {
    const grade = gradeOf.get(a.classId)!;
    const roomName = SUBJECT_ROOM[subjectCode.get(a.subjectId)!];
    const roomId = roomName ? (rooms.get(roomName) ?? null) : null;
    const maxPerDay = a.periods >= 3 ? 2 : 1;
    const start = Math.floor(rand() * 6);
    const order = SLOTS.map((_, i) => SLOTS[(Math.floor(i / 6) * 6 + ((i % 6) + start) % 6)]!);
    const ok = (d: number, p: number, limit: number) =>
      !blocked(d, p, grade) &&
      !classBusy.has(`${a.classId}:${d}:${p}`) &&
      !teacherBusy.has(`${a.teacherId}:${d}:${p}`) &&
      !unavailable.has(`${a.teacherId}:${d}:${p}`) &&
      !(roomId && roomBusy.has(`${roomId}:${d}:${p}`)) &&
      (perDay.get(`${a.id}:${d}`) ?? 0) < limit;
    const slot = order.find(([d, p]) => ok(d, p, maxPerDay)) ?? order.find(([d, p]) => ok(d, p, 3));
    if (!slot) throw new Error(`Không xếp được tiết cho phân công ${a.id}`);
    const [d, p] = slot;
    classBusy.add(`${a.classId}:${d}:${p}`);
    teacherBusy.add(`${a.teacherId}:${d}:${p}`);
    if (roomId) roomBusy.add(`${roomId}:${d}:${p}`);
    perDay.set(`${a.id}:${d}`, (perDay.get(`${a.id}:${d}`) ?? 0) + 1);
    placed.push({ day: d, period: p, a, roomId });
  }
  const published = await tx.timetable.create({
    data: {
      semesterId: hk1.id,
      name: TIMETABLE_PUBLISHED,
      status: 'PUBLISHED',
      effectiveDate: day('2026-09-07'),
      createdBy: principal.id,
      publishedBy: principal.id,
      publishedAt: vn('2026-09-04', 16),
    },
  });
  const slotRow = (timetableId: bigint) => (s: (typeof placed)[number]) => ({
    timetableId, day: s.day, period: s.period, classId: s.a.classId, assignmentId: s.a.id, teacherId: s.a.teacherId, roomId: s.roomId,
  });
  await tx.timetableSlot.createMany({ data: placed.map(slotRow(published.id)) });
  // Bản nháp xếp dở: bỏ các tiết buổi chiều và toàn bộ lớp 12A3 để thử xếp tay, thử báo trùng.
  const draft = await tx.timetable.create({
    data: { semesterId: hk1.id, name: TIMETABLE_DRAFT, status: 'DRAFT', createdBy: principal.id },
  });
  const class12A3 = classes.find((c) => c.name === '12A3')!.id;
  await tx.timetableSlot.createMany({ data: placed.filter((s) => s.period <= 5 && s.a.classId !== class12A3).map(slotRow(draft.id)) });

  // ── Điểm HK I: thường xuyên (đã công bố), giữa kỳ theo khối (khối 10–11 đã công bố, khối 12 còn nháp, 12A3 nhập dở). ──
  const scoreSubjects = subjects.filter((s) => s.gradingType === 'SCORE');
  const codes: string[] = (await tx.assessment.findMany({ select: { code: true } })).map((a) => a.code);
  const round = (v: number) => Math.min(10, Math.max(0, Math.round(v * 4) / 4));
  const writeScores = async (assessmentId: bigint, classId: bigint, teacherId: bigint, at: Date, skipLast = 0) => {
    const students = studentsByClass.get(classId)!;
    const rows = students.slice(0, students.length - skipLast).map((st, i) => {
      const absent = rand() < 0.03 && i > 0;
      return {
        assessmentId, studentId: st.id, classId,
        value: absent ? null : round(st.ability + (rand() - 0.5) * 3),
        status: absent ? ('ABSENT' as const) : ('GRADED' as const),
        note: absent ? 'Vắng có phép' : null,
        enteredBy: teacherId,
      };
    });
    await tx.score.createMany({ data: rows });
    await tx.scoreHistory.createMany({
      data: rows.map((r) => ({
        assessmentId, studentId: r.studentId, action: 'CREATE', newValue: r.value, newStatus: r.status, note: r.note,
        source: 'GRID', changedBy: teacherId, changedAt: at,
      })),
    });
  };
  const assignmentOf = (classId: bigint, subjectId: bigint) => assignments.find((a) => a.classId === classId && a.subjectId === subjectId)!;

  for (const c of classes) {
    for (const s of scoreSubjects) {
      const a = assignmentOf(c.id, s.id);
      const count = requiredRegularCount(DEFAULT_SCORE_FORMULA, a.periods) - (c.grade === 12 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const testDate = `2026-${k < 2 ? '09' : '10'}-${String(10 + ((k * 9 + s.code.length) % 18)).padStart(2, '0')}`;
        const code = buildAssessmentCode(
          { type: 'THUONG_XUYEN', schoolYearName: year.name, semesterNumber: 1, subjectCode: s.code, scope: { className: c.name } },
          codes,
        );
        codes.push(code);
        const at = vn(testDate, 20);
        const assessment = await tx.assessment.create({
          data: {
            code, type: 'THUONG_XUYEN', semesterId: hk1.id, subjectId: s.id, testDate: day(testDate),
            description: k % 2 === 0 ? 'Kiểm tra miệng' : 'Kiểm tra 15 phút', createdBy: a.teacherId, createdAt: at,
            classes: { create: { classId: c.id, status: 'PUBLISHED', publishedAt: at, publishedBy: a.teacherId } },
          },
        });
        await writeScores(assessment.id, c.id, a.teacherId, at);
      }
    }
  }
  for (const level of [10, 11, 12]) {
    const gradeClasses = classes.filter((c) => c.grade === level);
    for (const s of scoreSubjects) {
      const code = buildAssessmentCode(
        { type: 'GIUA_KY', schoolYearName: year.name, semesterNumber: 1, subjectCode: s.code, scope: { gradeLevel: level } },
        codes,
      );
      codes.push(code);
      const testDate = `2026-10-${String(19 + (s.code.length % 5)).padStart(2, '0')}`;
      const at = vn(testDate, 21);
      const done = level !== 12;
      const assessment = await tx.assessment.create({
        data: {
          code, type: 'GIUA_KY', semesterId: hk1.id, subjectId: s.id, gradeLevel: level, testDate: day(testDate),
          description: `Kiểm tra giữa kỳ I – ${s.name} khối ${level}${DEMO_TAG}`, entryDeadline: vn('2026-11-07', 23, 59), createdBy: principal.id,
          createdAt: vn('2026-10-01', 9),
        },
      });
      for (const c of gradeClasses) {
        const a = assignmentOf(c.id, s.id);
        await tx.assessmentClass.create({
          data: { assessmentId: assessment.id, classId: c.id, status: done ? 'PUBLISHED' : 'DRAFT', publishedAt: done ? at : null, publishedBy: done ? a.teacherId : null },
        });
        // Khối 12: 12A3 chưa nhập Toán, Văn; các lớp khác nhập thiếu 2 em để thấy tiến độ nhập điểm.
        if (c.name === '12A3' && ['TOAN', 'VAN'].includes(s.code)) continue;
        await writeScores(assessment.id, c.id, a.teacherId, at, done ? 0 : 2);
      }
    }
  }
  await tx.scoreDeadline.create({ data: { semesterId: hk1.id, type: 'GIUA_KY', deadline: vn('2026-11-07', 23, 59), updatedBy: principal.id } });
  await tx.scoreDeadline.create({ data: { semesterId: hk1.id, type: 'CUOI_KY', deadline: vn('2027-01-10', 23, 59), updatedBy: principal.id } });

  // ── Thông báo theo đối tượng ──
  const homeroom10A2 = classes.find((c) => c.name === '10A2')!;
  await tx.announcement.createMany({
    data: [
      { title: ANNOUNCEMENTS[0], content: '<p>Kiểm tra cuối kỳ I diễn ra từ <strong>28/12/2026</strong> đến <strong>08/01/2027</strong>. Học sinh xem lịch chi tiết theo khối trên cổng.</p>', audience: 'SCHOOL', pinned: true, createdBy: principal.id, createdAt: daysFromNow(-2, 8) },
      { title: ANNOUNCEMENTS[1], content: '<p>Học sinh khối 10 đăng ký câu lạc bộ STEM với giáo viên chủ nhiệm trước thứ Sáu tuần này.</p>', audience: 'GRADE', gradeLevel: 10, createdBy: principal.id, createdAt: daysFromNow(-1, 10) },
      { title: ANNOUNCEMENTS[2], content: '<p>Buổi tư vấn tuyển sinh dành cho khối 12 vào sáng thứ Bảy tại hội trường.</p>', audience: 'GRADE', gradeLevel: 12, createdBy: principal.id, createdAt: daysFromNow(-3, 9) },
      { title: ANNOUNCEMENTS[3], content: '<p>Các em nộp 2 ảnh thẻ 3x4 cho cô/thầy chủ nhiệm trong tuần này.</p>', audience: 'CLASS', classId: homeroom10A2.id, createdBy: homeroom10A2.homeroom!, createdAt: daysFromNow(0, 7) },
      { title: ANNOUNCEMENTS[4], content: '<p>Toàn thể giáo viên họp hội đồng sư phạm lúc 14h00 thứ Hai đầu tháng 11 tại phòng họp.</p>', audience: 'TEACHERS', createdBy: principal.id, createdAt: daysFromNow(-1, 15) },
    ],
  });

  // ── Sự kiện theo đối tượng ──
  await tx.event.createMany({
    data: [
      { title: EVENTS[0], location: 'Sân trường', startAt: daysFromNow(20, 7), endAt: daysFromNow(20, 11), createdBy: principal.id },
      { title: EVENTS[1], location: 'Bảo tàng Chứng tích chiến tranh', audience: 'GRADE', gradeLevel: 11, startAt: daysFromNow(6, 7), endAt: daysFromNow(6, 11), createdBy: principal.id },
      { title: EVENTS[2], location: 'Phòng học 10A2', audience: 'CLASS', classId: homeroom10A2.id, startAt: daysFromNow(4, 8), endAt: daysFromNow(4, 10), createdBy: principal.id },
      { title: EVENTS[3], location: 'Phòng họp', audience: 'TEACHERS', startAt: daysFromNow(2, 14), endAt: daysFromNow(2, 16), createdBy: principal.id },
    ],
  });

  // ── Công việc giao cho giáo viên ──
  const t = (code: string) => teacherByCode.get(code)!;
  await tx.task.createMany({
    data: [
      { title: TASKS[0], createdBy: principal.id, assigneeId: t('GVTOAN1'), priority: 'HIGH', dueAt: daysFromNow(10, 17) },
      { title: TASKS[1], createdBy: principal.id, assigneeId: t('GVVAN1'), status: 'IN_PROGRESS', dueAt: daysFromNow(3, 17) },
      { title: TASKS[2], createdBy: principal.id, assigneeId: t('GVHOA1'), dueAt: daysFromNow(-1, 17) },
      { title: TASKS[3], createdBy: principal.id, assigneeId: editor.id, dueAt: daysFromNow(21, 17) },
    ],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
