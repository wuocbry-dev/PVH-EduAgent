// F16, F17 và dashboard – nhật ký hoạt động, cấu hình hệ thống, số liệu tổng quan. Cần PostgreSQL đã migrate + seed.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuditLogService } from './../src/features/audit-log/audit-log.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';

const TAG = `F16-${Date.now()}`;

describe('Nhật ký, cấu hình, dashboard (F16, F17, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    const { PrismaClient } = await import('./../src/generated/prisma/client.js');
    const { createPgAdapter } = await import(
      './../src/infrastructure/database/pg-adapter.js'
    );
    const db = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
    try {
      await db.task.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.category.deleteMany({ where: { name: { startsWith: TAG } } });
      await db.auditLog.deleteMany({ where: { action: { startsWith: TAG } } });
    } finally {
      await db.$disconnect();
    }
  });

  async function loginAs(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }
  type Agent = Awaited<ReturnType<typeof loginAs>>;
  const meId = async (agent: Agent) => (await agent.get('/auth/me')).body.id as string;

  describe('nhật ký hoạt động (F16)', () => {
    it('chưa đăng nhập → 401; chỉ ADMIN và BGH xem được, biên tập viên/giáo viên bị chặn (403)', async () => {
      await request(app.getHttpServer()).get('/audit-logs').expect(401);
      for (const email of [EDITOR, TEACHER]) {
        const agent = await loginAs(email);
        await agent.get('/audit-logs').expect(403);
        await agent.get('/audit-logs/filters').expect(403);
      }
      for (const email of [ADMIN, PRINCIPAL]) {
        const agent = await loginAs(email);
        const res = await agent.get('/audit-logs').query({ limit: 5 }).expect(200);
        expect(res.body.items.length).toBeGreaterThan(0);
        await agent.get('/audit-logs/filters').expect(200);
      }
    });

    it('thao tác qua web được ghi kèm IP, người thực hiện và payload JSON', async () => {
      const editor = await loginAs(EDITOR);
      const editorId = await meId(editor);
      const since = new Date(Date.now() - 1000).toISOString();
      const category = (await editor.post('/categories').send({ name: `${TAG} ip` }).expect(201)).body;
      const principal = await loginAs(PRINCIPAL);
      await principal
        .post('/tasks')
        .send({ title: `${TAG} việc`, assigneeId: editorId, dueAt: new Date(Date.now() + 3_600_000).toISOString() })
        .expect(201);

      const res = await principal.get('/audit-logs').query({ action: 'category.create', userId: editorId, from: since }).expect(200);
      const row = res.body.items.find((r: { targetId: string }) => r.targetId === category.id);
      expect(row).toMatchObject({
        channel: 'web',
        action: 'category.create',
        targetType: 'category',
        userId: editorId,
        userName: 'Biên tập viên',
      });
      expect(row.ip).toMatch(/127\.0\.0\.1|::1/);
      expect(row.payload).toMatchObject({ ok: true, params: { name: `${TAG} ip` } });

      // Đăng nhập và tạo việc cũng có IP.
      const login = await principal.get('/audit-logs').query({ action: 'auth.login', from: since }).expect(200);
      expect(login.body.items.length).toBeGreaterThan(0);
      expect(login.body.items.every((r: { ip: string | null }) => r.ip)).toBe(true);
      const task = await principal.get('/audit-logs').query({ action: 'task.create', from: since }).expect(200);
      expect(task.body.items[0].ip).toBeTruthy();
    });

    it('lọc theo kênh, người dùng, action và khoảng thời gian', async () => {
      const principal = await loginAs(PRINCIPAL);
      const editorId = await meId(await loginAs(EDITOR));
      const audit = app.get(AuditLogService);
      const before = new Date().toISOString();
      await audit.record({ userId: editorId, channel: 'scheduler', action: `${TAG}.chay-dinh-ky`, ok: true });
      await audit.record({ userId: editorId, channel: 'telegram', action: `${TAG}.tele`, ok: false, error: 'Thiếu quyền' });
      await audit.record({ userId: null, channel: 'web', action: `${TAG}.khong-nguoi-dung`, ok: true });
      const after = new Date(Date.now() + 1000).toISOString();
      const get = async (query: Record<string, string>) =>
        (await principal.get('/audit-logs').query({ action: TAG, ...query }).expect(200)).body.items as {
          action: string;
          userName: string | null;
          payload: { error?: string };
        }[];

      expect((await get({})).map((r) => r.action).sort()).toEqual(
        [`${TAG}.chay-dinh-ky`, `${TAG}.khong-nguoi-dung`, `${TAG}.tele`].sort(),
      );
      expect((await get({ channel: 'scheduler' })).map((r) => r.action)).toEqual([`${TAG}.chay-dinh-ky`]);
      const tele = await get({ channel: 'telegram' });
      expect(tele).toHaveLength(1);
      expect(tele[0].payload.error).toBe('Thiếu quyền');
      expect(await get({ userId: editorId })).toHaveLength(2);
      expect((await get({ action: `${TAG}.KHONG-NGUOI` })).map((r) => r.userName)).toEqual([null]);
      expect(await get({ from: before, to: after })).toHaveLength(3);
      expect(await get({ from: after })).toHaveLength(0);
      expect(await get({ channel: 'web', userId: editorId })).toHaveLength(0);

      const filters = (await principal.get('/audit-logs/filters').expect(200)).body;
      expect(filters.actions).toEqual(expect.arrayContaining([`${TAG}.tele`, 'auth.login']));
      expect(filters.users.some((u: { id: string; name: string }) => u.id === editorId && u.name === 'Biên tập viên')).toBe(true);
    });

    it('phân trang theo con trỏ: đủ dòng, không trùng, từ mới tới cũ, hết thì nextCursor = null', async () => {
      const principal = await loginAs(PRINCIPAL);
      const audit = app.get(AuditLogService);
      for (let i = 1; i <= 5; i++) {
        await audit.record({ userId: null, channel: 'scheduler', action: `${TAG}.trang.${i}`, ok: true });
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: request.Response = await principal
          .get('/audit-logs')
          .query({ action: `${TAG}.trang.`, limit: 2, ...(cursor ? { cursor } : {}) })
          .expect(200);
        const items = res.body.items as { id: string; action: string }[];
        expect(items.length).toBeLessThanOrEqual(2);
        seen.push(...items.map((r) => r.action));
        cursor = res.body.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(seen).toEqual([5, 4, 3, 2, 1].map((i) => `${TAG}.trang.${i}`));
      expect(new Set(seen).size).toBe(5);

      // Vừa đủ một trang thì không có trang sau.
      const exact = await principal.get('/audit-logs').query({ action: `${TAG}.trang.`, limit: 5 }).expect(200);
      expect(exact.body.items).toHaveLength(5);
      expect(exact.body.nextCursor).toBeNull();
    });

    it('tham số lọc sai bị từ chối (400)', async () => {
      const principal = await loginAs(PRINCIPAL);
      await principal.get('/audit-logs').query({ channel: 'email' }).expect(400);
      await principal.get('/audit-logs').query({ limit: 1000 }).expect(400);
      await principal.get('/audit-logs').query({ limit: 0 }).expect(400);
      await principal.get('/audit-logs').query({ userId: 'abc' }).expect(400);
      await principal.get('/audit-logs').query({ cursor: '-1' }).expect(400);
      await principal.get('/audit-logs').query({ from: 'hôm qua' }).expect(400);
      await principal.get('/audit-logs').query({ from: '2026-12-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }).expect(400);
    });
  });

  describe('cấu hình hệ thống (F17)', () => {
    const ORIGINAL = { 'school.name': 'Trường THPT Phan Văn Hớn', 'school.phone': '' };

    // Đưa các khóa test về trạng thái ban đầu để không ảnh hưởng test khác.
    async function restore(admin: Agent) {
      await admin
        .patch('/settings')
        .send({
          'school.name': ORIGINAL['school.name'],
          'school.phone': '',
          'school.email': '',
          'school.map_url': '',
          'report.daily_time': '17:00',
          'reminder.hours_before': '24',
        })
        .expect(200);
      await prisma.systemSetting.deleteMany({ where: { key: { in: ['report.daily_time', 'reminder.hours_before'] } } });
    }

    it('xem: ADMIN và BGH; sửa: chỉ ADMIN (BGH, biên tập viên, giáo viên bị 403)', async () => {
      const admin = await loginAs(ADMIN);
      const principal = await loginAs(PRINCIPAL);
      const list = (await principal.get('/settings').expect(200)).body as { key: string; label: string; value: string | null }[];
      expect(list.map((s) => s.key)).toEqual(
        expect.arrayContaining(['school.name', 'school.address', 'school.phone', 'school.email', 'report.daily_time', 'reminder.hours_before']),
      );
      expect(list.find((s) => s.key === 'school.name')?.value).toBe('Trường THPT Phan Văn Hớn');
      await admin.get('/settings').expect(200);

      await request(app.getHttpServer()).get('/settings').expect(401);
      for (const email of [EDITOR, TEACHER]) {
        const agent = await loginAs(email);
        await agent.get('/settings').expect(403);
        await agent.patch('/settings').send({ 'school.name': 'Trái phép' }).expect(403);
      }
      await principal.patch('/settings').send({ 'school.name': 'BGH sửa trái phép' }).expect(403);
      expect((await admin.get('/settings')).body.find((s: { key: string }) => s.key === 'school.name').value).toBe(
        'Trường THPT Phan Văn Hớn',
      );
    });

    it('ADMIN sửa cấu hình: lưu đúng, ghi audit kèm giá trị cũ/mới, hiện ở API công khai; để trống thì xóa', async () => {
      const admin = await loginAs(ADMIN);
      const adminId = await meId(admin);
      const since = new Date(Date.now() - 1000).toISOString();
      try {
        const res = await admin
          .patch('/settings')
          .send({
            'school.name': 'Trường THPT Phan Văn Hớn (thử)',
            'school.phone': '028 3883 1234',
            'report.daily_time': '07:30',
            'reminder.hours_before': '12',
          })
          .expect(200);
        const byKey = Object.fromEntries(res.body.map((s: { key: string; value: string | null }) => [s.key, s]));
        expect(byKey['school.name'].value).toBe('Trường THPT Phan Văn Hớn (thử)');
        expect(byKey['school.name'].updatedByName).toBeTruthy();
        expect(byKey['report.daily_time'].value).toBe('07:30');
        expect(byKey['reminder.hours_before'].value).toBe('12');
        expect(byKey['school.email'].value).toBeNull();
        expect(byKey['school.email'].defaultValue).toBe('');

        const pub = (await request(app.getHttpServer()).get('/public/settings').expect(200)).body;
        expect(pub).toMatchObject({ 'school.name': 'Trường THPT Phan Văn Hớn (thử)', 'school.phone': '028 3883 1234' });
        // Khóa nội bộ (giờ báo cáo, giờ nhắc việc) không bao giờ ra công khai.
        expect(pub).not.toHaveProperty('report.daily_time');
        expect(pub).not.toHaveProperty('reminder.hours_before');

        const log = (
          await admin.get('/audit-logs').query({ action: 'setting.update', userId: adminId, from: since }).expect(200)
        ).body.items[0];
        expect(log.ip).toBeTruthy();
        expect(log.payload.params.changes['school.name']).toEqual({
          from: 'Trường THPT Phan Văn Hớn',
          to: 'Trường THPT Phan Văn Hớn (thử)',
        });
        expect(log.payload.params.changes['school.phone']).toEqual({ from: null, to: '028 3883 1234' });

        // Để trống khóa optional = xóa, công khai quay về "Đang cập nhật".
        await admin.patch('/settings').send({ 'school.phone': '' }).expect(200);
        const pub2 = (await request(app.getHttpServer()).get('/public/settings').expect(200)).body;
        expect(pub2).not.toHaveProperty('school.phone');

        // Không đổi gì thì không ghi thêm audit log.
        const count = () => prisma.auditLog.count({ where: { action: 'setting.update', userId: BigInt(adminId), createdAt: { gte: new Date(since) } } });
        const before = await count();
        await admin.patch('/settings').send({ 'school.name': 'Trường THPT Phan Văn Hớn (thử)' }).expect(200);
        expect(await count()).toBe(before);
      } finally {
        await restore(admin);
      }
    });

    it('khóa lạ và bí mật bị từ chối; giá trị sai bị từ chối kèm thông báo', async () => {
      const admin = await loginAs(ADMIN);
      const secret = 'sk-ant-api03-khong-duoc-luu';
      for (const key of ['anthropic.api_key', 'jwt.secret', 'telegram.bot_token', 'khoa.la']) {
        await admin.patch('/settings').send({ [key]: secret }).expect(400);
        expect(await prisma.systemSetting.count({ where: { key } })).toBe(0);
      }
      // Trộn khóa hợp lệ với khóa lạ: toàn bộ yêu cầu bị từ chối, khóa hợp lệ không được áp dụng.
      await admin.patch('/settings').send({ 'school.name': 'Không được lưu', 'khoa.la': 'x' }).expect(400);
      expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'school.name' } })).value).toBe(
        'Trường THPT Phan Văn Hớn',
      );

      await admin.patch('/settings').send({}).expect(400);
      await admin.patch('/settings').send({ 'school.name': '' }).expect(400);
      await admin.patch('/settings').send({ 'school.name': 'a'.repeat(151) }).expect(400);
      await admin.patch('/settings').send({ 'school.phone': 'abc' }).expect(400);
      await admin.patch('/settings').send({ 'school.email': 'khong-phai-email' }).expect(400);
      await admin.patch('/settings').send({ 'school.map_url': 'http://khong-bao-mat.example' }).expect(400);
      await admin.patch('/settings').send({ 'school.map_url': 'javascript:alert(1)' }).expect(400);
      const badTime = await admin.patch('/settings').send({ 'report.daily_time': '25:00' }).expect(400);
      expect(JSON.stringify(badTime.body)).toMatch(/HH:mm/);
      await admin.patch('/settings').send({ 'report.daily_time': '7h30' }).expect(400);
      await admin.patch('/settings').send({ 'reminder.hours_before': '0' }).expect(400);
      await admin.patch('/settings').send({ 'reminder.hours_before': '169' }).expect(400);
      await admin.patch('/settings').send({ 'reminder.hours_before': 'hai' }).expect(400);
    });
  });

  describe('dashboard', () => {
    it('hiển thị số liệu thật từ CSDL theo quyền của từng vai trò', async () => {
      const [pending, scheduled, contactsNew, overdueAll] = await Promise.all([
        prisma.post.count({ where: { status: 'PENDING_REVIEW' } }),
        prisma.post.count({ where: { status: 'SCHEDULED' } }),
        prisma.contact.count({ where: { status: 'NEW' } }),
        prisma.task.count({ where: { status: { not: 'DONE' }, dueAt: { lt: new Date() } } }),
      ]);

      const principal = await loginAs(PRINCIPAL);
      const full = (await principal.get('/system/dashboard').expect(200)).body;
      expect(full).toMatchObject({
        postsPendingReview: pending,
        postsScheduled: scheduled,
        contactsNew,
        tasksOverdue: overdueAll,
        tasksOverdueScope: 'all',
      });
      expect(full.system).toMatchObject({ database: 'ok' });
      expect(full.system.uptimeSec).toBeGreaterThanOrEqual(0);

      // Biên tập viên: có số liệu bài/liên hệ/việc toàn trường nhưng không có tình trạng hệ thống.
      const editor = await loginAs(EDITOR);
      const ed = (await editor.get('/system/dashboard').expect(200)).body;
      expect(ed).toMatchObject({ postsPendingReview: pending, contactsNew, tasksOverdueScope: 'all' });
      expect(ed).not.toHaveProperty('system');

      // Giáo viên: chỉ đếm việc quá hạn của chính mình.
      const teacher = await loginAs(TEACHER);
      const teacherId = await meId(teacher);
      const own = await prisma.task.count({
        where: { assigneeId: BigInt(teacherId), status: { not: 'DONE' }, dueAt: { lt: new Date() } },
      });
      const tc = (await teacher.get('/system/dashboard').expect(200)).body;
      expect(tc).toEqual({ tasksOverdue: own, tasksOverdueScope: 'own' });

      await request(app.getHttpServer()).get('/system/dashboard').expect(401);
    });

    it('số liệu đổi theo dữ liệu: thêm bài chờ duyệt, liên hệ mới và việc quá hạn', async () => {
      const principal = await loginAs(PRINCIPAL);
      const before = (await principal.get('/system/dashboard')).body;

      const editor = await loginAs(EDITOR);
      const post = (
        await editor.post('/posts').send({ title: `${TAG} chờ duyệt`, content: '<p>Nội dung</p>' }).expect(201)
      ).body;
      await editor.post(`/posts/${post.id}/submit`).expect(200);
      await prisma.contact.create({ data: { fullName: TAG, subject: TAG, message: 'Nội dung liên hệ thử' } });
      const task = await prisma.task.create({
        data: {
          title: `${TAG} quá hạn`,
          createdBy: BigInt(await meId(principal)),
          assigneeId: BigInt(await meId(editor)),
          dueAt: new Date(Date.now() - 3_600_000),
        },
      });

      try {
        const after = (await principal.get('/system/dashboard')).body;
        expect(after.postsPendingReview).toBe(before.postsPendingReview + 1);
        expect(after.contactsNew).toBe(before.contactsNew + 1);
        expect(after.tasksOverdue).toBe(before.tasksOverdue + 1);
      } finally {
        await prisma.task.delete({ where: { id: task.id } });
        await prisma.contact.deleteMany({ where: { subject: TAG } });
        await prisma.post.deleteMany({ where: { title: { startsWith: TAG } } });
      }
    });
  });
});
