// Dữ liệu mẫu cho môi trường phát triển. Chạy: pnpm --filter api db:seed
// Chạy lại nhiều lần vẫn an toàn (upsert theo khoá duy nhất).
import 'dotenv/config';
import {
  PERMISSIONS,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  ROLES,
  type Permission,
  type Role,
} from '@pvh/shared';
import { hashPassword } from '../src/features/auth/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPgAdapter } from '../src/infrastructure/database/pg-adapter.js';

const prisma = new PrismaClient({
  adapter: createPgAdapter(process.env.DATABASE_URL),
});

const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'system:read': 'Xem trạng thái hệ thống',
  'task:read:all': 'Xem hạn chót của toàn trường',
  'task:read:own': 'Xem hạn chót của bản thân',
  'task:assign': 'Giao việc, đổi hạn',
  'post:create': 'Tạo và xem bài viết trong CMS',
  'post:approve': 'Duyệt bài viết',
  'post:schedule': 'Hẹn giờ / đăng bài',
  'post:unpublish': 'Gỡ / ẩn bài',
  'user:manage': 'Quản lý người dùng và phân quyền',
  'setting:manage': 'Sửa cấu hình hệ thống',
  'academic:manage': 'Quản lý năm học, lớp, môn, phòng bộ môn',
  'student:import': 'Nhập danh sách giáo viên/học sinh từ Excel, phát mã kích hoạt',
  'teaching:read': 'Xem phân công giảng dạy và định mức tiết',
  'teaching:assign': 'Phân công giảng dạy, đặt định mức tiết',
  'timetable:read': 'Xem toàn bộ thời khoá biểu (các phiên bản, theo lớp/giáo viên/phòng)',
  'timetable:manage': 'Xếp, công bố thời khoá biểu, quản lý khung tiết và tiết cố định',
  'score:enter': 'Nhập điểm cho lớp–môn được phân công (giáo viên)',
  'assessment:manage': 'Tạo đợt thi giữa kỳ/cuối kỳ chung, đặt hạn nhập điểm, miễn kiểm tra',
  'score:read:all': 'Xem điểm và tiến độ nhập điểm toàn trường',
};

// Mật khẩu chung cho tài khoản mẫu, chỉ dùng trên máy phát triển.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Pvh@2026';

const USERS: { email: string; fullName: string; role: Role }[] = [
  { email: 'admin@pvh.edu.vn', fullName: 'Quản trị hệ thống', role: 'ADMIN' },
  { email: 'bgh@pvh.edu.vn', fullName: 'Nguyễn Duy Bình', role: 'PRINCIPAL' },
  { email: 'bientap@pvh.edu.vn', fullName: 'Biên tập viên', role: 'EDITOR' },
  { email: 'gv.toan@pvh.edu.vn', fullName: 'Giáo viên Toán', role: 'TEACHER' },
];

const HOUR_MS = 60 * 60 * 1000;

// ───── DỮ LIỆU MẪU học vụ (bước 14): chỉ để phát triển/thử nghiệm, KHÔNG phải dữ liệu thật của nhà trường. ─────
// Mã mẫu có tiền tố "MAU" (học sinh HSMAU01…, giáo viên GVMAU01) để không lẫn với dữ liệu thật.
const SAMPLE_DEPARTMENTS = [
  'Tổ Toán – Tin',
  'Tổ Ngữ văn',
  'Tổ Ngoại ngữ',
  'Tổ Khoa học xã hội',
  'Tổ Khoa học tự nhiên',
  'Tổ Thể dục – Quốc phòng',
];

