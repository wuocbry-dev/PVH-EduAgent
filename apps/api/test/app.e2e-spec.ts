// Cần PostgreSQL đã migrate + seed (pnpm --filter api db:migrate && pnpm --filter api db:seed).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';

// Lấy giá trị cookie từ header Set-Cookie của response.
function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const found = raw?.find((c) => c.startsWith(`${name}=`));
  return found?.split(';')[0].slice(name.length + 1) || undefined;
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  // Agent giữ cookie giữa các request, như trình duyệt.
  async function loginAs(email: string, password = PASSWORD) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password }).expect(200);
    return agent;
  }

  it('/system/health (GET) không cần đăng nhập, CSDL kết nối được', () => {
    return request(app.getHttpServer())
      .get('/system/health')
      .expect(200)
      .expect({ status: 'ok', database: 'ok' });
  });

  it('/posts (GET) chỉ trả bài đã đăng', async () => {
    const res = await request(app.getHttpServer()).get('/posts').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      res.body.every((p: { status: string }) => p.status === 'PUBLISHED'),
    ).toBe(true);
  });

  describe('xác thực (F10)', () => {
    it('không có token → 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      await request(app.getHttpServer()).get('/system/status').expect(401);
    });

    it('token giả mạo → 401', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', 'pvh_access=khong.phai.jwt')
        .expect(401);
    });

    it('header x-dev-user-email bị bỏ qua khi không chạy development', () => {
      return request(app.getHttpServer())
        .get('/auth/me')
        .set('x-dev-user-email', PRINCIPAL)
        .expect(401);
    });

    it('login đúng → đặt cookie httpOnly, /auth/me trả người dùng', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: PRINCIPAL, password: PASSWORD })
        .expect(200);
      expect(res.body.email).toBe(PRINCIPAL);
      expect(res.body.roles).toContain('PRINCIPAL');
      expect(res.body).not.toHaveProperty('passwordHash');

      const cookies = (res.headers['set-cookie'] as unknown as string[]).join(
        '\n',
      );
      expect(cookies).toMatch(/pvh_access=[^;]+;.*HttpOnly/);
      expect(cookies).toMatch(/pvh_refresh=[^;]+;.*HttpOnly/);
      expect(cookies).toMatch(/SameSite=Lax/);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `pvh_access=${cookieValue(res, 'pvh_access')}`)
        .expect(200);
      expect(me.body.email).toBe(PRINCIPAL);
    });

    it('login sai mật khẩu → 401, email không tồn tại → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: PRINCIPAL, password: 'sai-mat-khau' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'khong-co@pvh.edu.vn', password: PASSWORD })
        .expect(401);
    });

    it('sai mật khẩu 5 lần → bị chặn tạm thời (429), kể cả khi nhập đúng', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: EDITOR, password: 'sai-mat-khau' })
          .expect(401);
      }
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EDITOR, password: PASSWORD })
        .expect(429);
    });

    it('refresh cấp token mới và thu hồi refresh token cũ', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEACHER, password: PASSWORD })
        .expect(200);
      const oldRefresh = cookieValue(login, 'pvh_refresh');

      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `pvh_refresh=${oldRefresh}`)
        .expect(200);
      expect(refreshed.body.email).toBe(TEACHER);
      const newRefresh = cookieValue(refreshed, 'pvh_refresh');
      expect(newRefresh).toBeDefined();
      expect(newRefresh).not.toBe(oldRefresh);
      expect(cookieValue(refreshed, 'pvh_access')).toBeDefined();

      // Dùng lại token cũ → từ chối.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `pvh_refresh=${oldRefresh}`)
        .expect(401);
    });

    it('dùng lại refresh token cũ sau thời gian ân hạn → thu hồi mọi phiên (nghi bị lộ)', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEACHER, password: PASSWORD })
        .expect(200);
      const oldRefresh = cookieValue(login, 'pvh_refresh');
      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `pvh_refresh=${oldRefresh}`)
        .expect(200);
      const newRefresh = cookieValue(refreshed, 'pvh_refresh');

      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60_000 });
      try {
        await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', `pvh_refresh=${oldRefresh}`)
          .expect(401);
      } finally {
        vi.useRealTimers();
      }
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', `pvh_refresh=${newRefresh}`)
        .expect(401);
    });

    it('refresh không có cookie → 401', () => {
      return request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('logout thu hồi refresh token', async () => {
      const agent = await loginAs(TEACHER);
      await agent.post('/auth/logout').expect(204);
      await agent.get('/auth/me').expect(401);
      await agent.post('/auth/refresh').expect(401);
    });

    it('đổi mật khẩu: sai mật khẩu hiện tại → 400, đúng → đăng nhập bằng mật khẩu mới', async () => {
      const agent = await loginAs(TEACHER);
      await agent
        .post('/auth/change-password')
        .send({ currentPassword: 'sai-mat-khau', newPassword: 'MatKhauMoi@1' })
        .expect(400);
      await agent
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'MatKhauMoi@1' })
        .expect(204);
      // Phiên hiện tại vẫn dùng được (đã cấp cookie mới).
      await agent.get('/auth/me').expect(200);

      // Trả lại mật khẩu seed cho các test khác.
      const again = await loginAs(TEACHER, 'MatKhauMoi@1');
      await again
        .post('/auth/change-password')
        .send({ currentPassword: 'MatKhauMoi@1', newPassword: PASSWORD })
        .expect(204);
    });

    it('quên mật khẩu luôn trả 202, reset với token sai → 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'khong-co@pvh.edu.vn' })
        .expect(202);
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'token-gia', newPassword: 'MatKhauMoi@1' })
        .expect(400);
    });
  });

  describe('phân quyền sau khi đăng nhập', () => {
    it('/tasks/deadlines (GET) giáo viên chỉ thấy việc của mình', async () => {
      const agent = await loginAs(TEACHER);
      const res = await agent.get('/tasks/deadlines').expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(
        res.body.every(
          (t: { assigneeName: string }) => t.assigneeName === 'Giáo viên Toán',
        ),
      ).toBe(true);
    });

    it('/system/status (GET) giáo viên bị từ chối (đọc quyền từ role_permissions)', async () => {
      const agent = await loginAs(TEACHER);
      await agent.get('/system/status').expect(403);
    });

    it('/system/status (GET) ban giám hiệu được phép', async () => {
      const agent = await loginAs(PRINCIPAL);
      await agent.get('/system/status').expect(200);
    });
  });

  it('thời gian ứng dụng ghi vào timestamptz không bị lệch múi giờ', async () => {
    await loginAs(PRINCIPAL); // ghi một dòng audit_logs (created_at do Prisma gửi)
    const [row] = await app.get(PrismaService).$queryRaw<
      { lech_giay: number }[]
    >`SELECT abs(extract(epoch FROM now() - created_at))::float AS lech_giay
      FROM audit_logs ORDER BY id DESC LIMIT 1`;
    expect(row.lech_giay).toBeLessThan(60);
  });

  afterEach(async () => {
    await app.close();
  });
});
