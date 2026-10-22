// Dữ liệu mẫu cho môi trường phát triển. Chạy: pnpm --filter api db:seed
// Chạy lại nhiều lần vẫn an toàn (upsert theo khoá duy nhất).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
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
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
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

async function seedContent(users: Map<Role, bigint>) {
  const categories = [
    { slug: 'tin-tuc', name: 'Tin tức – Sự kiện', sortOrder: 1 },
    { slug: 'thong-bao', name: 'Thông báo', sortOrder: 2 },
    { slug: 'tuyen-sinh', name: 'Tuyển sinh', sortOrder: 3 },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c });
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
      content: 'Nhà trường tổ chức họp phụ huynh học sinh khối 10 vào sáng Chủ nhật.',
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
    await prisma.post.upsert({ where: { slug: p.slug }, update: {}, create: p });
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
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value } });
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

async function main() {
  await seedRbac();
  const users = await seedUsers();
  await seedContent(users);
  await seedTasks(users);

  console.log('Đã seed xong. Tài khoản mẫu (mật khẩu chung %s):', DEMO_PASSWORD);
  for (const u of USERS) console.log(`  ${u.role.padEnd(9)} ${u.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
