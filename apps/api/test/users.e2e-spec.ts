// F11 – quản lý người dùng & phân quyền. Cần PostgreSQL đã migrate + seed.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';

describe('Người dùng & phân quyền (F11, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  // Email riêng cho mỗi lần chạy để test chạy lại được trên cùng CSDL.
  const run = Date.now();
  const newEmail = (tag: string) => `f11.${tag}.${run}@pvh.edu.vn`;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  // Dọn tài khoản `f11.*` do chính lần chạy này tạo (cùng nhật ký liên quan) để e2e không để lại dữ liệu rác.
  afterEach(async () => {
    const mine = await prisma.user.findMany({
      where: { email: { startsWith: 'f11.', endsWith: `.${run}@pvh.edu.vn` } },
      select: { id: true },
    });
    const ids = mine.map((u) => u.id);
    await prisma.auditLog.deleteMany({
      where: { OR: [{ userId: { in: ids } }, { targetType: 'user', targetId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  async function loginAs(email: string, password = PASSWORD) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password }).expect(200);
    return agent;
  }

  async function createUser(
    admin: ReturnType<typeof request.agent>,
    tag: string,
    roles: string[] = ['TEACHER'],
  ) {
    const res = await admin
      .post('/users')
      .send({
        email: newEmail(tag),
        fullName: `Người dùng ${tag}`,
        password: PASSWORD,
        roles,
      })
      .expect(201);
    return res.body as { id: string; email: string; status: string };
  }

  async function auditCount(action: string, targetId: string) {
    return prisma.auditLog.count({
      where: { action, targetId: BigInt(targetId) },
    });
  }

  describe('không đủ quyền', () => {
    it('chưa đăng nhập → 401', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
      await request(app.getHttpServer()).get('/roles').expect(401);
    });

    it.each([
      ['ban giám hiệu', PRINCIPAL],
      ['giáo viên', TEACHER],
    ])('%s bị từ chối (403) ở mọi API quản lý', async (_name, email) => {
      const agent = await loginAs(email);
      await agent.get('/users').expect(403);
      await agent
        .post('/users')
        .send({
          email: newEmail('trai-phep'),
          fullName: 'Trái phép',
          password: PASSWORD,
          roles: ['TEACHER'],
        })
        .expect(403);
      await agent.patch('/users/1').send({ fullName: 'Đổi tên' }).expect(403);
      await agent.patch('/users/1/status').send({ status: 'LOCKED' }).expect(403);
      await agent
        .post('/users/1/reset-password')
        .send({ newPassword: 'MatKhauMoi@1' })
        .expect(403);
      await agent.get('/roles').expect(403);
      await agent
        .put('/roles/STUDENT/permissions')
        .send({ permissions: ['post:create'] })
        .expect(403);
    });

    it('không ai ngoài ADMIN có quyền user:manage', async () => {
      const principal = await (await loginAs(PRINCIPAL)).get('/auth/me');
      expect(principal.body.permissions).not.toContain('user:manage');
      const admin = await (await loginAs(ADMIN)).get('/auth/me');
      expect(admin.body.permissions).toContain('user:manage');
    });
  });

  describe('người dùng', () => {
    it('ADMIN liệt kê có phân trang, tìm theo tên/email, không lộ mật khẩu', async () => {
      const admin = await loginAs(ADMIN);
      const created = await createUser(admin, 'tim-kiem');

      const byEmail = await admin
        .get('/users')
        .query({ q: `F11.TIM-KIEM.${run}` })
        .expect(200);
      expect(byEmail.body.total).toBe(1);
      expect(byEmail.body.items[0].id).toBe(created.id);
      expect(byEmail.body.items[0]).not.toHaveProperty('passwordHash');

      const page = await admin.get('/users').query({ pageSize: 2 }).expect(200);
      expect(page.body.items.length).toBeLessThanOrEqual(2);
      expect(page.body.pageSize).toBe(2);
      expect(page.body.total).toBeGreaterThanOrEqual(4);

      await admin.get('/users').query({ pageSize: 1000 }).expect(400);
    });

    it('tạo → sửa (đổi vai trò) → người mới đăng nhập được; mỗi thao tác có audit log', async () => {
      const admin = await loginAs(ADMIN);
      const created = await createUser(admin, 'tao-sua');
      expect(await auditCount('user.create', created.id)).toBe(1);

      await admin
        .post('/users')
        .send({
          email: created.email,
          fullName: 'Trùng email',
          password: PASSWORD,
          roles: ['TEACHER'],
        })
        .expect(409);

      const updated = await admin
        .patch(`/users/${created.id}`)
        .send({ fullName: 'Tên mới', phone: '0901234567', roles: ['EDITOR', 'TEACHER'] })
        .expect(200);
      expect(updated.body.fullName).toBe('Tên mới');
      expect(updated.body.roles.sort()).toEqual(['EDITOR', 'TEACHER']);
      expect(await auditCount('user.update', created.id)).toBe(1);

      const me = await (await loginAs(created.email)).get('/auth/me').expect(200);
      expect(me.body.permissions).toContain('post:approve');

      await admin
        .patch(`/users/${created.id}`)
        .send({ roles: ['KHONG-CO'] })
        .expect(400);
      await admin.patch('/users/999999999').send({ fullName: 'X' }).expect(404);
      await admin.patch('/users/abc').send({ fullName: 'X' }).expect(400);
    });

    it('khóa tài khoản: không đăng nhập được, phiên đang mở bị vô hiệu; mở khóa thì dùng lại được', async () => {
      const admin = await loginAs(ADMIN);
      const created = await createUser(admin, 'khoa');
      const session = await loginAs(created.email);
      await session.get('/auth/me').expect(200);

      const locked = await admin
        .patch(`/users/${created.id}/status`)
        .send({ status: 'LOCKED' })
        .expect(200);
      expect(locked.body.status).toBe('LOCKED');
      expect(await auditCount('user.lock', created.id)).toBe(1);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: created.email, password: PASSWORD })
        .expect(401);
      await session.get('/auth/me').expect(401);
      await session.post('/auth/refresh').expect(401);

      await admin
        .patch(`/users/${created.id}/status`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(await auditCount('user.unlock', created.id)).toBe(1);
      await (await loginAs(created.email)).get('/auth/me').expect(200);
    });

    it('không cho tự khóa chính mình', async () => {
      const admin = await loginAs(ADMIN);
      const me = await admin.get('/auth/me').expect(200);
      await admin
        .patch(`/users/${me.body.id}/status`)
        .send({ status: 'LOCKED' })
        .expect(400);
      await admin.get('/auth/me').expect(200);
    });

    it('không cho khóa hoặc gỡ vai trò của ADMIN cuối cùng', async () => {
      // Chỉ còn một ADMIN hoạt động: khóa các ADMIN khác (nếu có) bằng cách giả lập qua CSDL.
      const admin = await loginAs(ADMIN);
      const helper = await createUser(admin, 'admin-phu', ['ADMIN']);
      const helperSession = await loginAs(helper.email);
      const adminId = (await admin.get('/auth/me')).body.id as string;
      const otherAdmins = await prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          roles: { some: { role: { code: 'ADMIN' } } },
          id: { notIn: [BigInt(adminId), BigInt(helper.id)] },
        },
        select: { id: true },
      });
      await prisma.user.updateMany({
        where: { id: { in: otherAdmins.map((u) => u.id) } },
        data: { status: 'LOCKED' },
      });
      try {
        // Hai ADMIN: khóa ADMIN phụ được.
        await admin
          .patch(`/users/${helper.id}/status`)
          .send({ status: 'LOCKED' })
          .expect(200);
        // Còn ADMIN phụ bị khóa → admin chính là người cuối cùng; ADMIN phụ không hoạt động nên không thao tác được.
        await helperSession.get('/users').expect(401);
        await admin
          .patch(`/users/${adminId}`)
          .send({ roles: ['TEACHER'] })
          .expect(400);
        const still = await admin.get('/auth/me').expect(200);
        expect(still.body.roles).toContain('ADMIN');
      } finally {
        await prisma.user.updateMany({
          where: { id: { in: otherAdmins.map((u) => u.id) } },
          data: { status: 'ACTIVE' },
        });
      }
    });

    it('đặt lại mật khẩu: mật khẩu cũ hết hiệu lực, phiên cũ bị đăng xuất', async () => {
      const admin = await loginAs(ADMIN);
      const created = await createUser(admin, 'dat-lai');
      const session = await loginAs(created.email);

      await admin
        .post(`/users/${created.id}/reset-password`)
        .send({ newPassword: 'ngan' })
        .expect(400);
      await admin
        .post(`/users/${created.id}/reset-password`)
        .send({ newPassword: 'MatKhauMoi@1' })
        .expect(204);
      expect(await auditCount('user.reset_password', created.id)).toBe(1);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: created.email, password: PASSWORD })
        .expect(401);
      await loginAs(created.email, 'MatKhauMoi@1');
      await session.post('/auth/refresh').expect(401);
    });
  });

  describe('vai trò & quyền', () => {
    it('ADMIN xem ma trận vai trò × quyền', async () => {
      const admin = await loginAs(ADMIN);
      const res = await admin.get('/roles').expect(200);
      expect(res.body.roles.map((r: { code: string }) => r.code)).toEqual(
        expect.arrayContaining(['ADMIN', 'PRINCIPAL', 'EDITOR', 'TEACHER', 'STUDENT']),
      );
      expect(res.body.permissions.map((p: { code: string }) => p.code)).toContain(
        'user:manage',
      );
    });

    it('sửa quyền của vai trò có hiệu lực ngay và ghi audit log', async () => {
      const admin = await loginAs(ADMIN);
      const created = await createUser(admin, 'hoc-sinh', ['STUDENT']);
      const student = await loginAs(created.email);
      await student.get('/posts/manage').expect(403);

      try {
        const updated = await admin
          .put('/roles/STUDENT/permissions')
          .send({ permissions: ['post:create'] })
          .expect(200);
        expect(updated.body.permissions).toEqual(['post:create']);
        await student.get('/posts/manage').expect(200);

        const role = await prisma.role.findUniqueOrThrow({
          where: { code: 'STUDENT' },
        });
        expect(
          await prisma.auditLog.count({
            where: {
              action: 'role.update_permissions',
              targetId: role.id,
              createdAt: { gte: new Date(run) },
            },
          }),
        ).toBeGreaterThanOrEqual(1);
      } finally {
        await admin
          .put('/roles/STUDENT/permissions')
          .send({ permissions: [] })
          .expect(200);
      }
      await student.get('/posts/manage').expect(403);
    });

    it('từ chối quyền/vai trò không tồn tại và việc gỡ user:manage khỏi ADMIN', async () => {
      const admin = await loginAs(ADMIN);
      await admin
        .put('/roles/STUDENT/permissions')
        .send({ permissions: ['quyen:khong-co'] })
        .expect(400);
      await admin
        .put('/roles/KHONG-CO/permissions')
        .send({ permissions: [] })
        .expect(400);
      await admin
        .put('/roles/ADMIN/permissions')
        .send({ permissions: ['system:read'] })
        .expect(400);
      await admin.get('/users').expect(200);
    });
  });
});
