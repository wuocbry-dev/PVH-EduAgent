// Dọn tài khoản rác do e2e cũ (bước 11–13) để lại: email dạng `f11.<nhãn>.<số>@pvh.edu.vn` (test/users.e2e-spec.ts).
// Chạy một lần:
//   pnpm --filter api db:cleanup-test --dry-run   (chỉ in số lượng, không xoá gì)
//   pnpm --filter api db:cleanup-test             (xoá thật)
// Chỉ đụng đúng mẫu email trên; tuyệt đối không xoá tài khoản seed hay tài khoản khác. Tài khoản nào đã có dữ liệu
// nghiệp vụ gắn với nó (bài viết, công việc, sự kiện, tệp tải lên…) thì được giữ lại và liệt kê, không xoá.
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPgAdapter } from '../src/infrastructure/database/pg-adapter.js';

const dryRun = process.argv.includes('--dry-run');
const PATTERN = /^f11\.[a-z0-9-]+\.\d+@pvh\.edu\.vn$/;
const SEED_EMAILS = new Set(['admin@pvh.edu.vn', 'bgh@pvh.edu.vn', 'bientap@pvh.edu.vn', 'gv.toan@pvh.edu.vn']);

const prisma = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });

try {
  const candidates = await prisma.user.findMany({
    where: { email: { startsWith: 'f11.', endsWith: '@pvh.edu.vn' } },
    select: {
      id: true,
      email: true,
      _count: {
        select: {
          authoredPosts: true,
          reviewedPosts: true,
          createdTasks: true,
          assignedTasks: true,
          events: true,
          media: true,
          homeroomClasses: true,
        },
      },
    },
  });
  // Lọc lại bằng regex chặt và loại tài khoản seed (phòng khi mẫu LIKE khớp rộng hơn dự định).
  const matched = candidates.filter((u) => u.email && PATTERN.test(u.email) && !SEED_EMAILS.has(u.email));
  const blocked = matched.filter((u) => Object.values(u._count).some((n) => n > 0));
  const deletable = matched.filter((u) => !blocked.includes(u));
  const ids = deletable.map((u) => u.id);

  const [audits, tokens] = await Promise.all([
    prisma.auditLog.count({ where: { OR: [{ userId: { in: ids } }, { targetType: 'user', targetId: { in: ids } }] } }),
    prisma.refreshToken.count({ where: { userId: { in: ids } } }),
  ]);

  console.log(dryRun ? '== CHẠY THỬ (--dry-run): không xoá gì ==' : '== XOÁ THẬT ==');
  console.log(`Tài khoản khớp mẫu f11.*: ${matched.length}`);
  console.log(`  sẽ xoá: ${deletable.length} (kèm ${audits} dòng nhật ký, ${tokens} refresh token)`);
  console.log(`  giữ lại vì có dữ liệu gắn với tài khoản: ${blocked.length}`);
  for (const u of blocked) console.log(`    ${u.email}`, u._count);

  if (!dryRun && ids.length > 0) {
    const [, , result] = await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { targetType: 'user', targetId: { in: ids } }] } }),
      prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    console.log(`Đã xoá ${result.count} tài khoản.`);
  }
} finally {
  await prisma.$disconnect();
}
