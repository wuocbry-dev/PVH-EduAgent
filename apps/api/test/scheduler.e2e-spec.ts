// A05, A06, A09 – bộ lập lịch Redis + BullMQ. Cần PostgreSQL và Redis đang chạy (REDIS_URL).
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { DailyReportProcessor } from './../src/features/scheduler/daily-report.processor.js';
import { DeadlineReminderProcessor } from './../src/features/scheduler/deadline-reminder.processor.js';
import { PublishPostProcessor } from './../src/features/scheduler/publish-post.processor.js';
import { SchedulerService } from './../src/features/scheduler/scheduler.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import {
  PUBLISH_QUEUE,
  REPORT_QUEUE,
  DEADLINE_QUEUE,
  publishJobId,
  SCHEDULER_DAILY_REPORT,
  SCHEDULER_DEADLINE_SCAN,
  SCHEDULER_PUBLISH_SWEEP,
} from './../src/infrastructure/queue/queue.constants.js';
import { QueueService } from './../src/infrastructure/queue/queue.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';

const TAG = `F05B-${Date.now()}`;
const HOUR = 3_600_000;
const inMs = (ms: number) => new Date(Date.now() + ms);

describe('Bộ lập lịch BullMQ (A05, A06, A09, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let queues: QueueService;
  let publisher: PublishPostProcessor;
  let deadlines: DeadlineReminderProcessor;
  let reports: DailyReportProcessor;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    queues = app.get(QueueService);
    publisher = app.get(PublishPostProcessor, { strict: false });
    deadlines = app.get(DeadlineReminderProcessor, { strict: false });
    reports = app.get(DailyReportProcessor, { strict: false });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  afterAll(async () => {
    const { PrismaClient } = await import('./../src/generated/prisma/client.js');
    const { createPgAdapter } = await import('./../src/infrastructure/database/pg-adapter.js');
    const db = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
    try {
      await db.notification.deleteMany({
        where: { OR: [{ body: { contains: TAG } }, { title: { endsWith: '/2031' } }] },
      });
      await db.post.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.task.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.auditLog.deleteMany({
        where: { action: { in: ['post.publish', 'task.deadline_scan', 'report.daily'] }, channel: 'scheduler', createdAt: { gte: new Date(START) } },
      });
      await db.systemSetting.deleteMany({ where: { key: { in: ['reminder.hours_before', 'report.daily_time'] } } });
    } finally {
      await db.$disconnect();
    }
  });
  const START = Date.now() - 1000;

  async function loginAs(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }
  type Agent = Awaited<ReturnType<typeof loginAs>>;
  const meId = async (agent: Agent) => (await agent.get('/auth/me')).body.id as string;

  // Tạo bài ở trạng thái SCHEDULED với giờ đăng `publishAt` (biên tập viên tự gửi duyệt và duyệt).
  async function scheduledPost(editor: Agent, name: string, publishAt: Date) {
    const post = (
      await editor.post('/posts').send({ title: `${TAG} ${name}`, content: '<p>Nội dung hẹn giờ</p>' }).expect(201)
    ).body as { id: string; slug: string };
    await editor.post(`/posts/${post.id}/submit`).expect(200);
    await editor
      .post(`/posts/${post.id}/approve`)
      .send({ publishAt: publishAt.toISOString() })
      .expect(200);
    return post;
  }

  const statusOf = async (id: string) =>
    (await prisma.post.findUniqueOrThrow({ where: { id: BigInt(id) } })).status;
  const publishJob = (id: string) => queues.queue(PUBLISH_QUEUE)!.getJob(publishJobId(id));
  const run = (id: string) => publisher.process({ name: 'publish', data: { postId: id } });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  describe('A05 – tự đăng bài hẹn giờ', () => {
    it('duyệt kèm hẹn giờ tạo job trễ đúng giờ (jobId theo bài, retry 3 lần); đổi lịch thì thay job; hủy lịch hoặc đăng ngay thì gỡ job', async () => {
      const editor = await loginAs(EDITOR);
      const first = inMs(2 * HOUR);
      const post = await scheduledPost(editor, 'job', first);

      const job = await publishJob(post.id);
      expect(job).toBeTruthy();
      expect(await job!.getState()).toBe('delayed');
      expect(job!.id).toBe(`post-${post.id}`);
      expect(job!.opts.attempts).toBe(3);
      expect(job!.opts.backoff).toMatchObject({ type: 'exponential' });
      expect(Math.abs((job!.opts.delay ?? 0) - 2 * HOUR)).toBeLessThan(15_000);

      // Dời lịch: job được thay, không có hai job cho cùng một bài.
      await editor.post(`/posts/${post.id}/reschedule`).send({ publishAt: inMs(5 * HOUR).toISOString() }).expect(200);
      const moved = await publishJob(post.id);
      expect(Math.abs((moved!.opts.delay ?? 0) - 5 * HOUR)).toBeLessThan(15_000);
      const delayed = await queues.queue(PUBLISH_QUEUE)!.getDelayed();
      expect(delayed.filter((j) => j.id === `post-${post.id}`)).toHaveLength(1);

      // Hủy lịch: job biến mất.
      await editor.post(`/posts/${post.id}/cancel-schedule`).expect(200);
      expect(await publishJob(post.id)).toBeFalsy();

      // Đăng ngay từ bài đang hẹn giờ: cũng gỡ job.
      const other = await scheduledPost(editor, 'đăng ngay', inMs(3 * HOUR));
      expect(await publishJob(other.id)).toBeTruthy();
      await editor.post(`/posts/${other.id}/publish`).expect(200);
      expect(await publishJob(other.id)).toBeFalsy();
    });

    it('processor (giả lập thời gian): chưa tới giờ thì không đăng; tới giờ thì PUBLISHED + published_at; gọi lại vẫn an toàn', async () => {
      const editor = await loginAs(EDITOR);
      const authorId = await meId(editor);
      const publishAt = inMs(2 * HOUR);
      const post = await scheduledPost(editor, 'processor', publishAt);

      expect(await run(post.id)).toBe('early'); // chưa tới giờ
      expect(await statusOf(post.id)).toBe('SCHEDULED');

      const fakeNow = new Date(publishAt.getTime() + 1000);
      vi.useFakeTimers({ toFake: ['Date'], now: fakeNow });
      expect(await run(post.id)).toBe('published');
      vi.useRealTimers();

      const published = await prisma.post.findUniqueOrThrow({ where: { id: BigInt(post.id) } });
      expect(published.status).toBe('PUBLISHED');
      expect(published.publishedAt?.getTime()).toBe(fakeNow.getTime());
      expect(published.publishAt).toBeNull();

      const audits = await prisma.auditLog.findMany({
        where: { action: 'post.publish', targetId: BigInt(post.id), channel: 'scheduler' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].payload).toMatchObject({ ok: true, params: { auto: true } });
      const notes = await prisma.notification.findMany({ where: { userId: BigInt(authorId), body: { contains: post.id ? `${TAG} processor` : '' } } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ title: 'Đã đăng bài', channel: 'telegram', sentAt: null });

      // Chạy lại (retry, job trùng): không đăng thêm, không ghi thêm.
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(fakeNow.getTime() + 60_000) });
      expect(await run(post.id)).toBe('skipped');
      vi.useRealTimers();
      expect(await prisma.auditLog.count({ where: { action: 'post.publish', targetId: BigInt(post.id), channel: 'scheduler' } })).toBe(1);
      expect((await prisma.post.findUniqueOrThrow({ where: { id: BigInt(post.id) } })).publishedAt?.getTime()).toBe(fakeNow.getTime());
    });

    it('bài đã hủy lịch hoặc dời lịch thì job cũ không đăng nữa', async () => {
      const editor = await loginAs(EDITOR);
      const t1 = inMs(2 * HOUR);
      const cancelled = await scheduledPost(editor, 'hủy', t1);
      await editor.post(`/posts/${cancelled.id}/cancel-schedule`).expect(200);

      const t2 = inMs(2 * HOUR);
      const moved = await scheduledPost(editor, 'dời', t2);
      const t3 = inMs(5 * HOUR);
      await editor.post(`/posts/${moved.id}/reschedule`).send({ publishAt: t3.toISOString() }).expect(200);

      // Đồng hồ chạy tới giờ cũ (hơn 2 giờ): job cũ nếu còn chạy cũng không được đăng.
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(t2.getTime() + 5000) });
      expect(await run(cancelled.id)).toBe('skipped');
      expect(await run(moved.id)).toBe('early');
      vi.useRealTimers();
      expect(await statusOf(cancelled.id)).toBe('DRAFT');
      expect(await statusOf(moved.id)).toBe('SCHEDULED');

      // Tới giờ mới thì bài dời lịch mới được đăng.
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(t3.getTime() + 1000) });
      expect(await run(moved.id)).toBe('published');
      vi.useRealTimers();
      expect(await statusOf(moved.id)).toBe('PUBLISHED');
    });

    it('worker thật: hẹn giờ vài giây thì bài tự chuyển PUBLISHED đúng giờ (sai lệch dưới 1 phút)', async () => {
      const editor = await loginAs(EDITOR);
      const publishAt = inMs(3000);
      const post = await scheduledPost(editor, 'worker thật', publishAt);
      expect(await statusOf(post.id)).toBe('SCHEDULED');

      let status = 'SCHEDULED';
      for (let i = 0; i < 40 && status !== 'PUBLISHED'; i++) {
        await sleep(500);
        status = await statusOf(post.id);
      }
      expect(status).toBe('PUBLISHED');
      const published = await prisma.post.findUniqueOrThrow({ where: { id: BigInt(post.id) } });
      const lag = published.publishedAt!.getTime() - publishAt.getTime();
      expect(lag).toBeGreaterThanOrEqual(-1000);
      expect(lag).toBeLessThan(60_000);
      // Bài chuyển PUBLISHED ngay trong processor; job chỉ được dọn sau khi processor ghi xong thông báo/audit.
      await vi.waitFor(async () => expect(await publishJob(post.id)).toBeFalsy(), { timeout: 5000, interval: 200 });
      // Trang công khai thấy bài.
      await request(app.getHttpServer()).get(`/public/posts/${post.slug}`).expect(200);
    }, 30_000);

    it('khởi động lại: đăng bù bài đã quá giờ và dựng lại job bị mất của bài sắp tới', async () => {
      const editor = await loginAs(EDITOR);
      const overdue = await scheduledPost(editor, 'quá giờ lúc tắt máy', inMs(2 * HOUR));
      // Giả lập máy chủ tắt qua giờ đăng: dời publish_at về quá khứ trong CSDL và bỏ job.
      await prisma.post.update({ where: { id: BigInt(overdue.id) }, data: { publishAt: inMs(-5 * 60_000) } });
      await (await publishJob(overdue.id))?.remove();

      const upcoming = await scheduledPost(editor, 'sắp tới mất job', inMs(4 * HOUR));
      await (await publishJob(upcoming.id))?.remove();
      expect(await publishJob(upcoming.id)).toBeFalsy();

      const result = await app.get(SchedulerService, { strict: false }).catchUp();
      expect(Number(result.published.split('/')[0])).toBeGreaterThanOrEqual(1);
      expect(result.rescheduled).toBeGreaterThanOrEqual(1);

      const posted = await prisma.post.findUniqueOrThrow({ where: { id: BigInt(overdue.id) } });
      expect(posted.status).toBe('PUBLISHED');
      expect(Date.now() - posted.publishedAt!.getTime()).toBeLessThan(60_000);
      const restored = await publishJob(upcoming.id);
      expect(restored).toBeTruthy();
      expect(Math.abs((restored!.opts.delay ?? 0) - 4 * HOUR)).toBeLessThan(15_000);
      expect(await statusOf(upcoming.id)).toBe('SCHEDULED');
    });

    it('hết lượt thử vẫn lỗi: ghi audit lỗi và cảnh báo ADMIN; chưa hết lượt thì chưa cảnh báo', async () => {
      const adminId = await meId(await loginAs(ADMIN));
      const postId = '987654321';
      const before = await prisma.notification.count({ where: { userId: BigInt(adminId), title: 'Lỗi đăng bài tự động' } });

      await publisher.onFinalFailure({ name: 'publish', data: { postId }, attemptsMade: 1, opts: { attempts: 3 } }, new Error('Mất kết nối'));
      expect(await prisma.notification.count({ where: { userId: BigInt(adminId), title: 'Lỗi đăng bài tự động' } })).toBe(before);

      await publisher.onFinalFailure({ name: 'publish', data: { postId }, attemptsMade: 3, opts: { attempts: 3 } }, new Error(`${TAG} hỏng`));
      const alert = await prisma.notification.findFirst({
        where: { userId: BigInt(adminId), title: 'Lỗi đăng bài tự động' },
        orderBy: { id: 'desc' },
      });
      expect(alert?.body).toContain(`${TAG} hỏng`);
      expect(await prisma.notification.count({ where: { userId: BigInt(adminId), title: 'Lỗi đăng bài tự động' } })).toBe(before + 1);
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'post.publish', channel: 'scheduler', targetId: BigInt(postId) },
        orderBy: { id: 'desc' },
      });
      expect(audit?.payload).toMatchObject({ ok: false, error: `${TAG} hỏng` });
      await prisma.auditLog.deleteMany({ where: { targetId: BigInt(postId) } });
      await prisma.notification.deleteMany({ where: { body: { contains: `${TAG} hỏng` } } });
    });
  });

  describe('A06 – nhắc hạn chót và đánh dấu OVERDUE', () => {
    async function makeTasks(assigneeId: bigint, creatorId: bigint, specs: { name: string; dueMs: number; status?: 'TODO' | 'DONE' }[]) {
      const tasks = [];
      for (const s of specs) {
        tasks.push(
          await prisma.task.create({
            data: { title: `${TAG} ${s.name}`, createdBy: creatorId, assigneeId, status: s.status ?? 'TODO', dueAt: inMs(s.dueMs) },
          }),
        );
      }
      return tasks;
    }
    const reminders = (taskId: bigint) => prisma.taskReminder.findMany({ where: { taskId }, orderBy: { id: 'asc' } });
    const noteCount = (userId: bigint, titleStart: string, name: string) =>
      prisma.notification.count({ where: { userId, title: { startsWith: titleStart }, body: { contains: `${TAG} ${name}` } } });

    it('đánh dấu OVERDUE, nhắc trước X giờ (X lấy từ cấu hình) và không bao giờ nhắc trùng', async () => {
      const teacher = BigInt(await meId(await loginAs(TEACHER)));
      const principal = BigInt(await meId(await loginAs(PRINCIPAL)));
      const [late, soon, far, doneLate] = await makeTasks(teacher, principal, [
        { name: 'trễ hạn', dueMs: -HOUR },
        { name: 'sắp tới', dueMs: 5 * HOUR },
        { name: 'còn xa', dueMs: 100 * HOUR },
        { name: 'xong rồi', dueMs: -HOUR, status: 'DONE' },
      ]);

      const first = await deadlines.run();
      expect(first.markedOverdue).toBeGreaterThanOrEqual(1);
      const status = async (id: bigint) => (await prisma.task.findUniqueOrThrow({ where: { id } })).status;
      expect(await status(late.id)).toBe('OVERDUE');
      expect(await status(soon.id)).toBe('TODO');
      expect(await status(doneLate.id)).toBe('DONE'); // việc đã xong không bị đụng tới

      expect((await reminders(late.id)).map((r) => r.remindType)).toEqual(['OVERDUE']);
      expect((await reminders(soon.id)).map((r) => r.remindType)).toEqual(['BEFORE_DUE']); // 5 giờ < 24 giờ mặc định
      expect(await reminders(far.id)).toHaveLength(0);
      expect(await reminders(doneLate.id)).toHaveLength(0);
      expect(await noteCount(teacher, 'Công việc đã quá hạn', 'trễ hạn')).toBe(1);
      expect(await noteCount(teacher, 'Sắp đến hạn', 'sắp tới')).toBe(1);
      expect(await noteCount(teacher, 'Sắp đến hạn', 'còn xa')).toBe(0);

      // Quét lại (và quét chồng nhau): không nhắc trùng, không tạo thêm mốc.
      const [a, b] = await Promise.all([deadlines.run(), deadlines.run()]);
      expect(a.overdueNotified + b.overdueNotified + a.dueSoonNotified + b.dueSoonNotified).toBe(0);
      expect(await reminders(late.id)).toHaveLength(1);
      expect(await reminders(soon.id)).toHaveLength(1);
      expect(await noteCount(teacher, 'Công việc đã quá hạn', 'trễ hạn')).toBe(1);
      expect(await noteCount(teacher, 'Sắp đến hạn', 'sắp tới')).toBe(1);

      // Tăng X lên 120 giờ trong cấu hình: việc "còn xa" (100 giờ) giờ cũng được nhắc.
      await prisma.systemSetting.upsert({
        where: { key: 'reminder.hours_before' },
        update: { value: '120' },
        create: { key: 'reminder.hours_before', value: '120' },
      });
      try {
        await deadlines.run();
        expect((await reminders(far.id)).map((r) => r.remindType)).toEqual(['BEFORE_DUE']);
        expect(await noteCount(teacher, 'Sắp đến hạn', 'còn xa')).toBe(1);
      } finally {
        await prisma.systemSetting.delete({ where: { key: 'reminder.hours_before' } });
      }
    });

    it('hai lần quét chạy song song trên việc mới chỉ nhắc đúng một lần', async () => {
      const teacher = BigInt(await meId(await loginAs(TEACHER)));
      const principal = BigInt(await meId(await loginAs(PRINCIPAL)));
      const [task] = await makeTasks(teacher, principal, [{ name: 'song song', dueMs: 2 * HOUR }]);
      await Promise.all([deadlines.run(), deadlines.run(), deadlines.run()]);
      expect(await reminders(task.id)).toHaveLength(1);
      expect(await noteCount(teacher, 'Sắp đến hạn', 'song song')).toBe(1);
    });

    it('đổi hạn sang tương lai thì việc OVERDUE mở lại và được nhắc lại cho hạn mới', async () => {
      const principalAgent = await loginAs(PRINCIPAL);
      const teacher = BigInt(await meId(await loginAs(TEACHER)));
      const principal = BigInt(await meId(principalAgent));
      const [task] = await makeTasks(teacher, principal, [{ name: 'gia hạn', dueMs: -HOUR }]);
      await deadlines.run();
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('OVERDUE');
      expect((await reminders(task.id)).map((r) => r.remindType)).toEqual(['OVERDUE']);

      const res = await principalAgent.patch(`/tasks/${task.id}`).send({ dueAt: inMs(3 * HOUR).toISOString() }).expect(200);
      expect(res.body).toMatchObject({ status: 'TODO', overdue: false });
      expect(await reminders(task.id)).toHaveLength(0); // mốc nhắc cũ đã xóa

      await deadlines.run();
      expect((await reminders(task.id)).map((r) => r.remindType)).toEqual(['BEFORE_DUE']);

      // Sửa tiêu đề mà không đổi hạn thì không xóa mốc nhắc.
      await principalAgent.patch(`/tasks/${task.id}`).send({ title: `${TAG} gia hạn (đã đổi tên)` }).expect(200);
      expect(await reminders(task.id)).toHaveLength(1);
    });
  });

  describe('A09 – báo cáo hằng ngày', () => {
    it('gửi cho ADMIN và BGH (không gửi cho biên tập viên/giáo viên), đúng ngày giờ Việt Nam, nội dung khớp CSDL, không gửi trùng', async () => {
      const adminId = BigInt(await meId(await loginAs(ADMIN)));
      const principalId = BigInt(await meId(await loginAs(PRINCIPAL)));
      const editorId = BigInt(await meId(await loginAs(EDITOR)));
      const teacherId = BigInt(await meId(await loginAs(TEACHER)));

      // 17:30 UTC ngày 05/03/2031 = 00:30 ngày 06/03/2031 theo giờ Việt Nam.
      const now = new Date('2031-03-05T17:30:00Z');
      const title = 'Báo cáo ngày 06/03/2031';
      const task = await prisma.task.create({
        data: { title: `${TAG} việc trong ngày`, createdBy: principalId, assigneeId: teacherId, dueAt: new Date('2031-03-06T09:00:00Z') }, // 16:00 VN
      });
      const post = await prisma.post.create({
        data: {
          title: `${TAG} bài hẹn trong ngày`,
          slug: `${TAG.toLowerCase()}-bai-hen`,
          content: '<p>x</p>',
          authorId: editorId,
          status: 'SCHEDULED',
          publishAt: new Date('2031-03-06T03:00:00Z'), // 10:00 VN
        },
      });

      const result = await reports.run(now);
      expect(result.title).toBe(title);
      expect(result.sent).toBe(result.recipients);
      expect(result.recipients).toBeGreaterThanOrEqual(2);

      const dueToday = await prisma.task.count({
        where: { status: { not: 'DONE' }, dueAt: { gte: new Date('2031-03-05T17:00:00Z'), lt: new Date('2031-03-06T17:00:00Z') } },
      });
      const overdue = await prisma.task.count({ where: { status: { not: 'DONE' }, dueAt: { lt: now } } });
      const pending = await prisma.post.count({ where: { status: 'PENDING_REVIEW' } });
      expect(result.body).toContain(`Việc đến hạn hôm nay: ${dueToday}`);
      expect(result.body).toContain(`${TAG} việc trong ngày (Giáo viên Toán, hạn 16:00)`);
      expect(result.body).toContain(`Việc đã quá hạn: ${overdue}`);
      expect(result.body).toContain(`${TAG} bài hẹn trong ngày (10:00)`);
      expect(result.body).toContain(`Bài đang chờ duyệt: ${pending}`);
      expect(result.body).toMatch(/⚠️ Cảnh báo hệ thống:[\s\S]*quá hạn/); // có việc quá hạn so với năm 2031

      const received = (userId: bigint) => prisma.notification.findMany({ where: { userId, title } });
      for (const id of [adminId, principalId]) {
        const rows = await received(id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ channel: 'telegram', sentAt: null });
        expect(rows[0].body).toBe(result.body);
      }
      expect(await received(editorId)).toHaveLength(0);
      expect(await received(teacherId)).toHaveLength(0);

      // Chạy lại cùng ngày: không gửi trùng.
      const again = await reports.run(new Date('2031-03-06T02:00:00Z'));
      expect(again.title).toBe(title);
      expect(again.sent).toBe(0);
      expect(await received(adminId)).toHaveLength(1);

      // Ngày khác thì gửi bản mới.
      const next = await reports.run(new Date('2031-03-07T00:00:00Z'));
      expect(next.title).toBe('Báo cáo ngày 07/03/2031');
      expect(next.sent).toBe(next.recipients);

      const log = await prisma.auditLog.findFirst({ where: { action: 'report.daily', channel: 'scheduler' }, orderBy: { id: 'desc' } });
      expect(log?.payload).toMatchObject({ ok: true });
      await prisma.task.delete({ where: { id: task.id } });
      await prisma.post.delete({ where: { id: post.id } });
    });
  });

  describe('đăng ký lịch và tình trạng hàng đợi', () => {
    it('đăng ký sẵn job lặp: quét bù mỗi phút, quét hạn chót, báo cáo ngày theo giờ Việt Nam (mặc định 07:00)', async () => {
      const sweep = await queues.queue(PUBLISH_QUEUE)!.getJobScheduler(SCHEDULER_PUBLISH_SWEEP);
      expect(sweep?.every).toBe(60_000);
      const scan = await queues.queue(DEADLINE_QUEUE)!.getJobScheduler(SCHEDULER_DEADLINE_SCAN);
      expect(scan?.pattern).toBe('*/5 * * * *');
      const report = await queues.queue(REPORT_QUEUE)!.getJobScheduler(SCHEDULER_DAILY_REPORT);
      expect(report).toMatchObject({ pattern: '0 7 * * *', tz: 'Asia/Ho_Chi_Minh' });
    });

    it('ADMIN đổi giờ báo cáo ở cấu hình thì lịch được đăng ký lại ngay', async () => {
      const admin = await loginAs(ADMIN);
      try {
        await admin.patch('/settings').send({ 'report.daily_time': '07:30' }).expect(200);
        expect(await queues.queue(REPORT_QUEUE)!.getJobScheduler(SCHEDULER_DAILY_REPORT)).toMatchObject({ pattern: '30 7 * * *', tz: 'Asia/Ho_Chi_Minh' });
        await admin.patch('/settings').send({ 'report.daily_time': '18:05' }).expect(200);
        expect((await queues.queue(REPORT_QUEUE)!.getJobScheduler(SCHEDULER_DAILY_REPORT))?.pattern).toBe('5 18 * * *');
      } finally {
        await admin.patch('/settings').send({ 'report.daily_time': '07:00' }).expect(200);
        await prisma.systemSetting.deleteMany({ where: { key: 'report.daily_time' } });
        await queues.scheduleDailyReport('07:00');
      }
    });

    it('get_system_status và dashboard có tình trạng hàng đợi', async () => {
      const principal = await loginAs(PRINCIPAL);
      const status = (await principal.get('/system/status').expect(200)).body;
      expect(status.queue.enabled).toBe(true);
      expect(status.queue.queues.map((q: { name: string }) => q.name).sort()).toEqual([DEADLINE_QUEUE, PUBLISH_QUEUE, REPORT_QUEUE].sort());
      const publish = status.queue.queues.find((q: { name: string }) => q.name === PUBLISH_QUEUE);
      expect(publish).toMatchObject({ waiting: expect.any(Number), delayed: expect.any(Number), active: expect.any(Number), failed: expect.any(Number) });
      expect(publish.delayed).toBeGreaterThanOrEqual(1); // job lặp quét bù luôn ở trạng thái chờ

      const dashboard = (await principal.get('/system/dashboard').expect(200)).body;
      expect(dashboard.system.queue.enabled).toBe(true);
      expect(dashboard.system.queue.queues).toHaveLength(3);
    });
  });
});