// Môn học THPT theo chương trình GDPT 2018. `score: false` = chỉ nhận xét.
const SAMPLE_SUBJECTS: { code: string; name: string; department: string; score?: boolean }[] = [
  { code: 'TOAN', name: 'Toán', department: 'Tổ Toán – Tin' },
  { code: 'TIN', name: 'Tin học', department: 'Tổ Toán – Tin' },
  { code: 'VAN', name: 'Ngữ văn', department: 'Tổ Ngữ văn' },
  { code: 'ANH', name: 'Tiếng Anh', department: 'Tổ Ngoại ngữ' },
  { code: 'SU', name: 'Lịch sử', department: 'Tổ Khoa học xã hội' },
  { code: 'DIA', name: 'Địa lí', department: 'Tổ Khoa học xã hội' },
  { code: 'GDKTPL', name: 'Giáo dục kinh tế và pháp luật', department: 'Tổ Khoa học xã hội' },
  { code: 'LI', name: 'Vật lí', department: 'Tổ Khoa học tự nhiên' },
  { code: 'HOA', name: 'Hóa học', department: 'Tổ Khoa học tự nhiên' },
  { code: 'SINH', name: 'Sinh học', department: 'Tổ Khoa học tự nhiên' },
  { code: 'CNGHE', name: 'Công nghệ', department: 'Tổ Khoa học tự nhiên' },
  { code: 'GDTC', name: 'Giáo dục thể chất', department: 'Tổ Thể dục – Quốc phòng' },
  { code: 'GDQPAN', name: 'Giáo dục quốc phòng và an ninh', department: 'Tổ Thể dục – Quốc phòng' },
  { code: 'HDTNHN', name: 'Hoạt động trải nghiệm, hướng nghiệp', department: 'Tổ Khoa học xã hội', score: false },
  { code: 'GDDP', name: 'Nội dung giáo dục của địa phương', department: 'Tổ Khoa học xã hội', score: false },
];

// Định mức tiết/tuần MẪU của khối 10 theo GDPT 2018 (chưa theo tổ hợp, chưa đối chiếu kế hoạch giáo dục của nhà trường).
const SAMPLE_GRADE10_QUOTAS: Record<string, number> = {
  TOAN: 3, VAN: 3, ANH: 3, SU: 2, DIA: 2, GDKTPL: 2, LI: 2, HOA: 2, SINH: 2, TIN: 2, CNGHE: 2, GDTC: 2, GDQPAN: 1, HDTNHN: 3, GDDP: 1,
};

const SAMPLE_ROOMS = [
  { name: 'Phòng Tin học 1', kind: 'Tin học' },
  { name: 'Phòng thí nghiệm Vật lí', kind: 'Thí nghiệm' },
  { name: 'Phòng thí nghiệm Hóa học', kind: 'Thí nghiệm' },
  { name: 'Phòng thí nghiệm Sinh học', kind: 'Thí nghiệm' },
  { name: 'Nhà thi đấu đa năng', kind: 'Thể chất' },
  { name: 'Sân thể chất', kind: 'Thể chất' },
];

const SAMPLE_CLASSES = [
  { name: '10A1', combo: 'Khoa học tự nhiên', homeroom: 'GVMAU01' },
  { name: '10A2', combo: 'Khoa học tự nhiên', homeroom: null },
  { name: '10A3', combo: 'Khoa học xã hội', homeroom: null },
];

const SAMPLE_STUDENTS = [
  { code: 'HSMAU01', fullName: 'Nguyễn Văn Mẫu', className: '10A1', gender: 'MALE' as const },
  { code: 'HSMAU02', fullName: 'Trần Thị Thử', className: '10A1', gender: 'FEMALE' as const },
  { code: 'HSMAU03', fullName: 'Lê Minh Giả', className: '10A2', gender: 'MALE' as const },
];

async function seedRbac() {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSION_DESCRIPTIONS[code] },
      create: { code, description: PERMISSION_DESCRIPTIONS[code] },
    });
  }
  const permissionIds = new Map(
    (await prisma.permission.findMany()).map((p) => [p.code, p.id]),
  );

  for (const code of ROLES) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_NAMES[code] },
      create: { code, name: ROLE_NAMES[code] },
    });
    // Đồng bộ quyền của vai trò theo ROLE_PERMISSIONS trong @pvh/shared.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: ROLE_PERMISSIONS[code].map((p) => ({
          roleId: role.id,
          permissionId: permissionIds.get(p)!,
        })),
      }),
    ]);
  }
}

