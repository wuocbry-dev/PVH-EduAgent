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
import { ROUTES } from './routes.js';

const PASSWORD = 'Pvh@2026';
const SEED_TEACHER = 'gv.toan@pvh.edu.vn';
const TAG = `SEC-${Date.now()}`.toLowerCase();
const NOBODY = `${TAG}.hs@test.pvh.edu.vn`; // vai trò STUDENT: không có quyền nào
const EVIL = 'https://evil.example';

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
          'list_posts', 'reschedule_post', 'schedule_post', 'search_library', 'submit_post_for_review', 'summarize_day',
          'unpublish_post', 'update_task_status',
        ].sort(),
      );
    });

    it('không tool nào của agent và không đường Telegram nào truy cập bảng điểm (bước 18)', () => {
      const providers = app.get<AgentToolProvider[]>(AGENT_TOOL_PROVIDERS, { strict: false });
      const user = { id: '1', email: 'x@pvh.edu.vn', fullName: 'X', roles: ['PRINCIPAL' as const], permissions: [] };
      const tools = providers.flatMap((p) => p.buildTools({ user, channel: 'telegram' }));
      for (const t of tools) expect(`${t.name} ${t.description}`, t.name).not.toMatch(/score|assessment|điểm số|bảng điểm|đợt thi/i);

      // Quét mã nguồn: mọi file tool của agent, thư mục agent, telegram và trung tâm giám sát (bước 26: cảnh báo cho ADMIN)
      // không được nhắc tới bảng/dịch vụ điểm.
      const src = fileURLToPath(new URL('../src/features', import.meta.url));
      const files = readdirSync(src, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
        .filter((f) => f.endsWith('.agent-tools.ts') || /^(agent|agent-actions|telegram|monitoring)[\\/]/.test(f));
      expect(files.some((f) => f.startsWith('monitoring'))).toBe(true);
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

  describe('bí mật không nằm trong dữ liệu lưu lại (bước 23)', () => {
    // Quét TOÀN BỘ bảng (cả dữ liệu do các test khác và người dùng thật tạo ra), không chỉ dữ liệu của test này.
    const PATTERNS: [string, RegExp][] = [
      ['URL ký sẵn', /X-Amz-Signature|X-Amz-Credential|[?&]token=/i],
      ['token bot Telegram', /\d{6,}:[A-Za-z0-9_-]{30,}/],
      ['mã kích hoạt', /\b[A-Z0-9]{5}-[A-Z0-9]{5}\b/],
      ['mật khẩu', /Pvh@2026|"(password|newPassword|currentPassword|passwordHash)"\s*:/],
      ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
    ];
    const ENV_SECRETS = [
      'JWT_ACCESS_SECRET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET',
      'REVALIDATE_SECRET', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
    ];

    function leaks(text: string): string[] {
      const found = PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
      for (const key of ENV_SECRETS) {
        const value = process.env[key];
        if (value && value.length >= 8 && text.includes(value)) found.push(key);
      }
      return found;
    }

    async function scan<T extends { id: bigint }>(name: string, page: (after: bigint) => Promise<T[]>, text: (row: T) => string) {
      const problems: string[] = [];
      let rows = 0;
      for (let after = 0n; ; ) {
        const batch = await page(after);
        if (batch.length === 0) break;
        for (const row of batch) {
          rows++;
          const found = leaks(text(row));
          if (found.length) problems.push(`${name} #${row.id}: ${found.join(', ')}`);
        }
        after = batch[batch.length - 1].id;
      }
      expect(problems, problems.slice(0, 20).join('\n')).toEqual([]);
      return rows;
    }

    it('audit_logs, thông báo và yêu cầu xác nhận của agent không chứa URL ký sẵn, token, khoá, mật khẩu, mã kích hoạt', async () => {
      const take = 5000;
      const audit = await scan(
        'audit_logs',
        (after) => prisma.auditLog.findMany({ where: { id: { gt: after } }, orderBy: { id: 'asc' }, take, select: { id: true, payload: true } }),
        (r) => JSON.stringify(r.payload),
      );
      expect(audit).toBeGreaterThan(0);
      await scan(
        'notifications',
        (after) => prisma.notification.findMany({ where: { id: { gt: after } }, orderBy: { id: 'asc' }, take, select: { id: true, title: true, body: true } }),
        (r) => `${r.title}\n${r.body}`,
      );
      await scan(
        'agent_actions',
        (after) => prisma.agentAction.findMany({ where: { id: { gt: after } }, orderBy: { id: 'asc' }, take, select: { id: true, args: true, result: true } }),
        (r) => JSON.stringify([r.args, r.result]),
      );
    });

    it('mẫu nhận dạng hoạt động (tự kiểm tra bộ quét)', () => {
      expect(leaks('https://x.r2.cloudflarestorage.com/a?X-Amz-Signature=abc')).toContain('URL ký sẵn');
      expect(leaks('/library/files/9?token=abc.def')).toContain('URL ký sẵn');
      expect(leaks('123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ')).toContain('token bot Telegram');
      expect(leaks('{"code":"AB2CD-EF3GH"}')).toContain('mã kích hoạt');
      expect(leaks('{"password":"x"}')).toContain('mật khẩu');
      expect(leaks('{"params":{"email":"a@pvh.edu.vn"},"ok":true}')).toEqual([]);
    });
  });
});
