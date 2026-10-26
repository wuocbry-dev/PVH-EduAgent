// Bước 10 – rà soát bảo mật: bảng endpoint → quyền, guard, header, CORS/CSRF, giới hạn body, định dạng lỗi,
// dữ liệu học sinh với agent. Cần PostgreSQL (đã seed) và Redis.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  'POST /auth/activate': 'public', // mã kích hoạt dùng một lần; giới hạn theo IP và mã đăng nhập
  'POST /auth/refresh': 'public',
  'POST /auth/logout': 'public',
  'GET /auth/me': 'self',
  'POST /auth/change-password': 'self',
  'POST /auth/forgot-password': 'public',
  'POST /auth/reset-password': 'public',

  'GET /academic/me': 'self', // chỉ thông tin học vụ của chính mình
  'GET /academic/school-years': ['academic:manage'],
  'POST /academic/school-years': ['academic:manage'],
  'PATCH /academic/school-years/:id': ['academic:manage'],
  'DELETE /academic/school-years/:id': ['academic:manage'],
  'GET /academic/semesters': ['academic:manage'],
  'POST /academic/semesters': ['academic:manage'],
  'PATCH /academic/semesters/:id': ['academic:manage'],
  'DELETE /academic/semesters/:id': ['academic:manage'],
  'GET /academic/grades': ['academic:manage'],
  'GET /academic/departments': ['academic:manage'],
  'POST /academic/departments': ['academic:manage'],
  'PATCH /academic/departments/:id': ['academic:manage'],
  'DELETE /academic/departments/:id': ['academic:manage'],
  'GET /academic/subjects': ['academic:manage'],
  'POST /academic/subjects': ['academic:manage'],
  'PATCH /academic/subjects/:id': ['academic:manage'],
  'DELETE /academic/subjects/:id': ['academic:manage'],
  'GET /academic/rooms': ['academic:manage'],
  'POST /academic/rooms': ['academic:manage'],
  'PATCH /academic/rooms/:id': ['academic:manage'],
  'DELETE /academic/rooms/:id': ['academic:manage'],
  'GET /academic/teachers': ['academic:manage'],
  'GET /academic/classes': ['academic:manage'],
  'POST /academic/classes': ['academic:manage'],
  'PATCH /academic/classes/sessions': ['academic:manage'],
  'PATCH /academic/classes/:id': ['academic:manage'],
  'DELETE /academic/classes/:id': ['academic:manage'],
  'GET /academic/classes/:id/students': ['academic:manage'], // hoặc giáo viên chủ nhiệm đúng lớp
  'POST /academic/students/:userId/transfer': ['academic:manage'],

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
  'GET /events/mine': 'self', // sự kiện toàn trường + đúng đối tượng (bước 20)
  'GET /events/targets': ['post:approve'],
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

  'GET /roster/templates/:kind': ['student:import'],
  'POST /roster/import/:kind/preview': ['student:import'],
  'POST /roster/import/:previewId/confirm': ['student:import'],
  'POST /roster/users/:userId/activation-code': ['student:import'], // hoặc giáo viên chủ nhiệm của học sinh đó
  'POST /roster/classes/:classId/activation-codes': ['student:import'],

  'GET /roles': ['user:manage'],
  'PUT /roles/:code/permissions': ['user:manage'],

  'GET /settings': ['system:read'],
  'PATCH /settings': ['setting:manage'],

  'GET /system/health': 'public',
  'GET /system/status': ['system:read'],
  'GET /system/dashboard': 'self',
  'GET /system/overview': ['academic:manage'],

  'GET /tasks/deadlines': ['task:read:all', 'task:read:own'],
  'GET /tasks/assignees': ['task:assign', 'task:read:all'],
  'GET /tasks': ['task:read:all', 'task:read:own'],
  'GET /tasks/:id': ['task:read:all', 'task:read:own'],
  'POST /tasks': ['task:assign'],
  'PATCH /tasks/:id': ['task:assign'],
  'PATCH /tasks/:id/status': ['task:assign'],
  'DELETE /tasks/:id': ['task:assign'],

  'POST /telegram/webhook': 'public',
  'GET /timetable/frame': 'self',
  'PUT /timetable/frame': ['timetable:manage'], // hoặc setting:manage (ADMIN)
  'GET /timetable/versions': ['timetable:read'],
  'POST /timetable/versions': ['timetable:manage'],
  'DELETE /timetable/versions/:id': ['timetable:manage'],
  'POST /timetable/versions/:id/publish': ['timetable:manage'],
  'GET /timetable/versions/:id/slots': ['timetable:read'],
  'POST /timetable/versions/:id/slots': ['timetable:manage'],
  'GET /timetable/versions/:id/options': ['timetable:read'],
  'GET /timetable/versions/:id/stats': ['timetable:read'],
  'PATCH /timetable/slots/:id': ['timetable:manage'],
  'DELETE /timetable/slots/:id': ['timetable:manage'],
  'GET /timetable/fixed': 'self',
  'POST /timetable/fixed': ['timetable:manage'],
  'DELETE /timetable/fixed/:id': ['timetable:manage'],
  'GET /timetable/unavailability': ['timetable:read'],
  'GET /timetable/unavailability/mine': 'self',
  'PUT /timetable/unavailability/mine': 'self', // chỉ giáo viên (có hồ sơ giáo viên)
  'GET /timetable/view/mine': 'self',
  'GET /timetable/view/class/:classId': 'self', // quản lý/ADMIN mọi lớp; học sinh lớp mình; giáo viên lớp mình dạy
  'GET /timetable/view/teacher/:teacherId': 'self', // quản lý/ADMIN mọi giáo viên; giáo viên chỉ của mình
  'GET /timetable/export': ['timetable:read'],

  'GET /teaching/quotas': ['teaching:read'],
  'PUT /teaching/quotas': ['teaching:assign'],
  'PUT /teaching/quotas/class': ['teaching:assign'],
  'GET /teaching/assignments': ['teaching:read'],
  'POST /teaching/assignments': ['teaching:assign'],
  'POST /teaching/assignments/copy': ['teaching:assign'],
  'PATCH /teaching/assignments/:id': ['teaching:assign'],
  'DELETE /teaching/assignments/:id': ['teaching:assign'],
  'GET /teaching/summary': ['teaching:read'],
  'GET /teaching/summary/export': ['teaching:read'],
  'GET /teaching/mine': 'self', // chỉ phân công của chính mình
  'PUT /teaching/teachers/:userId/quota': ['teaching:assign'],

  // Điểm (bước 18): ngoài quyền còn kiểm tra phạm vi phân công lớp–môn–học kỳ trong service; ADMIN không có quyền điểm.
  'GET /scores/context': ['score:enter'], // hoặc assessment:manage / score:read:all
  'GET /scores/progress': ['score:read:all'],
  'GET /scores/assessments': ['score:enter'], // hoặc score:read:all (BGH xem mọi đợt)
  'POST /scores/assessments': ['score:enter'], // thường xuyên; giữa kỳ/cuối kỳ cần assessment:manage
  'PATCH /scores/assessments/:id': ['score:enter'], // người tạo đợt thường xuyên, hoặc assessment:manage
  'DELETE /scores/assessments/:id': ['score:enter'], // như trên; đã có lịch sử điểm thì không xoá được
  'GET /scores/assessments/:id/classes/:classId': ['score:enter'], // trong phạm vi phân công, hoặc score:read:all
  'PUT /scores/assessments/:id/classes/:classId': ['score:enter'], // chỉ giáo viên được phân công, trong hạn nhập
  'POST /scores/assessments/:id/classes/:classId/publish': ['score:enter'], // hoặc assessment:manage
  'PUT /scores/assessments/:id/classes/:classId/exemptions/:studentId': ['assessment:manage'],
  'GET /scores/assessments/:id/classes/:classId/template': ['score:enter'],
  'POST /scores/assessments/:id/classes/:classId/import/preview': ['score:enter'],
  'POST /scores/import/:previewId/confirm': ['score:enter'],
  // Bước 19 – xem điểm, thống kê, hạn nhập/khoá sổ, điều chỉnh sau hạn.
  'GET /scores/me': 'self', // chỉ học sinh, chỉ điểm của chính mình đã công bố
  'GET /scores/students/:studentId/report': ['score:read:all'], // hoặc chủ nhiệm lớp hiện tại của học sinh (score:enter)
  'GET /scores/gradebook': ['score:enter'], // giáo viên được phân công / chủ nhiệm (đã công bố) / score:read:all
  'GET /scores/gradebook/export': ['score:enter'], // như trên
  'GET /scores/classes/:classId/summary': ['score:enter'], // chủ nhiệm lớp, hoặc score:read:all
  'GET /scores/classes/:classId/summary/export': ['score:enter'], // như trên
  'GET /scores/stats': ['score:read:all'],
  'GET /scores/formula': 'self', // công thức ĐTB, không chứa điểm của ai
  'PUT /scores/formula': ['assessment:manage'], // hoặc setting:manage (ADMIN)
  'GET /scores/locks': ['score:read:all'], // hoặc assessment:manage
  'PUT /scores/deadlines': ['assessment:manage'],
  'PUT /scores/locks/:semesterId': ['assessment:manage'],
  'GET /scores/adjustments': ['score:enter'], // giáo viên: của mình; assessment:manage: mọi đề nghị
  'POST /scores/adjustments': ['score:enter'], // giáo viên được phân công, đợt đã khoá
  'POST /scores/adjustments/:id/approve': ['assessment:manage'],
  'POST /scores/adjustments/:id/reject': ['assessment:manage'],
  'POST /scores/adjustments/:id/cancel': ['score:enter'], // chính người gửi
  // Bước 20 – thông báo theo đối tượng, hộp thông báo.
  'GET /announcements/inbox': 'self', // thông báo đúng đối tượng của chính mình + thông báo hệ thống của mình
  'GET /announcements/unread-count': 'self',
  'POST /announcements/inbox/read': 'self', // chỉ mục mình thấy / của chính mình
  'GET /announcements/targets': ['announcement:send'],
  'GET /announcements/sent': ['announcement:send'],
  'POST /announcements': ['announcement:send'], // giáo viên: lớp mình dạy/chủ nhiệm; announcement:manage: mọi đối tượng
  'DELETE /announcements/:id': ['announcement:send'], // người gửi hoặc announcement:manage

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
          'create_post_with_media', 'create_task', 'get_system_status', 'get_timetable', 'list_assignees', 'list_categories',
          'list_posts', 'reschedule_post', 'schedule_post', 'submit_post_for_review', 'summarize_day',
          'unpublish_post', 'update_task_status',
        ].sort(),
      );
    });

    it('không tool nào của agent và không đường Telegram nào truy cập bảng điểm (bước 18)', () => {
      const providers = app.get<AgentToolProvider[]>(AGENT_TOOL_PROVIDERS, { strict: false });
      const user = { id: '1', email: 'x@pvh.edu.vn', fullName: 'X', roles: ['PRINCIPAL' as const], permissions: [] };
      const tools = providers.flatMap((p) => p.buildTools({ user, channel: 'telegram' }));
      for (const t of tools) expect(`${t.name} ${t.description}`, t.name).not.toMatch(/score|assessment|điểm số|bảng điểm|đợt thi/i);

      // Quét mã nguồn: mọi file tool của agent, thư mục agent và telegram không được nhắc tới bảng/dịch vụ điểm.
      const src = fileURLToPath(new URL('../src/features', import.meta.url));
      const files = readdirSync(src, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
        .filter((f) => f.endsWith('.agent-tools.ts') || /^(agent|agent-actions|telegram)[\\/]/.test(f));
      expect(files.length).toBeGreaterThan(10);
      for (const f of files) {
        const code = readFileSync(join(src, f), 'utf8');
        expect(code, f).not.toMatch(/\.scores?\b|scoreHistory|\.assessments?\b|assessmentClass|ScoresService|features\/scores|['"]\.\.\/scores\//);
      }
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