async function seedUsers() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const ids = new Map<Role, bigint>();
  for (const u of USERS) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: u.role },
    });
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        roles: { create: { roleId: role.id } },
      },
    });
    ids.set(u.role, user.id);
  }
  return ids;
}

async function seedAcademic(users: Map<Role, bigint>) {
  // Năm học hiện hành: chỉ tạo/đặt nếu chưa có năm nào hiện hành (không ghi đè lựa chọn của quản trị).
  const hasCurrent = (await prisma.schoolYear.count({ where: { isCurrent: true } })) > 0;
  const year = await prisma.schoolYear.upsert({
    where: { name: '2026-2027' },
    update: {},
    create: {
      name: '2026-2027',
      startDate: new Date('2026-09-05T00:00:00Z'),
      endDate: new Date('2027-05-31T00:00:00Z'),
      isCurrent: !hasCurrent,
    },
  });
  for (const sem of [
    { number: 1, name: 'Học kỳ I', startDate: '2026-09-05', endDate: '2027-01-17' },
    { number: 2, name: 'Học kỳ II', startDate: '2027-01-18', endDate: '2027-05-31' },
  ]) {
    await prisma.semester.upsert({
      where: { schoolYearId_number: { schoolYearId: year.id, number: sem.number } },
      update: {},
      create: {
        schoolYearId: year.id,
        number: sem.number,
        name: sem.name,
        startDate: new Date(`${sem.startDate}T00:00:00Z`),
        endDate: new Date(`${sem.endDate}T00:00:00Z`),
      },
    });
  }
  for (const level of [10, 11, 12]) {
    await prisma.grade.upsert({ where: { level }, update: {}, create: { level, name: `Khối ${level}` } });
  }

  const departments = new Map<string, bigint>();
  for (const name of SAMPLE_DEPARTMENTS) {
    const d = await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
    departments.set(name, d.id);
  }
  for (const s of SAMPLE_SUBJECTS) {
    await prisma.subject.upsert({
      where: { code: s.code },
      update: {},
      create: {
        code: s.code,
        name: s.name,
        departmentId: departments.get(s.department),
        gradingType: s.score === false ? 'COMMENT' : 'SCORE',
      },
    });
  }
  for (const r of SAMPLE_ROOMS) {
    await prisma.room.upsert({ where: { name: r.name }, update: {}, create: r });
  }

  // Giáo viên mẫu: tài khoản gv.toan@ có hồ sơ giáo viên và chủ nhiệm 10A1.
  const teacherId = users.get('TEACHER')!;
  await prisma.teacherProfile.upsert({
    where: { userId: teacherId },
    update: {},
    create: { userId: teacherId, teacherCode: 'GVMAU01', departmentId: departments.get('Tổ Toán – Tin') },
  });

  const grade10 = await prisma.grade.findUniqueOrThrow({ where: { level: 10 } });
  const classIds = new Map<string, bigint>();
  for (const c of SAMPLE_CLASSES) {
    const cls = await prisma.schoolClass.upsert({
      where: { schoolYearId_name: { schoolYearId: year.id, name: c.name } },
      update: {},
      create: {
        name: c.name,
        gradeId: grade10.id,
        schoolYearId: year.id,
        subjectCombo: c.combo,
        homeroomTeacherId: c.homeroom ? teacherId : null,
      },
    });
    classIds.set(c.name, cls.id);
  }

  // Phân công giảng dạy MẪU (bước 16): định mức khối 10 và một phân công (GVMAU01 dạy Toán 10A1). Cần đối chiếu với
  // kế hoạch giáo dục của nhà trường trước khi dùng thật.
  const grade10Quota = await prisma.grade.findUniqueOrThrow({ where: { level: 10 } });
  for (const [code, periodsPerWeek] of Object.entries(SAMPLE_GRADE10_QUOTAS)) {
    const subject = await prisma.subject.findUnique({ where: { code } });
    if (!subject) continue;
    await prisma.subjectPeriodQuota.upsert({
      where: { schoolYearId_gradeId_subjectId: { schoolYearId: year.id, gradeId: grade10Quota.id, subjectId: subject.id } },
      update: {},
      create: { schoolYearId: year.id, gradeId: grade10Quota.id, subjectId: subject.id, periodsPerWeek },
    });
  }
  const math = await prisma.subject.findUniqueOrThrow({ where: { code: 'TOAN' } });
  const class10A1 = classIds.get('10A1')!;
  if (!(await prisma.teachingAssignment.findFirst({ where: { classId: class10A1, subjectId: math.id } }))) {
    await prisma.teachingAssignment.create({
      data: { schoolYearId: year.id, classId: class10A1, subjectId: math.id, teacherId, periodsPerWeek: 3 },
    });
  }

  // Tiết cố định MẪU (bước 17): Chào cờ thứ Hai tiết 1 (cả trường) và Sinh hoạt lớp thứ Bảy tiết 5. Cần đối chiếu với nhà trường.
  for (const f of [
    { name: 'Chào cờ', kind: 'SCHOOL' as const, day: 1, period: 1 },
    { name: 'Sinh hoạt lớp', kind: 'CLASS_MEETING' as const, day: 6, period: 5 },
  ]) {
    if (!(await prisma.fixedPeriod.findFirst({ where: { day: f.day, period: f.period, gradeLevel: null } }))) {
      await prisma.fixedPeriod.create({ data: f });
    }
  }

  // Học sinh mẫu: đăng nhập bằng mã học sinh (không có email) với mật khẩu mẫu chung.
  const studentRole = await prisma.role.findUniqueOrThrow({ where: { code: 'STUDENT' } });
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const st of SAMPLE_STUDENTS) {
    if (await prisma.studentProfile.findUnique({ where: { studentCode: st.code } })) continue;
    await prisma.user.create({
      data: {
        fullName: st.fullName,
        passwordHash,
        roles: { create: { roleId: studentRole.id } },
        studentProfile: { create: { studentCode: st.code, gender: st.gender } },
        enrollments: { create: { classId: classIds.get(st.className)!, schoolYearId: year.id } },
      },
    });
  }
}

