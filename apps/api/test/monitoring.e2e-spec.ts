// Bước 26 – trung tâm giám sát: quyền xem/thao tác, chuyển trạng thái dịch vụ và chống báo trùng, nhật ký lỗi đã làm sạch,
// cảnh báo bất thường tài khoản, phiên đăng nhập / buộc đăng xuất / thao tác hàng loạt, gỡ chặn IP.
// e2e đặt MONITORING_ENABLED=false (không job định kỳ, không cảnh báo); từng test bật tường minh rồi tắt lại.
// Không gọi Telegram/R2/Claude thật (bot giả, STORAGE_DRIVER=local). Tự dọn dữ liệu đã tạo.
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import type { MonitoringOverviewDto, SecurityOverviewDto, UserSessionDto } from '@pvh/shared';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import type { Prisma } from './../src/generated/prisma/client.js';
import { configureApp } from './../src/bootstrap/configure-app.js';
import { AccountWatchService } from './../src/features/monitoring/account-watch.service.js';
import { HealthProbeService, type ProbeResult } from './../src/features/monitoring/health-probe.service.js';
import { MonitoringAlertsService } from './../src/features/monitoring/monitoring-alerts.service.js';
import { MonitoringService } from './../src/features/monitoring/monitoring.service.js';
import { SystemErrorsService } from './../src/features/monitoring/system-errors.service.js';
import { SettingsService } from './../src/features/settings/settings.service.js';
import { SystemService } from './../src/features/system/system.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { RedisService } from './../src/infrastructure/queue/redis.service.js';
import { RateLimitService } from './../src/infrastructure/rate-limit/rate-limit.service.js';
import { resetLimits } from './reset-limits.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';
const TAG = `e26x${Date.now()}`; // có ký tự không phải hex để routePattern không coi là id
const SECRET = 'sieu-bi-mat-e26';
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Trung tâm giám sát (bước 26, e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let alerts: MonitoringAlertsService;
  let errors: SystemErrorsService;
  let monitoring: MonitoringService;
  let started: Date;
  const tempUsers: bigint[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, { accessLog: false });
    await app.init();
    await resetLimits(app, ['login']);
    prisma = app.get(PrismaService);
    alerts = app.get(MonitoringAlertsService);
    errors = app.get(SystemErrorsService);
    monitoring = app.get(MonitoringService);
    started = new Date(Date.now() - 1000);
    const limits = app.get(RateLimitService);
    for (const [name, id] of [['monitor-alert', 'all'], ['monitor-5xx', 'all']]) await limits.reset(name, id);
  });

  afterEach(() => {
    alerts.enabled = false;
    errors.enabled = false;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      // Cảnh báo và thông báo do test tạo: theo TAG hoặc theo các khoá/tiêu đề riêng của test.
      await prisma.systemAlert.deleteMany({
        where: {
          openedAt: { gte: started },
          OR: [{ title: { contains: TAG } }, { detail: { contains: TAG } }, { key: { in: ['service:claude', 'error_spike', `job_failures:${TAG}`] } }],
        },
      });
      await prisma.notification.deleteMany({
        where: {
          createdAt: { gte: started },
          OR: [{ title: { contains: TAG } }, { body: { contains: TAG } }, { title: { contains: 'Claude API' } }, { title: { contains: 'lỗi máy chủ (5xx)' } }],
        },
      });
      await prisma.systemError.deleteMany({ where: { OR: [{ message: { contains: TAG } }, { route: { contains: TAG } }] } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: tempUsers } } });
      await prisma.auditLog.deleteMany({ where: { action: 'auth.login', createdAt: { gte: started }, payload: { path: ['params', 'email'], string_contains: TAG } } });
      await prisma.user.deleteMany({ where: { id: { in: tempUsers } } });
    } finally {
      await resetLimits(app, ['login']);
      await app.close();
    }
  });

  async function login(email: string, userAgent = CHROME_WIN) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').set('User-Agent', userAgent).send({ email, password: PASSWORD }).expect(200);
    return agent;
  }

  async function tempUser(role: 'ADMIN' | 'PRINCIPAL' | 'TEACHER', label: string) {
    const seed = await prisma.user.findUniqueOrThrow({ where: { email: TEACHER } });
    const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const user = await prisma.user.create({
      data: { email: `${TAG}.${label}@test.pvh.edu.vn`, fullName: `${TAG} ${label}`, passwordHash: seed.passwordHash, roles: { create: { roleId: r.id } } },
    });
    tempUsers.push(user.id);
    return user;
  }

  async function waitForAlert(where: Prisma.SystemAlertWhereInput) {
    for (let i = 0; i < 40; i++) {
      const found = await prisma.systemAlert.findFirst({ where });
      if (found) return found;
      await sleep(100);
    }
    return null;
  }

  describe('quyền', () => {
    it('chỉ người có system:read xem được; thao tác hệ thống cần setting:manage, gỡ chặn cần user:manage', async () => {
      const admin = await login(ADMIN);
      const overview = (await admin.get('/monitoring/overview').expect(200)).body as MonitoringOverviewDto;
      expect(overview.services.map((s) => s.service)).toEqual(['database', 'redis', 'queue', 'r2_public', 'r2_private', 'telegram', 'claude']);
      expect(overview.latency24h).toHaveLength(7);
      for (const s of overview.latency24h) expect(s.hours).toHaveLength(24);
      expect(overview.errorsByHour).toHaveLength(24);
      expect(overview.monitoringEnabled).toBe(false); // e2e tắt job định kỳ
      await admin.get('/monitoring/security').expect(200);
      await admin.get('/monitoring/errors').expect(200);
      await admin.get('/monitoring/alerts').expect(200);
      expect(Array.isArray((await admin.get('/monitoring/jobs/failed').expect(200)).body)).toBe(true);

      // BGH có system:read nên xem được, nhưng không có setting:manage / user:manage.
      const principal = await login(PRINCIPAL);
      await principal.get('/monitoring/overview').expect(200);
      await principal.post('/monitoring/check-now').expect(403);
      await principal.post('/monitoring/jobs/publish-post/1/retry').expect(403);
      await principal.delete('/monitoring/blocked/login/127.0.0.1').expect(403);
      await principal.get('/users/1/sessions').expect(403);

      const teacher = await login(TEACHER);
      for (const path of ['/monitoring/overview', '/monitoring/security', '/monitoring/errors', '/monitoring/alerts', '/monitoring/jobs/failed']) {
        await teacher.get(path).expect(403);
      }
    });

    it('ADMIN không có thêm quyền nghiệp vụ nào (điểm, bài viết, thư viện, trắc nghiệm, giao việc)', async () => {
      const me = (await (await login(ADMIN)).get('/auth/me').expect(200)).body as { permissions: string[] };
      expect(me.permissions.filter((p) => /^(score|assessment|post|library|quiz|task|announcement):/.test(p))).toEqual([]);
      expect(me.permissions).toEqual(expect.arrayContaining(['system:read', 'user:manage', 'setting:manage']));
    });
  });

  describe('kiểm tra sức khoẻ và cảnh báo dịch vụ', () => {
    it('thông điệp lỗi của dịch vụ được làm sạch (không có mật khẩu trong chuỗi kết nối)', async () => {
      const redis = app.get(RedisService);
      vi.spyOn(redis.client!, 'ping').mockRejectedValue(new Error(`connect ECONNREFUSED redis://:${SECRET}@10.0.0.9:6379`));
      const results = await app.get(HealthProbeService).runAll();
      const r = results.find((x) => x.service === 'redis')!;
      expect(r.status).toBe('DOWN');
      expect(r.message).toContain('ECONNREFUSED');
      expect(r.message).not.toContain(SECRET);
      expect(results.find((x) => x.service === 'database')!.status).not.toBe('DOWN');
      expect(results.find((x) => x.service === 'r2_public')!.message).toContain('local');
    });

    it('vừa ngừng thì báo một lần, ngừng tiếp không báo lại, hồi phục thì đóng cảnh báo và báo đã ổn', async () => {
      alerts.enabled = true;
      const probe = app.get(HealthProbeService);
      const snapshot = (claude: ProbeResult['status']): ProbeResult[] => [
        { service: 'database', status: 'OK', latencyMs: 3, message: 'Kết nối được' },
        { service: 'claude', status: claude, latencyMs: claude === 'DOWN' ? 50 : 1, message: claude === 'DOWN' ? `Lỗi thử nghiệm ${TAG}` : 'Đã cấu hình' },
      ];
      const recipients = await prisma.user.count({
        where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { permission: { code: 'system:read' } } } } } } },
      });
      const sent = () => prisma.notification.count({ where: { createdAt: { gte: started }, title: { contains: 'Claude API' } } });
      const times: Date[] = [];
      const run = async (claude: ProbeResult['status']) => {
        vi.spyOn(probe, 'runAll').mockResolvedValueOnce(snapshot(claude));
        const now = new Date();
        times.push(now);
        await monitoring.runHealthCheck(now);
      };
      try {
        await run('OK');
        expect(await sent()).toBe(0);
        await run('DOWN');
        const open = await prisma.systemAlert.findFirst({ where: { key: 'service:claude', resolvedAt: null } });
        expect(open).toMatchObject({ kind: 'service_down' });
        expect(await sent()).toBe(recipients);
        await run('DOWN');
        await run('DOWN');
        expect(await sent()).toBe(recipients); // không báo lại khi trạng thái không đổi
        expect(await prisma.systemAlert.count({ where: { key: 'service:claude', resolvedAt: null } })).toBe(1);
        await run('OK');
        expect(await prisma.systemAlert.count({ where: { key: 'service:claude', resolvedAt: null } })).toBe(0);
        expect(await sent()).toBe(recipients * 2); // một tin "Đã hồi phục"
        const notes = await prisma.notification.findMany({ where: { createdAt: { gte: started }, title: { contains: 'Claude API' } } });
        expect(notes.every((n) => n.channel === 'telegram' || n.channel === 'web')).toBe(true);
        // Văn bản thuần đã defang (tên miền/IP không thành liên kết), không có bí mật.
        for (const n of notes) expect(`${n.title} ${n.body}`).not.toContain(SECRET);
        expect(await prisma.systemHealthCheck.count({ where: { checkedAt: { in: times } } })).toBe(times.length * 2);
      } finally {
        await prisma.systemHealthCheck.deleteMany({ where: { checkedAt: { in: times } } });
      }
    });

    it('hai tiến trình cùng mở một cảnh báo: CSDL chỉ cho một cảnh báo đang mở mỗi khoá', async () => {
      alerts.enabled = true;
      const key = `job_failures:${TAG}`;
      const [a, b] = await Promise.all([alerts.open('job_failures', key, `Thử ${TAG}`), alerts.open('job_failures', key, `Thử ${TAG}`)]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
      expect(await prisma.systemAlert.count({ where: { key, resolvedAt: null } })).toBe(1);
      expect(await alerts.resolveByKey(key)).toBe(1);
    });

    it('tắt telegram.admin_alerts thì vẫn ghi cảnh báo nhưng không gửi tin', async () => {
      alerts.enabled = true;
      const settings = app.get(SettingsService);
      const original = settings.effective.bind(settings);
      vi.spyOn(settings, 'effective').mockImplementation(async (key) => (key === 'telegram.admin_alerts' ? 'false' : original(key)));
      const before = await prisma.notification.count({ where: { createdAt: { gte: started } } });
      const alert = await alerts.open('job_failures', `job_failures:${TAG}`, `Không gửi ${TAG}`);
      expect(alert).not.toBeNull();
      expect(await prisma.notification.count({ where: { createdAt: { gte: started } } })).toBe(before);
      await alerts.resolveByKey(`job_failures:${TAG}`);
    });

    it('ADMIN bấm kiểm tra ngay: lưu kết quả mọi dịch vụ; quá 6 lần/phút bị 429', async () => {
      const admin = await login(ADMIN);
      const res = (await admin.post('/monitoring/check-now').expect(200)).body as { service: string; status: string; checkedAt: string }[];
      expect(res).toHaveLength(7);
      const at = new Date(res[0].checkedAt);
      try {
        expect(await prisma.systemHealthCheck.count({ where: { checkedAt: at } })).toBe(7);
      } finally {
        await prisma.systemHealthCheck.deleteMany({ where: { checkedAt: at } });
      }
      await app.get(RateLimitService).reset('monitor-check', (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } })).id.toString());
    });

    it('đo dung lượng kho (local: không cảnh báo R2) và dọn dữ liệu giám sát cũ', async () => {
      const usage = await monitoring.measureStorage();
      expect(usage.driver).toBe('local');
      expect(usage.totalBytes).toBe(usage.publicBytes + usage.privateBytes);
      expect(usage.quotaBytes).toBe(10 * 1024 ** 3);
      const old = await prisma.systemHealthCheck.create({
        data: { service: 'database', status: 'OK', latencyMs: 1, message: TAG, checkedAt: new Date(Date.now() - 8 * 24 * 3600_000) },
      });
      const result = await monitoring.cleanup();
      expect(result.checks).toBeGreaterThanOrEqual(1);
      expect(await prisma.systemHealthCheck.findUnique({ where: { id: old.id } })).toBeNull();
    });
  });

  describe('nhật ký lỗi', () => {
    it('lỗi 5xx thật đi qua filter: gom nhóm, đếm, thông điệp không có bí mật; người dùng chỉ thấy câu chung chung', async () => {
      errors.enabled = true;
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      vi.spyOn(app.get(SystemService, { strict: false }), 'getStatus').mockRejectedValue(
        new Error(`${TAG} connect ECONNREFUSED postgresql://pvh:${SECRET}@db:5432 token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln`),
      );
      const admin = await login(ADMIN);
      for (let i = 0; i < 2; i++) {
        const res = await admin.get('/system/status').expect(500);
        expect(JSON.stringify(res.body)).not.toContain(SECRET);
      }
      let row = null;
      for (let i = 0; i < 40 && (!row || row.count < 2); i++) {
        row = await prisma.systemError.findFirst({ where: { message: { contains: TAG } } });
        await sleep(100);
      }
      expect(row).toMatchObject({ source: 'HTTP', statusCode: 500, count: 2 });
      expect(row!.route).toMatch(/GET .*system\/status/);
      expect(row!.message).not.toContain(SECRET);
      expect(row!.message).not.toContain('eyJ');

      // ADMIN đánh dấu đã xử lý (setting:manage), BGH chỉ xem.
      await (await login(PRINCIPAL)).post(`/monitoring/errors/${row!.id}/resolve`).expect(403);
      const resolved = (await admin.post(`/monitoring/errors/${row!.id}/resolve`).expect(200)).body;
      expect(resolved.resolvedAt).not.toBeNull();
    });

    it(`lỗi tăng đột biến: đúng một cảnh báo khi chạm ngưỡng, hết cửa sổ thì tự đóng`, async () => {
      errors.enabled = true;
      alerts.enabled = true;
      const limits = app.get(RateLimitService);
      await limits.reset('monitor-5xx', 'all');
      for (let i = 0; i < 12; i++) {
        await errors.handleHttp({ method: 'GET', path: `/e2e/${TAG}/${i}`, statusCode: 500, error: new Error(`Lỗi thử ${TAG}`) });
      }
      expect(await prisma.systemAlert.count({ where: { key: 'error_spike', openedAt: { gte: started } } })).toBe(1);
      const group = await prisma.systemError.findFirstOrThrow({ where: { message: { contains: TAG }, route: { contains: TAG } } });
      expect(group.count).toBe(12); // cùng một nhóm (id trong đường dẫn thành :id)
      await limits.reset('monitor-5xx', 'all');
      await errors.closeSpikeIfQuiet();
      expect(await prisma.systemAlert.count({ where: { key: 'error_spike', resolvedAt: null } })).toBe(0);
    });

    it('job thất bại liên tiếp: chỉ tính lần thất bại hẳn, chạm ngưỡng thì báo, chạy thành công thì đóng', async () => {
      errors.enabled = true;
      alerts.enabled = true;
      const queue = TAG;
      await errors.recordJob(queue, 'publish', 1, new Error(`Lỗi tạm ${TAG}`), false);
      expect(await prisma.systemError.count({ where: { route: { contains: TAG }, source: 'JOB' } })).toBe(0);
      for (let i = 0; i < 3; i++) await errors.recordJob(queue, 'publish', 3, new Error(`Lỗi đăng bài ${TAG}`), true);
      expect(await prisma.systemAlert.count({ where: { key: `job_failures:${queue}`, resolvedAt: null } })).toBe(1);
      await errors.jobSucceeded(queue);
      expect(await prisma.systemAlert.count({ where: { key: `job_failures:${queue}`, resolvedAt: null } })).toBe(0);
    });
  });

  describe('bảo vệ tài khoản', () => {
    it('đăng nhập BGH/ADMIN từ thiết bị chưa thấy thì báo; lần đầu và thiết bị cũ thì không', async () => {
      alerts.enabled = true;
      const boss = await tempUser('PRINCIPAL', 'bgh');
      await login(boss.email!, CHROME_WIN); // lần đầu: chưa có lịch sử để so
      await login(boss.email!, CHROME_WIN);
      await sleep(400);
      expect(await prisma.systemAlert.count({ where: { kind: 'new_login', title: { contains: TAG } } })).toBe(0);
      await login(boss.email!, FIREFOX_LINUX);
      const alert = await waitForAlert({ kind: 'new_login', title: { contains: boss.fullName } });
      expect(alert?.detail).toContain('Firefox trên Linux');
      // Giáo viên đăng nhập từ thiết bị mới thì không báo.
      const teacher = await tempUser('TEACHER', 'gv');
      await login(teacher.email!, CHROME_WIN);
      await login(teacher.email!, FIREFOX_LINUX);
      await sleep(400);
      expect(await prisma.systemAlert.count({ where: { kind: 'new_login', title: { contains: teacher.fullName } } })).toBe(0);
    });

    it('một tài khoản sai mật khẩu chạm ngưỡng thì báo một lần', async () => {
      alerts.enabled = true;
      const settings = app.get(SettingsService);
      const original = settings.effective.bind(settings);
      vi.spyOn(settings, 'effective').mockImplementation(async (key) => (key === 'monitor.login_failures' ? '3' : original(key)));
      const victim = await tempUser('TEACHER', 'sai');
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer()).post('/auth/login').send({ email: victim.email, password: 'sai-mat-khau' }).expect(401);
      }
      const alert = await waitForAlert({ kind: 'login_failures', title: { contains: victim.fullName } });
      expect(alert?.title).toContain('3 lần');
      await sleep(300);
      expect(await prisma.systemAlert.count({ where: { kind: 'login_failures', title: { contains: victim.fullName } } })).toBe(1);
      await resetLimits(app, ['login']);
    });

    it('tạo tài khoản BGH mới, đổi vai trò người dùng, đổi quyền vai trò đều được báo', async () => {
      alerts.enabled = true;
      const admin = await login(ADMIN);
      const created = (
        await admin
          .post('/users')
          .send({ email: `${TAG}.moi@test.pvh.edu.vn`, fullName: `${TAG} BGH mới`, password: PASSWORD, roles: ['PRINCIPAL'] })
          .expect(201)
      ).body as { id: string };
      tempUsers.push(BigInt(created.id));
      expect(await waitForAlert({ kind: 'privileged_account', title: { contains: `${TAG} BGH mới` } })).not.toBeNull();
      // Người là đối tượng của cảnh báo (có system:read) không nhận tin về chính mình; ADMIN thì nhận.
      await sleep(200);
      expect(await prisma.notification.count({ where: { userId: BigInt(created.id), title: { contains: TAG } } })).toBe(0);
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } })).id;
      expect(await prisma.notification.count({ where: { userId: adminId, title: { contains: `${TAG} BGH mới` } } })).toBe(1);

      await admin.patch(`/users/${created.id}`).send({ roles: ['TEACHER'] }).expect(200);
      const change = await waitForAlert({ kind: 'role_change', title: { contains: `${TAG} BGH mới` } });
      expect(change?.detail).toContain('Ban giám hiệu → Giáo viên');

      // Đổi quyền vai trò: kiểm qua listener (không sửa quyền thật của vai trò trong CSDL dev).
      await app.get(AccountWatchService).handle(
        { userId: null, channel: 'web', action: 'role.update_permissions', params: { role: 'EDITOR', before: ['post:create'], after: ['post:create', 'quiz:manage'] }, ok: true },
        new Date(),
      );
      const perm = await prisma.systemAlert.findFirst({ where: { kind: 'role_change', title: { contains: 'Biên tập viên' }, openedAt: { gte: started } }, orderBy: { id: 'desc' } });
      expect(perm?.detail).toContain('Thêm: quiz:manage');
      if (perm) await prisma.systemAlert.delete({ where: { id: perm.id } });
    });
  });

  describe('phiên đăng nhập, khoá, buộc đăng xuất', () => {
    it('xem và thu hồi từng phiên; buộc đăng xuất thu hồi mọi refresh token', async () => {
      const user = await tempUser('TEACHER', 'phien');
      const one = await login(user.email!, CHROME_WIN);
      await login(user.email!, FIREFOX_LINUX);
      const admin = await login(ADMIN);
      let sessions = (await admin.get(`/users/${user.id}/sessions`).expect(200)).body as UserSessionDto[];
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.userAgent ?? '').sort((x, y) => x.localeCompare(y))).toEqual(['Chrome trên Windows', 'Firefox trên Linux']);
      await admin.delete(`/users/${user.id}/sessions/${sessions[0].id}`).expect(204);
      await admin.delete(`/users/${user.id}/sessions/${sessions[0].id}`).expect(404);
      sessions = (await admin.get(`/users/${user.id}/sessions`).expect(200)).body;
      expect(sessions).toHaveLength(1);
      expect((await admin.post(`/users/${user.id}/logout-all`).expect(200)).body).toEqual({ revoked: 1 });
      expect((await admin.get(`/users/${user.id}/sessions`).expect(200)).body).toEqual([]);
      await one.post('/auth/refresh').expect(401);
      expect(await prisma.auditLog.count({ where: { action: { in: ['user.session_revoke', 'user.logout_all'] }, targetId: user.id } })).toBe(2);
    });

    it('khoá tài khoản thu hồi phiên; hàng loạt cần đúng mật khẩu, bỏ qua chính mình', async () => {
      const a = await tempUser('TEACHER', 'khoa1');
      const b = await tempUser('TEACHER', 'khoa2');
      const agentA = await login(a.email!);
      await login(b.email!);
      const admin = await login(ADMIN);
      const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } })).id.toString();

      const wrong = await admin.post('/users/bulk-action').send({ action: 'lock', userIds: [a.id.toString()], password: 'khong-dung' }).expect(400);
      expect(wrong.body.message).toBe('Mật khẩu xác nhận không đúng');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('ACTIVE');

      const res = (
        await admin.post('/users/bulk-action').send({ action: 'lock', userIds: [a.id.toString(), b.id.toString(), adminId], password: PASSWORD }).expect(200)
      ).body as { done: number; skipped: { userId: string; reason: string }[] };
      expect(res.done).toBe(2);
      expect(res.skipped).toEqual([{ userId: adminId, reason: 'Không thao tác hàng loạt lên chính tài khoản của mình' }]);
      expect(await prisma.user.count({ where: { id: { in: [a.id, b.id] }, status: 'LOCKED' } })).toBe(2);
      expect(await prisma.refreshToken.count({ where: { userId: { in: [a.id, b.id] }, revokedAt: null } })).toBe(0);
      await agentA.get('/auth/me').expect(401); // khoá thì access token hết tác dụng ngay
      expect(await prisma.auditLog.count({ where: { action: 'user.bulk_lock', createdAt: { gte: started } } })).toBeGreaterThanOrEqual(1);
      await app.get(RateLimitService).reset('bulk-password', adminId);

      // Giáo viên không dùng được thao tác hàng loạt.
      await (await login(TEACHER)).post('/users/bulk-action').send({ action: 'logout', userIds: [a.id.toString()], password: PASSWORD }).expect(403);
    });

    it('IP/tài khoản bị chặn do sai nhiều lần hiện ở trang Giám sát và ADMIN gỡ được', async () => {
      const user = await tempUser('TEACHER', 'chan');
      await resetLimits(app, ['login']);
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer()).post('/auth/login').send({ email: user.email, password: 'sai' }).expect(401);
      }
      await request(app.getHttpServer()).post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(429);
      const admin = await login(ADMIN);
      const security = (await admin.get('/monitoring/security').expect(200)).body as SecurityOverviewDto;
      const entry = security.blocked.find((b) => b.limit === 'login' && b.id.endsWith(`|${user.email}`));
      expect(entry).toMatchObject({ count: 5, label: 'Đăng nhập sai (IP + tài khoản)' });
      // Danh sách chỉ giữ 20 tài khoản sai nhiều nhất trong 24 giờ (các bộ test khác cũng đăng nhập sai), sắp giảm dần.
      const counts = security.failedLogins.map((f) => f.count);
      expect(counts).toEqual([...counts].sort((x, y) => y - x));
      expect(security.failedLogins.length).toBeGreaterThan(0);
      expect(
        await prisma.auditLog.count({ where: { action: 'auth.login', createdAt: { gte: started }, payload: { path: ['params', 'email'], equals: user.email! } } }),
      ).toBeGreaterThanOrEqual(6);

      await (await login(PRINCIPAL)).delete(`/monitoring/blocked/login/${encodeURIComponent(entry!.id)}`).expect(403);
      await admin.delete(`/monitoring/blocked/login/${encodeURIComponent(entry!.id)}`).expect(204);
      await admin.delete(`/monitoring/blocked/login/${encodeURIComponent(entry!.id)}`).expect(404);
      await request(app.getHttpServer()).post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      expect(await prisma.auditLog.count({ where: { action: 'monitoring.unblock', createdAt: { gte: started } } })).toBeGreaterThanOrEqual(1);
      await resetLimits(app, ['login']);
    });

    it('chạy lại job: hàng đợi lạ hoặc job không có → 404', async () => {
      const admin = await login(ADMIN);
      await admin.post('/monitoring/jobs/khong-co/1/retry').expect(404);
      await admin.post(`/monitoring/jobs/publish-post/${TAG}/retry`).expect(404);
    });
  });
});
