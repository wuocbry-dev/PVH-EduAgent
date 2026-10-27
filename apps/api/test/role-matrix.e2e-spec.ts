// Bước 23 – ma trận quyền: gọi MỌI endpoint trong ROUTES bằng MỖI vai trò và khẳng định đúng kết quả.
//   - vai trò không đủ quyền → đúng 403 (kiểm tra dữ liệu vào bị tắt cho lượt này để chắc chắn service tự chặn
//     trước khi đọc input; chặn nhờ lỗi 400 của zod thì không được tính);
//   - vai trò đủ quyền → không bao giờ 401 hay 403 "thiếu quyền" (403 vì ngoài phạm vi lớp/môn vẫn được);
//   - 'student' → chỉ học sinh; 'self' → mọi vai trò đã đăng nhập (phạm vi do service lọc);
//   - không ô nào trả 5xx.
// An toàn dữ liệu: chạy bằng tài khoản tạm của từng vai trò (xoá khi xong) và id KHÔNG tồn tại, nên không lượt gọi nào
// sửa được dữ liệu thật; vai trò có quyền luôn đi qua zod như bình thường (body rỗng → 400, không ghi gì).
// Phạm vi trong cùng vai trò (chủ nhiệm, phân công, đối tượng xem, chủ sở hữu) có test riêng ở từng feature (xem docs/04).
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLE_PERMISSIONS, ROLES, type Permission, type Role } from '@pvh/shared';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/bootstrap/configure-app.js';
import { ZodValidationPipe } from './../src/common/pipes/zod-validation.pipe.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { resetLimits } from './reset-limits.js';
import { ROUTES, type Access } from './routes.js';

const PASSWORD = 'Pvh@2026';
const TAG = `e23-${Date.now()}`;
const emailOf = (role: Role) => `${TAG}.${role.toLowerCase()}@test.pvh.edu.vn`;
// Id không tồn tại cho mọi tham số đường dẫn (số, slug, mã vai trò, mã xem trước…).
const MISSING_ID = '987654321098';
const PERMISSION_DENIED = /không có quyền [a-z]+:/;

// Vai trò có đủ quyền theo bảng? Mỗi phần tử phải thoả; 'a|b' = một trong các quyền; 'role:X' = đúng vai trò X.
function allowed(access: Exclude<Access, 'public'>, role: Role): boolean {
  if (access === 'self') return true;
  if (access === 'student') return role === 'STUDENT';
  return access.every((need) =>
    need.split('|').some((p) => (p.startsWith('role:') ? p.slice(5) === role : ROLE_PERMISSIONS[role].includes(p as Permission))),
  );
}

describe('Ma trận vai trò × endpoint (bước 23, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let skipValidation = false;
  const agents = new Map<Role, ReturnType<typeof request.agent>>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, { accessLog: false });
    await app.init();
    await resetLimits(app, ['login']);
    prisma = app.get(PrismaService);

    const original = Object.getOwnPropertyDescriptor(ZodValidationPipe.prototype, 'transform')!.value as (
      this: ZodValidationPipe<never>,
      value: unknown,
    ) => never;
    vi.spyOn(ZodValidationPipe.prototype, 'transform').mockImplementation(function (this: ZodValidationPipe<never>, value: unknown) {
      return skipValidation ? (value as never) : original.call(this, value);
    });

    const seed = await prisma.user.findUniqueOrThrow({ where: { email: 'gv.toan@pvh.edu.vn' } });
    for (const role of ROLES) {
      const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
      await prisma.user.create({
        data: { email: emailOf(role), fullName: `${TAG} ${role}`, passwordHash: seed.passwordHash, roles: { create: { roleId: r.id } } },
      });
      const agent = request.agent(app.getHttpServer());
      await agent.post('/auth/login').send({ email: emailOf(role), password: PASSWORD }).expect(200);
      agents.set(role, agent);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const users = await prisma.user.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  async function call(role: Role, key: string) {
    const [method, path] = key.split(' ');
    const agent = agents.get(role) as unknown as Record<string, (p: string) => request.Test>;
    return agent[method.toLowerCase()](path.replace(/:\w+/g, MISSING_ID)).send({});
  }

  it('bảng có đủ 6 vai trò và mỗi quyền trong bảng đều là quyền thật (hoặc role:<vai trò>)', () => {
    expect([...ROLES].sort()).toEqual(['ADMIN', 'EDITOR', 'LIBRARIAN', 'PRINCIPAL', 'STUDENT', 'TEACHER']);
    for (const [key, access] of Object.entries(ROUTES)) {
      if (!Array.isArray(access)) continue;
      for (const p of access.flatMap((a) => a.split('|'))) {
        const ok = p.startsWith('role:') ? ROLES.includes(p.slice(5) as Role) : Object.values(ROLE_PERMISSIONS).some((ps) => ps.includes(p as Permission)) || p === 'student:import';
        expect(ok, `${key}: ${p}`).toBe(true);
      }
    }
  });

  for (const role of ROLES) {
    it(`${role}: mọi endpoint trả đúng 403 / không 403 theo bảng quyền, không 5xx`, async () => {
      const problems: string[] = [];
      for (const [key, access] of Object.entries(ROUTES)) {
        if (access === 'public') continue;
        const expectAllowed = allowed(access, role);
        skipValidation = !expectAllowed;
        const res = await call(role, key);
        skipValidation = false;
        const message = String(res.body?.message ?? '');
        if (res.status >= 500) problems.push(`${key} → ${res.status} (lỗi máy chủ)`);
        else if (res.status === 401) problems.push(`${key} → 401 (phiên của tài khoản tạm phải còn hiệu lực)`);
        else if (expectAllowed && res.status === 403 && (access === 'student' || PERMISSION_DENIED.test(message)))
          problems.push(`${key} → 403 dù có quyền: ${message}`);
        else if (!expectAllowed && res.status !== 403) problems.push(`${key} → ${res.status}, phải là 403`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    }, 120_000);
  }
});
