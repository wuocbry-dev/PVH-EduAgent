// Bước 10 – rà soát bảo mật: bảng endpoint → quyền, guard, header, CORS/CSRF, giới hạn body, định dạng lỗi,
// dữ liệu học sinh với agent. Cần PostgreSQL (đã seed) và Redis.
import { Logger } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/bootstrap/configure-app.js';
import { IS_PUBLIC_KEY } from './../src/common/decorators/public.decorator.js';
import { AGENT_TOOL_PROVIDERS, type AgentToolProvider } from './../src/features/agent/agent-tool.js';
import { buildSystemPrompt } from './../src/features/agent/prompts/system-prompt.js';
import { SystemService } from './../src/features/system/system.service.js';
import { UsersService } from './../src/features/users/users.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { resetLimits } from './reset-limits.js';

const PASSWORD = 'Pvh@2026';
const SEED_TEACHER = 'gv.toan@pvh.edu.vn';
const TAG = `SEC-${Date.now()}`.toLowerCase();
const NOBODY = `${TAG}.hs@test.pvh.edu.vn`; // vai trò STUDENT: không có quyền nào
const EVIL = 'https://evil.example';

type Access = 'public' | 'self' | string[];

// Bảng endpoint → quyền (nguồn duy nhất; docs/04-bang-endpoint-quyen.md được viết từ bảng này).
//   public  = không cần đăng nhập (đã có biện pháp riêng: rate limit, secret, chỉ dữ liệu đã công bố)
//   self    = cần đăng nhập, chỉ thao tác trên dữ liệu của chính mình (hoặc từng thao tác tự kiểm quyền trong tool)
//   [..]    = cần ít nhất các quyền này (service gọi assertPermission/can; một số còn kiểm tra quyền sở hữu)
const ROUTES: Record<string, Access> = {
  'POST /auth/login': 'public',
  'POST /auth/refresh': 'public',
  'POST /auth/logout': 'public',
  'GET /auth/me': 'self',
  'POST /auth/change-password': 'self',
  'POST /auth/forgot-password': 'public',
  'POST /auth/reset-password': 'public',

  'POST /agent/chat': 'self',
  'GET /agent/actions': 'self',
  'POST /agent/actions/:id/confirm': 'self',
  'POST /agent/actions/:id/cancel': 'self',

  'GET /audit-logs': ['system:read'],
  'GET /audit-logs/filters': ['system:read'],

  'GET /categories': 'public',
  'POST /categories': ['post:approve'],
  'PATCH /categories/:id': ['post:approve'],
  'DELETE /categories/:id': ['post:approve'],

  'POST /contacts': 'public',
  'GET /contacts': ['post:approve'],
  'PATCH /contacts/:id/status': ['post:approve'],

  'GET /events': 'public',
  'POST /events': ['post:approve'],
  'PATCH /events/:id': ['post:approve'],
  'DELETE /events/:id': ['post:approve'],

  'POST /media/presign': ['post:create'],
  'POST /media/:id/complete': ['post:create'],
  'GET /media': ['post:create'],
  'DELETE /media/:id': ['post:create'],
  'PUT /media/local-upload/:id': 'public', // xác thực bằng token HMAC trong query
  'GET /media/files/:name': 'public',

  'GET /posts/manage': ['post:create'],
  'GET /posts/manage/:id': ['post:create'],
  'POST /posts': ['post:create'],
  'PATCH /posts/:id': ['post:create'],
  'POST /posts/:id/submit': ['post:create'],
  'POST /posts/:id/approve': ['post:approve', 'post:schedule'],
  'POST /posts/:id/reject': ['post:approve'],
  'POST /posts/:id/reschedule': ['post:schedule'],
  'POST /posts/:id/publish': ['post:schedule'],
  'POST /posts/:id/cancel-schedule': ['post:schedule'],
  'POST /posts/:id/unpublish': ['post:unpublish'],
  'POST /posts/:id/restore': ['post:unpublish'],
  'DELETE /posts/:id': ['post:create'],

  'GET /public/posts': 'public',
  'GET /public/posts/:slug': 'public',
  'POST /public/posts/:slug/view': 'public',
  'GET /public/admission': 'public',
  'GET /public/settings': 'public',
  'GET /public/gallery': 'public',

  'GET /roles': ['user:manage'],
  'PUT /roles/:code/permissions': ['user:manage'],

  'GET /settings': ['system:read'],
  'PATCH /settings': ['setting:manage'],

  'GET /system/health': 'public',
  'GET /system/status': ['system:read'],
  'GET /system/dashboard': 'self',

  'GET /tasks/deadlines': ['task:read:all', 'task:read:own'],
  'GET /tasks/assignees': ['task:assign', 'task:read:all'],
  'GET /tasks': ['task:read:all', 'task:read:own'],
  'GET /tasks/:id': ['task:read:all', 'task:read:own'],
  'POST /tasks': ['task:assign'],
  'PATCH /tasks/:id': ['task:assign'],
  'PATCH /tasks/:id/status': ['task:assign'],
  'DELETE /tasks/:id': ['task:assign'],

  'POST /telegram/webhook': 'public',
  'GET /telegram/link': 'self',
  'POST /telegram/link-code': 'self',
  'DELETE /telegram/link': 'self',

  'GET /users': ['user:manage'],
  'POST /users': ['user:manage'],
  'PATCH /users/:id': ['user:manage'],
  'PATCH /users/:id/status': ['user:manage'],
  'POST /users/:id/reset-password': ['user:manage'],
};

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];
const joinPath = (...parts: unknown[]) =>
  '/' +
  parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter((p): p is string => typeof p === 'string' && p !== '' && p !== '/')
    .map((p) => p.replace(/^\/|\/$/g, ''))
    .join('/');

