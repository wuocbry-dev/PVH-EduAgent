// F14, F15 – công việc, hạn chót, lịch sự kiện và tool agent. Cần PostgreSQL đã migrate + seed.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { withAudit } from './../src/features/agent/with-audit.js';
import { AuditLogService } from './../src/features/audit-log/audit-log.service.js';
import { TasksAgentTools } from './../src/features/tasks/tasks.agent-tools.js';
import { UsersService } from './../src/features/users/users.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';

const TAG = `F14-${Date.now()}`;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('Công việc, hạn chót, lịch sự kiện (F14, F15, e2e)', () => {
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
      await db.event.deleteMany({ where: { title: { startsWith: TAG } } });
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

  // Tạo một việc (bằng BGH) giao cho `assigneeId`.
  async function createTask(
    principal: Agent,
    name: string,
    assigneeId: string,
    extra: object = {},
  ) {
    const res = await principal
      .post('/tasks')
      .send({ title: `${TAG} ${name}`, assigneeId, dueAt: inHours(24), ...extra })
      .expect(201);
    return res.body as {
      id: string;
      status: string;
      overdue: boolean;
      completedAt: string | null;
      priority: string;
      assigneeName: string;
      createdByName: string;
    };
  }

  const auditCount = (action: string, id: string) =>
    prisma.auditLog.count({ where: { action, targetId: BigInt(id) } });

  describe('công việc', () => {
    it('chưa đăng nhập → 401', async () => {
      await request(app.getHttpServer()).get('/tasks').expect(401);
      await request(app.getHttpServer()).post('/tasks').send({}).expect(401);
    });

    it('chỉ người có task:assign giao/sửa/xóa việc; giáo viên và biên tập viên bị từ chối (403)', async () => {
      const principal = await loginAs(PRINCIPAL);
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const teacherId = await meId(teacher);
      const task = await createTask(principal, 'quyền', teacherId);

      for (const agent of [teacher, editor]) {
        await agent
          .post('/tasks')
          .send({ title: `${TAG} trái phép`, assigneeId: teacherId, dueAt: inHours(5) })
          .expect(403);
        await agent.patch(`/tasks/${task.id}`).send({ title: 'Sửa trái phép' }).expect(403);
        await agent.delete(`/tasks/${task.id}`).expect(403);
      }
      await teacher.get('/tasks/assignees').expect(403);
      expect((await editor.get('/tasks/assignees').expect(200)).body.length).toBeGreaterThan(1);
    });

    it('BGH tạo việc → có đủ trường, ghi audit; dữ liệu sai bị từ chối', async () => {
      const principal = await loginAs(PRINCIPAL);
      const teacherId = await meId(await loginAs(TEACHER));
      const task = await createTask(principal, 'tạo', teacherId, { priority: 'HIGH', description: '<b>Nộp</b> kế hoạch' });
      expect(task).toMatchObject({
        status: 'TODO',
        priority: 'HIGH',
        overdue: false,
        completedAt: null,
        assigneeName: 'Giáo viên Toán',
      });
      expect(task.createdByName).toBeTruthy();
      expect((await principal.get(`/tasks/${task.id}`).expect(200)).body.description).toBe('Nộp kế hoạch');
      expect(await auditCount('task.create', task.id)).toBe(1);

      const bad = { title: `${TAG} sai`, assigneeId: teacherId, dueAt: inHours(5) };
      await principal.post('/tasks').send({ ...bad, title: '' }).expect(400);
      await principal.post('/tasks').send({ ...bad, priority: 'KHAN' }).expect(400);
      await principal.post('/tasks').send({ ...bad, dueAt: 'ngày mai' }).expect(400);
      await principal.post('/tasks').send({ ...bad, assigneeId: '999999999' }).expect(400);
      await principal.post('/tasks').send({ ...bad, assigneeId: 'abc' }).expect(400);
    });

    it('người phụ trách đổi trạng thái việc của mình; DONE ghi completed_at, mở lại thì xóa', async () => {
      const principal = await loginAs(PRINCIPAL);
      const teacher = await loginAs(TEACHER);
      const task = await createTask(principal, 'hoàn thành', await meId(teacher));

      const doing = await teacher.patch(`/tasks/${task.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
      expect(doing.body).toMatchObject({ status: 'IN_PROGRESS', completedAt: null });

      const done = await teacher.patch(`/tasks/${task.id}/status`).send({ status: 'DONE' }).expect(200);
      expect(done.body.status).toBe('DONE');
      expect(done.body.completedAt).not.toBeNull();
      expect(Date.now() - new Date(done.body.completedAt).getTime()).toBeLessThan(60_000);

      const reopened = await teacher.patch(`/tasks/${task.id}/status`).send({ status: 'TODO' }).expect(200);
      expect(reopened.body.completedAt).toBeNull();
      expect(await auditCount('task.update_status', task.id)).toBe(3);

      // OVERDUE do hệ thống đặt, không cho tự đặt.
      await teacher.patch(`/tasks/${task.id}/status`).send({ status: 'OVERDUE' }).expect(400);
      await teacher.patch(`/tasks/${task.id}/status`).send({ status: 'XONG' }).expect(400);
    });

    it('giáo viên không xem/sửa được việc của người khác; chỉ thấy việc của mình trong danh sách', async () => {
      const principal = await loginAs(PRINCIPAL);
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const editorId = await meId(editor);
      const others = await createTask(principal, 'của biên tập viên', editorId);
      const mine = await createTask(principal, 'của giáo viên', await meId(teacher));

      await teacher.get(`/tasks/${others.id}`).expect(403);
      await teacher.patch(`/tasks/${others.id}/status`).send({ status: 'DONE' }).expect(403);

      // Dù lọc theo người khác, giáo viên vẫn chỉ nhận việc của chính mình.
      const list = await teacher.get('/tasks').query({ assigneeId: editorId }).expect(200);
      const ids = list.body.map((t: { id: string }) => t.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(others.id);
      expect(list.body.every((t: { assigneeName: string }) => t.assigneeName === 'Giáo viên Toán')).toBe(true);

      // Biên tập viên (task:read:all) thấy hết nhưng chỉ đổi được trạng thái việc của mình.
      const all = await editor.get('/tasks').expect(200);
      expect(all.body.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([mine.id, others.id]));
      await editor.patch(`/tasks/${mine.id}/status`).send({ status: 'DONE' }).expect(403);
      await editor.patch(`/tasks/${others.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);

      // Người có task:assign đổi được trạng thái việc của người khác.
      await principal.patch(`/tasks/${mine.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
    });

    it('lọc theo người phụ trách, trạng thái, khoảng hạn; việc quá hạn tính khi truy vấn', async () => {
      const principal = await loginAs(PRINCIPAL);
      const teacher = await loginAs(TEACHER);
      const teacherId = await meId(teacher);
      const editorId = await meId(await loginAs(EDITOR));
      const late = await createTask(principal, 'trễ', teacherId, { dueAt: inHours(-3) });
      const lateDone = await createTask(principal, 'trễ đã xong', teacherId, { dueAt: inHours(-3) });
      const soon = await createTask(principal, 'sắp tới', editorId, { dueAt: inHours(30) });
      await teacher.patch(`/tasks/${lateDone.id}/status`).send({ status: 'DONE' }).expect(200);

      expect(late.overdue).toBe(true);
      const overdue = await principal.get('/tasks').query({ status: 'OVERDUE' }).expect(200);
      const overdueIds = overdue.body.map((t: { id: string }) => t.id);
      expect(overdueIds).toContain(late.id);
      expect(overdueIds).not.toContain(lateDone.id); // đã xong thì không quá hạn
      expect(overdueIds).not.toContain(soon.id);
      expect(overdue.body.every((t: { overdue: boolean }) => t.overdue)).toBe(true);

      const byAssignee = await principal.get('/tasks').query({ assigneeId: editorId }).expect(200);
      expect(byAssignee.body.some((t: { id: string }) => t.id === soon.id)).toBe(true);
      expect(byAssignee.body.every((t: { assigneeId: string }) => t.assigneeId === editorId)).toBe(true);

      const done = await principal.get('/tasks').query({ status: 'DONE' }).expect(200);
      expect(done.body.some((t: { id: string }) => t.id === lateDone.id)).toBe(true);

      const range = await principal
        .get('/tasks')
        .query({ dueFrom: inHours(24), dueTo: inHours(36) })
        .expect(200);
      expect(range.body.map((t: { id: string }) => t.id)).toContain(soon.id);
      expect(range.body.map((t: { id: string }) => t.id)).not.toContain(late.id);

      await principal.get('/tasks').query({ status: 'KHONG-CO' }).expect(400);
      await principal.get('/tasks').query({ dueFrom: 'hôm qua' }).expect(400);

      // Hạn chót 48 giờ: có việc quá hạn của giáo viên, đúng người.
      const deadlines = await teacher.get('/tasks/deadlines').expect(200);
      expect(deadlines.body.some((t: { id: string; overdue: boolean }) => t.id === late.id && t.overdue)).toBe(true);
      expect(deadlines.body.some((t: { id: string }) => t.id === lateDone.id)).toBe(false);
    });

    it('BGH sửa việc (đổi hạn, đổi người phụ trách) và xóa; có audit log', async () => {
      const principal = await loginAs(PRINCIPAL);
      const teacherId = await meId(await loginAs(TEACHER));
      const editorId = await meId(await loginAs(EDITOR));
      const task = await createTask(principal, 'sửa', teacherId);

      const newDue = inHours(72);
      const updated = await principal
        .patch(`/tasks/${task.id}`)
        .send({ dueAt: newDue, assigneeId: editorId, priority: 'LOW', title: `${TAG} sửa xong` })
        .expect(200);
      expect(updated.body).toMatchObject({ dueAt: newDue, assigneeId: editorId, priority: 'LOW', title: `${TAG} sửa xong` });
      expect(await auditCount('task.update', task.id)).toBe(1);

      await principal.patch(`/tasks/${task.id}`).send({ assigneeId: '999999999' }).expect(400);
      await principal.delete(`/tasks/${task.id}`).expect(204);
      expect(await auditCount('task.delete', task.id)).toBe(1);
      await principal.get(`/tasks/${task.id}`).expect(404);
      await principal.delete(`/tasks/${task.id}`).expect(404);
    });

    it('người phụ trách bị khóa không nhận việc mới', async () => {
      const principal = await loginAs(PRINCIPAL);
      const admin = await loginAs(ADMIN);
      const created = await admin
        .post('/users')
        .send({ email: `f14.${Date.now()}@pvh.edu.vn`, fullName: 'Giáo viên bị khóa', password: PASSWORD, roles: ['TEACHER'] })
        .expect(201);
      await admin.patch(`/users/${created.body.id}/status`).send({ status: 'LOCKED' }).expect(200);
      await principal
        .post('/tasks')
        .send({ title: `${TAG} cho người bị khóa`, assigneeId: created.body.id, dueAt: inHours(5) })
        .expect(400);
      // Dọn người dùng thử bằng CSDL (không có API xóa người dùng).
      await prisma.user.delete({ where: { id: BigInt(created.body.id) } });
    });
  });

  describe('lịch sự kiện', () => {
    const event = (name: string, startH = 48, endH = 50) => ({
      title: `${TAG} ${name}`,
      location: 'Hội trường',
      startAt: inHours(startH),
      endAt: inHours(endH),
    });

    it('xem công khai không cần đăng nhập; thêm/sửa/xóa cần quyền biên tập; có audit log', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      await request(app.getHttpServer()).post('/events').send(event('khách')).expect(401);
      await teacher.post('/events').send(event('giáo viên')).expect(403);

      const created = (await editor.post('/events').send(event('họp')).expect(201)).body;
      expect(created).toMatchObject({ title: `${TAG} họp`, location: 'Hội trường' });
      expect(await auditCount('event.create', created.id)).toBe(1);

      const upcoming = await request(app.getHttpServer()).get('/events').expect(200);
      expect(upcoming.body.map((e: { id: string }) => e.id)).toContain(created.id);

      await teacher.patch(`/events/${created.id}`).send({ title: 'Sửa trái phép' }).expect(403);
      await teacher.delete(`/events/${created.id}`).expect(403);

      const renamed = await editor.patch(`/events/${created.id}`).send({ title: `${TAG} họp đổi tên`, location: null }).expect(200);
      expect(renamed.body).toMatchObject({ title: `${TAG} họp đổi tên`, location: null, startAt: created.startAt });
      expect(await auditCount('event.update', created.id)).toBe(1);

      await editor.delete(`/events/${created.id}`).expect(204);
      expect(await auditCount('event.delete', created.id)).toBe(1);
      await editor.delete(`/events/${created.id}`).expect(404);
      const after = await request(app.getHttpServer()).get('/events').expect(200);
      expect(after.body.map((e: { id: string }) => e.id)).not.toContain(created.id);
    });

    it('kết thúc phải sau bắt đầu (cả khi tạo lẫn khi sửa)', async () => {
      const editor = await loginAs(EDITOR);
      await editor.post('/events').send(event('ngược', 50, 48)).expect(400);
      await editor.post('/events').send(event('bằng nhau', 48, 48)).expect(400);
      await editor.post('/events').send({ ...event('thiếu'), title: '' }).expect(400);
      await editor.post('/events').send({ ...event('sai ngày'), startAt: 'mai' }).expect(400);

      const created = (await editor.post('/events').send(event('sửa ngược')).expect(201)).body;
      // Chỉ đổi endAt về trước startAt hiện có → vẫn bị chặn.
      await editor.patch(`/events/${created.id}`).send({ endAt: inHours(40) }).expect(400);
      await editor.patch(`/events/${created.id}`).send({ startAt: inHours(60) }).expect(400);
      await editor.patch(`/events/${created.id}`).send({ startAt: inHours(60), endAt: inHours(61) }).expect(200);
    });

    it('lọc theo khoảng thời gian (lịch tháng): sự kiện giao với khoảng được trả về', async () => {
      const editor = await loginAs(EDITOR);
      const inside = (await editor.post('/events').send(event('trong khoảng', 100, 102)).expect(201)).body;
      const spanning = (await editor.post('/events').send(event('bắc cầu', 90, 130)).expect(201)).body;
      const outside = (await editor.post('/events').send(event('ngoài khoảng', 300, 302)).expect(201)).body;

      const res = await request(app.getHttpServer())
        .get('/events')
        .query({ from: inHours(95), to: inHours(110) })
        .expect(200);
      const ids = res.body.map((e: { id: string }) => e.id);
      expect(ids).toEqual(expect.arrayContaining([inside.id, spanning.id]));
      expect(ids).not.toContain(outside.id);

      await request(app.getHttpServer()).get('/events').query({ from: inHours(10), to: inHours(5) }).expect(400);
      await request(app.getHttpServer()).get('/events').query({ from: 'hôm nay' }).expect(400);
    });
  });

  describe('tool AI Agent', () => {
    // Dựng tool như AgentService: gắn user, bọc audit log, gọi handler.
    async function callTool(email: string, name: string, args: Record<string, unknown>) {
      const user = await app.get(UsersService).findAuthUserByEmail(email);
      if (!user) throw new Error(`Không có tài khoản ${email}`);
      const ctx = { user, channel: 'telegram' as const };
      const tool = app
        .get(TasksAgentTools)
        .buildTools(ctx)
        .map((t) => withAudit(t, ctx, app.get(AuditLogService)))
        .find((t) => t.name === name);
      if (!tool) throw new Error(`Không có tool ${name}`);
      const result = await tool.handler(args, {});
      const text = (result.content[0] as { text: string }).text;
      return { isError: result.isError === true, text, userId: user.id };
    }

    const agentAudit = async (action: string, userId: string, ok: boolean) =>
      (
        await prisma.auditLog.findMany({
          where: { action, userId: BigInt(userId), channel: 'telegram' },
          orderBy: { id: 'desc' },
          take: 5,
        })
      ).filter((row) => (row.payload as { ok: boolean }).ok === ok);

    it('create_task: BGH tạo được (ghi audit agent + task), giáo viên bị từ chối và không tạo gì', async () => {
      const teacherId = await meId(await loginAs(TEACHER));
      const args = {
        title: `${TAG} agent tạo`,
        assigneeId: teacherId,
        priority: 'HIGH',
        dueAt: inHours(24),
      };

      const ok = await callTool(PRINCIPAL, 'create_task', args);
      expect(ok.isError).toBe(false);
      const created = JSON.parse(ok.text) as { id: string; priority: string };
      expect(created.priority).toBe('HIGH');
      expect(await prisma.task.count({ where: { id: BigInt(created.id) } })).toBe(1);
      expect((await agentAudit('agent:create_task', ok.userId, true)).length).toBeGreaterThan(0);
      const serviceAudit = await prisma.auditLog.findFirst({
        where: { action: 'task.create', targetId: BigInt(created.id) },
      });
      expect(serviceAudit?.channel).toBe('telegram');

      const denied = await callTool(TEACHER, 'create_task', { ...args, title: `${TAG} agent trái phép` });
      expect(denied.isError).toBe(true);
      expect(denied.text).toMatch(/task:assign/);
      expect(await prisma.task.count({ where: { title: `${TAG} agent trái phép` } })).toBe(0);
      const rows = await agentAudit('agent:create_task', denied.userId, false);
      expect(rows.length).toBeGreaterThan(0);
      expect((rows[0].payload as { error: string }).error).toMatch(/task:assign/);

      const editor = await callTool(EDITOR, 'create_task', { ...args, title: `${TAG} agent biên tập` });
      expect(editor.isError).toBe(true);
    });

    it('create_task: tham số sai bị từ chối với thông báo rõ ràng', async () => {
      const teacherId = await meId(await loginAs(TEACHER));
      const bad = await callTool(PRINCIPAL, 'create_task', {
        title: `${TAG} agent sai`,
        assigneeId: teacherId,
        dueAt: 'ngày mai',
      });
      expect(bad.isError).toBe(true);
      expect(bad.text).toMatch(/dueAt/);
      expect(await prisma.task.count({ where: { title: `${TAG} agent sai` } })).toBe(0);
    });

    it('update_task_status: người được giao hoặc người có task:assign làm được, người khác bị từ chối', async () => {
      const principal = await loginAs(PRINCIPAL);
      const teacherId = await meId(await loginAs(TEACHER));
      const editorId = await meId(await loginAs(EDITOR));
      const mine = await createTask(principal, 'agent của giáo viên', teacherId);
      const others = await createTask(principal, 'agent của biên tập viên', editorId);

      const own = await callTool(TEACHER, 'update_task_status', { taskId: mine.id, status: 'DONE' });
      expect(own.isError).toBe(false);
      expect(JSON.parse(own.text)).toMatchObject({ status: 'DONE' });
      expect(JSON.parse(own.text).completedAt).not.toBeNull();
      expect((await agentAudit('agent:update_task_status', own.userId, true)).length).toBeGreaterThan(0);

      const denied = await callTool(TEACHER, 'update_task_status', { taskId: others.id, status: 'DONE' });
      expect(denied.isError).toBe(true);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: BigInt(others.id) } })).status).toBe('TODO');
      expect((await agentAudit('agent:update_task_status', denied.userId, false)).length).toBeGreaterThan(0);

      const byAssigner = await callTool(PRINCIPAL, 'update_task_status', { taskId: others.id, status: 'IN_PROGRESS' });
      expect(byAssigner.isError).toBe(false);

      const missing = await callTool(PRINCIPAL, 'update_task_status', { taskId: '999999999', status: 'DONE' });
      expect(missing.isError).toBe(true);
    });

    it('list_assignees: chỉ người có quyền xem/giao việc; giáo viên bị từ chối', async () => {
      const ok = await callTool(PRINCIPAL, 'list_assignees', {});
      expect(ok.isError).toBe(false);
      expect(JSON.parse(ok.text).length).toBeGreaterThan(1);
      const denied = await callTool(TEACHER, 'list_assignees', {});
      expect(denied.isError).toBe(true);
    });
  });
});