async function seedContent(users: Map<Role, bigint>) {
  const categories = [
    { slug: 'tin-tuc', name: 'Tin tức – Sự kiện', sortOrder: 1 },
    { slug: 'thong-bao', name: 'Thông báo', sortOrder: 2 },
    { slug: 'tuyen-sinh', name: 'Tuyển sinh', sortOrder: 3 },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }
  const category = (slug: string) =>
    prisma.category.findUniqueOrThrow({ where: { slug } }).then((c) => c.id);

  const editor = users.get('EDITOR')!;
  const teacher = users.get('TEACHER')!;
  const tomorrow7am = new Date(Date.now() + 24 * HOUR_MS);
  tomorrow7am.setUTCHours(0, 0, 0, 0); // 07:00 giờ Việt Nam

  const posts = [
    {
      slug: 'le-khai-giang-nam-hoc-2026-2027',
      title: 'Lễ khai giảng năm học 2026–2027',
      summary: 'Năm học đầu tiên của Trường THPT Phan Văn Hớn.',
      content:
        'Sáng 05/9/2026, trường THPT Phan Văn Hớn tổ chức lễ khai giảng năm học đầu tiên với 810 học sinh khối 10.',
      status: 'PUBLISHED' as const,
      publishedAt: new Date('2026-09-05T00:00:00Z'),
      categoryId: await category('tin-tuc'),
      authorId: editor,
      reviewerId: users.get('PRINCIPAL')!,
    },
    {
      slug: 'thong-bao-hop-phu-huynh-dau-nam',
      title: 'Thông báo họp phụ huynh đầu năm',
      content:
        'Nhà trường tổ chức họp phụ huynh học sinh khối 10 vào sáng Chủ nhật.',
      status: 'SCHEDULED' as const,
      publishAt: tomorrow7am,
      categoryId: await category('thong-bao'),
      authorId: editor,
      reviewerId: users.get('PRINCIPAL')!,
    },
    {
      slug: 'ke-hoach-hoat-dong-stem-hoc-ky-i',
      title: 'Kế hoạch hoạt động STEM học kỳ I',
      content: 'Tổ Khoa học tự nhiên triển khai câu lạc bộ STEM cho khối 10.',
      status: 'PENDING_REVIEW' as const,
      categoryId: await category('tin-tuc'),
      authorId: teacher,
    },
  ];
  for (const p of posts) {
    await prisma.post.upsert({
      where: { slug: p.slug },
      update: {},
      create: p,
    });
  }

  await prisma.admissionStat.upsert({
    where: { schoolYear: '2026-2027' },
    update: {},
    create: {
      schoolYear: '2026-2027',
      quota: 810,
      benchmarkNv1: '16.00',
      note: 'Điểm chuẩn công bố ngày 30/6/2026',
    },
  });

  for (const [key, value] of [
    ['school.name', 'Trường THPT Phan Văn Hớn'],
    ['school.address', 'Khu tái định cư 38ha, phường Đông Hưng Thuận, TP.HCM'],
  ]) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
}