describe('Rà soát bảo mật (bước 10, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let webOrigin: string;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, { accessLog: false });
    await app.init();
    await resetLimits(app, ['contact', 'login']);
    prisma = app.get(PrismaService);
    webOrigin = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3000').origin;
    http = request(app.getHttpServer());

    const seed = await prisma.user.findUniqueOrThrow({ where: { email: SEED_TEACHER } });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'STUDENT' } });
    await prisma.user.create({
      data: { email: NOBODY, fullName: `${TAG} học sinh`, passwordHash: seed.passwordHash, roles: { create: { roleId: role.id } } },
    });
  });

  afterAll(async () => {
    await app.close();
    const { PrismaClient } = await import('./../src/generated/prisma/client.js');
    const { createPgAdapter } = await import('./../src/infrastructure/database/pg-adapter.js');
    const db = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
    try {
      const user = await db.user.findUnique({ where: { email: NOBODY } });
      if (user) {
        await db.auditLog.deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      }
      await db.contact.deleteMany({ where: { subject: { startsWith: TAG } } });
      await db.auditLog.deleteMany({ where: { action: 'auth.login', payload: { path: ['params', 'email'], equals: NOBODY } } });
    } finally {
      await db.$disconnect();
    }
  });

  async function login(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }

  // Các route thực tế của ứng dụng, đọc từ metadata của controller.
  function discoverRoutes(): Map<string, { isPublic: boolean }> {
    const found = new Map<string, { isPublic: boolean }>();
    const controllers = [...app.get(ModulesContainer, { strict: false }).values()].flatMap((m) => [...m.controllers.values()]);
    for (const wrapper of controllers) {
      const cls = wrapper.metatype as (new (...a: never[]) => object) | null;
      if (!cls) continue;
      const base = Reflect.getMetadata('path', cls) as unknown;
      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, cls) === true;
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = (cls.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata('method', handler) as number | undefined;
        if (method === undefined) continue;
        const key = `${METHODS[method]} ${joinPath(base, Reflect.getMetadata('path', handler))}`;
        found.set(key, { isPublic: classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true });
      }
    }
    return found;
  }

  const concretePath = (path: string) => path.replace(/:\w+/g, '1');
  const call = (key: string, agent: { [m: string]: unknown } | null) => {
    const [method, path] = key.split(' ');
    const target = (agent ?? http) as unknown as Record<string, (p: string) => request.Test>;
    return target[method.toLowerCase()](concretePath(path)).send({});
  };

  describe('bảng endpoint → quyền', () => {
    it('mọi endpoint của ứng dụng đều có trong bảng (và ngược lại); route công khai khớp danh sách @Public()', () => {
      const routes = discoverRoutes();
      expect([...routes.keys()].sort()).toEqual(Object.keys(ROUTES).sort());
      for (const [key, { isPublic }] of routes) {
        expect(isPublic, `${key}: @Public() phải khớp với bảng`).toBe(ROUTES[key] === 'public');
      }
    });

    it('chưa đăng nhập: mọi endpoint không công khai trả 401', async () => {
      const protectedRoutes = Object.entries(ROUTES).filter(([, access]) => access !== 'public');
      expect(protectedRoutes.length).toBeGreaterThan(40);
      for (const [key] of protectedRoutes) {
        const res = await call(key, null);
        expect(res.status, `${key} → ${res.status}`).toBe(401);
        expect(res.body.message).toBe('Chưa đăng nhập hoặc phiên đã hết hạn');
      }
    });

    it('tài khoản không có quyền nào: endpoint cần quyền không bao giờ trả 2xx', async () => {
      const nobody = await login(NOBODY);
      const guarded = Object.entries(ROUTES).filter(([, access]) => Array.isArray(access));
      for (const [key] of guarded) {
        const res = await call(key, nobody as never);
        expect(res.status, `${key} → ${res.status}`).toBeGreaterThanOrEqual(400);
        expect(res.status, `${key} → ${res.status}`).toBeLessThan(500);
      }
    });

    it('endpoint "self" của tài khoản không có quyền chỉ cho dữ liệu của chính mình', async () => {
      const nobody = await login(NOBODY);
      expect((await nobody.get('/auth/me').expect(200)).body.permissions).toEqual([]);
      const dashboard = (await nobody.get('/system/dashboard').expect(200)).body;
      expect(dashboard).toEqual({}); // không có thẻ thống kê hay tình trạng hệ thống
      expect((await nobody.get('/agent/actions').expect(200)).body).toEqual([]);
      expect((await nobody.get('/telegram/link').expect(200)).body.linked).toBe(false);
    });
  });

  describe('header, CORS và CSRF', () => {
    it('helmet: header bảo mật có mặt, không lộ X-Powered-By', async () => {
      const res = await http.get('/public/settings').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('CORS chỉ cho WEB_ORIGIN (kèm cookie); nguồn khác không được cấp quyền đọc', async () => {
      const ok = await http
        .options('/auth/login')
        .set('Origin', webOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      expect(ok.headers['access-control-allow-origin']).toBe(webOrigin);
      expect(ok.headers['access-control-allow-credentials']).toBe('true');
      expect(ok.headers['access-control-allow-headers']).not.toContain('x-dev-user-email');

      // Với nguồn lạ, header cho phép chỉ trỏ về WEB_ORIGIN (không phải nguồn lạ) nên trình duyệt chặn việc đọc.
      const evil = await http.options('/auth/login').set('Origin', EVIL).set('Access-Control-Request-Method', 'POST');
      expect(evil.headers['access-control-allow-origin']).not.toBe(EVIL);
      expect(evil.headers['access-control-allow-origin']).not.toBe('*');
      const read = await http.get('/public/settings').set('Origin', EVIL);
      expect(read.headers['access-control-allow-origin']).not.toBe(EVIL);
      expect(read.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('CSRF: request ghi mang Origin lạ bị từ chối dù có cookie đăng nhập, Origin của web hoặc không có Origin thì qua', async () => {
      const user = await login(NOBODY);
      const before = await prisma.user.findUniqueOrThrow({ where: { email: NOBODY } });
      for (const [method, path] of [['post', '/auth/change-password'], ['delete', '/telegram/link'], ['post', '/auth/logout']] as const) {
        const res = await user[method](path).set('Origin', EVIL).send({ currentPassword: PASSWORD, newPassword: 'Khac@12345' });
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(res.body).toEqual({ statusCode: 403, message: 'Nguồn yêu cầu không hợp lệ' });
      }
      // Mật khẩu không bị đổi, phiên vẫn còn.
      const after = await prisma.user.findUniqueOrThrow({ where: { email: NOBODY } });
      expect(after.passwordHash).toBe(before.passwordHash);
      await user.get('/auth/me').expect(200);
      // Origin hợp lệ (trình duyệt của web) và không có Origin (server-side) đều được.
      await user.post('/telegram/link-code').set('Origin', webOrigin).send({}).expect((r) => expect(r.status).not.toBe(403));
      await user.delete('/telegram/link').expect(204);
      // GET không bị chặn theo Origin (chỉ đọc; CORS lo phần đọc).
      await user.get('/auth/me').set('Origin', EVIL).expect(200);
    });

    it('cookie đăng nhập: HttpOnly, SameSite=Lax, Path=/', async () => {
      const res = await http.post('/auth/login').send({ email: NOBODY, password: PASSWORD }).expect(200);
      const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
      expect(cookies).toHaveLength(2);
      for (const cookie of cookies) {
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).toMatch(/Path=\//);
      }
      expect(cookies.map((c) => c.split('=')[0]).sort()).toEqual(['pvh_access', 'pvh_refresh']);
      expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // token không nằm trong body
    });
  });

  describe('body và lỗi thống nhất', () => {
    it('body quá lớn → 413, JSON hỏng → 400, đều thông báo tiếng Việt', async () => {
      const big = await http.post('/contacts').send({ message: 'x'.repeat(2_000_000) });
      expect(big.status).toBe(413);
      expect(big.body).toEqual({ statusCode: 413, message: 'Nội dung gửi lên quá lớn' });

      const broken = await http.post('/contacts').set('Content-Type', 'application/json').send('{"fullName": ');
      expect(broken.status).toBe(400);
      expect(broken.body).toEqual({ statusCode: 400, message: 'Dữ liệu JSON không hợp lệ' });
    });

    it('lỗi thông thường có dạng { statusCode, message } bằng tiếng Việt, không có stack', async () => {
      const notFound = await http.get('/khong-co-trang-nay').expect(404);
      expect(notFound.body).toEqual({ statusCode: 404, message: 'Không tìm thấy' });
      const unauth = await http.get('/auth/me').expect(401);
      expect(unauth.body).toEqual({ statusCode: 401, message: 'Chưa đăng nhập hoặc phiên đã hết hạn' });

      const nobody = await login(NOBODY);
      const forbidden = await nobody.get('/audit-logs').expect(403);
      expect(forbidden.body.statusCode).toBe(403);
      expect(forbidden.body.message).toContain('system:read');
      expect(JSON.stringify(forbidden.body)).not.toContain('stack');

      // Lỗi kiểm tra dữ liệu giữ chi tiết từng ô để giao diện hiển thị.
      const invalid = await http.post('/contacts').send({ fullName: '' }).expect(400);
      expect(invalid.body.statusCode).toBe(400);
      expect(invalid.body.fieldErrors).toBeDefined();
    });

    it('lỗi không lường trước → 500 chung chung: không lộ nội dung lỗi hay stack trace, chi tiết chỉ ở log', async () => {
      const logs: string[] = [];
      const spyLog = vi.spyOn(Logger.prototype, 'error').mockImplementation((msg: unknown) => void logs.push(String(msg)));
      vi.spyOn(app.get(SystemService, { strict: false }), 'getStatus').mockRejectedValue(
        new Error('connect ECONNREFUSED postgresql://pvh:matkhau-bi-mat@db:5432'),
      );
      const admin = await login('admin@pvh.edu.vn');
      const res = await admin.get('/system/status').expect(500);
      expect(res.body).toEqual({ statusCode: 500, message: 'Lỗi hệ thống, vui lòng thử lại sau' });
      expect(JSON.stringify(res.body)).not.toMatch(/matkhau|ECONNREFUSED|at |stack/);
      expect(logs.join('\n')).toContain('matkhau-bi-mat'); // chi tiết có trong log phía máy chủ
      spyLog.mockRestore();
      vi.restoreAllMocks();
    });
  });

  describe('dữ liệu học sinh không đi qua agent/Telegram', () => {
    it('bộ tool của agent chỉ gồm các tool đã duyệt (không có tool xem người dùng, học sinh, liên hệ)', () => {
      const providers = app.get<AgentToolProvider[]>(AGENT_TOOL_PROVIDERS, { strict: false });
      const user = { id: '1', email: 'x@pvh.edu.vn', fullName: 'X', roles: ['ADMIN' as const], permissions: [] };
      const names = providers.flatMap((p) => p.buildTools({ user, channel: 'telegram' })).map((t) => t.name).sort();
      expect(names).toEqual(
        [
          'approve_post', 'check_deadlines', 'create_and_publish_post', 'create_announcement', 'create_post_draft',
          'create_post_with_media', 'create_task', 'get_system_status', 'list_assignees', 'list_categories',
          'list_posts', 'reschedule_post', 'schedule_post', 'submit_post_for_review', 'summarize_day',
          'unpublish_post', 'update_task_status',
        ].sort(),
      );
    });

    it('danh sách người được giao việc không có học sinh; system prompt cấm xử lý dữ liệu học sinh', async () => {
      const principal = await login('bgh@pvh.edu.vn');
      const assignees = (await principal.get('/tasks/assignees').expect(200)).body as { id: string; fullName: string }[];
      const students = await prisma.user.findMany({ where: { roles: { some: { role: { code: 'STUDENT' } } } }, select: { id: true } });
      const studentIds = new Set(students.map((s) => s.id.toString()));
      expect(assignees.some((a) => studentIds.has(a.id))).toBe(false);

      const user = (await app.get(UsersService).findAuthUserByEmail('bgh@pvh.edu.vn'))!;
      const prompt = buildSystemPrompt({ user, channel: 'telegram' });
      expect(prompt).toContain('Dữ liệu cá nhân của học sinh');
      expect(prompt).toContain('từ chối');
    });
  });
});