// Công việc không có khoá duy nhất nên chỉ tạo khi bảng còn trống.
async function seedTasks(users: Map<Role, bigint>) {
  if ((await prisma.task.count()) > 0) return;
  const principal = users.get('PRINCIPAL')!;
  await prisma.task.createMany({
    data: [
      {
        title: 'Nộp kế hoạch giảng dạy học kỳ I',
        createdBy: principal,
        assigneeId: users.get('TEACHER')!,
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        dueAt: new Date(Date.now() + 20 * HOUR_MS),
      },
      {
        title: 'Duyệt bài kế hoạch STEM',
        createdBy: principal,
        assigneeId: users.get('EDITOR')!,
        status: 'TODO',
        dueAt: new Date(Date.now() - 2 * HOUR_MS),
      },
      {
        title: 'Cập nhật thời khoá biểu tuần sau',
        createdBy: principal,
        assigneeId: users.get('TEACHER')!,
        priority: 'LOW',
        dueAt: new Date(Date.now() + 5 * 24 * HOUR_MS),
      },
    ],
  });
}

// Sự kiện không có khoá duy nhất nên chỉ tạo khi bảng còn trống.
async function seedEvents(users: Map<Role, bigint>) {
  if ((await prisma.event.count()) > 0) return;
  const principal = users.get('PRINCIPAL')!;
  const day = (offset: number, hour: number) => {
    const d = new Date(Date.now() + offset * 24 * HOUR_MS);
    d.setUTCHours(hour - 7, 0, 0, 0); // giờ Việt Nam (UTC+7)
    return d;
  };
  await prisma.event.createMany({
    data: [
      {
        title: 'Họp phụ huynh học sinh khối 10',
        location: 'Hội trường trường THPT Phan Văn Hớn',
        startAt: day(3, 7),
        endAt: day(3, 11),
        createdBy: principal,
      },
      {
        title: 'Ngày hội STEM',
        location: 'Sân trường',
        startAt: day(14, 8),
        endAt: day(14, 16),
        createdBy: principal,
      },
    ],
  });
}

async function main() {
  await seedRbac();
  const users = await seedUsers();
  await seedAcademic(users);
  await seedContent(users);
  await seedTasks(users);
  await seedEvents(users);

  console.log(
    'Đã seed xong. Tài khoản mẫu (mật khẩu chung %s):',
    DEMO_PASSWORD,
  );
  for (const u of USERS) console.log(`  ${u.role.padEnd(9)} ${u.email}`);
  console.log('Dữ liệu học vụ MẪU (không phải dữ liệu thật): giáo viên GVMAU01 (gv.toan@), học sinh HSMAU01–HSMAU03 đăng nhập bằng mã học sinh; định mức tiết khối 10 và phân công Toán 10A1 cũng là MẪU, cần đối chiếu kế hoạch giáo dục của trường.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
