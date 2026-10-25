// A07, A08 – xác nhận 2 bước cho thao tác nhạy cảm của AI Agent, qua web và nút inline Telegram.
// Cần PostgreSQL (đã seed) và Redis. Không gọi Telegram/Anthropic thật: Bot API bị chặn bằng transformer của grammY,
// AgentService.chat được giả lập (gọi thẳng các tool thật để tạo hành động chờ xác nhận).
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AgentActionDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AgentActionsAgentTools } from './../src/features/agent-actions/agent-actions.agent-tools.js';
import { AgentActionsService } from './../src/features/agent-actions/agent-actions.service.js';
import type { AgentContext } from './../src/features/agent/agent-tool.js';
import { AgentService } from './../src/features/agent/agent.service.js';
import { PostsAgentTools } from './../src/features/posts/posts.agent-tools.js';
import { SystemAgentTools } from './../src/features/system/system.agent-tools.js';
import { TelegramBotService } from './../src/features/telegram/telegram-bot.service.js';
import { UsersService } from './../src/features/users/users.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import {
  AGENT_ACTION_QUEUE,
  JOB_AGENT_ACTION_EXPIRE,
  PUBLISH_QUEUE,
  SCHEDULER_AGENT_ACTION_EXPIRE,
  publishJobId,
} from './../src/infrastructure/queue/queue.constants.js';
import { QueueService } from './../src/infrastructure/queue/queue.service.js';

const PASSWORD = 'Pvh@2026';
const SEED_TEACHER = 'gv.toan@pvh.edu.vn';
const SECRET = 'pvh-e2e-webhook-secret';
const HOUR = 3_600_000;

const TAG = `A08-${Date.now()}`;
const START = new Date(Date.now() - 1000);
const tagLower = TAG.toLowerCase();
// Tài khoản tạm (xoá khi xong) để không đụng thông báo/dữ liệu của tài khoản seed.
const PRINCIPAL = `${tagLower}.bgh@test.pvh.edu.vn`;
const EDITOR = `${tagLower}.bientap@test.pvh.edu.vn`;
const EDITOR2 = `${tagLower}.bientap2@test.pvh.edu.vn`;
const TEACHER = `${tagLower}.gv@test.pvh.edu.vn`;
const TEST_USERS = [
  { email: PRINCIPAL, role: 'PRINCIPAL' },
  { email: EDITOR, role: 'EDITOR' },
  { email: EDITOR2, role: 'EDITOR' },
  { email: TEACHER, role: 'TEACHER' },
];

const BASE_CHAT = 8_000_000_000 + (Date.now() % 1_000_000) * 100;
let nextChat = 0;
const newChat = () => BASE_CHAT + ++nextChat;

type ToolResult = { content: { type: string; text?: string }[] };
type Handler = (args: unknown, extra: unknown) => Promise<ToolResult>;
const textOf = (res: ToolResult) => res.content[0].text as string;

interface Call {
  method: string;
  payload: Record<string, any>;
}

describe('Xác nhận 2 bước cho AI Agent (A07, A08, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let actions: AgentActionsService;
  let users: UsersService;
  let queues: QueueService;
  let telegram: TelegramBotService;
  let agent: AgentService;
  let calls: Call[] = [];
  let updateId = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    actions = app.get(AgentActionsService);
    users = app.get(UsersService);
    queues = app.get(QueueService);
    telegram = app.get(TelegramBotService, { strict: false });
    agent = app.get(AgentService, { strict: false });

    const seed = await prisma.user.findUniqueOrThrow({ where: { email: SEED_TEACHER } });
    for (const u of TEST_USERS) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
      await prisma.user.create({
        data: {
          email: u.email,
          fullName: `${TAG} ${u.role}`,
          passwordHash: seed.passwordHash,
          roles: { create: { roleId: role.id } },
        },
      });
    }

    telegram.bot!.api.config.use(async (_prev, method, payload) => {
      calls.push({ method, payload: payload as Record<string, any> });
      if (method === 'getMe') {
        return {
          ok: true,
          result: {
            id: 123456789,
            is_bot: true,
            first_name: 'PVH test',
            username: 'pvh_e2e_bot',
            can_join_groups: false,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
            can_connect_to_business: false,
            has_main_web_app: false,
          },
        } as never;
      }
      if (method === 'sendMessage') {
        const p = payload as { chat_id: number; text: string };
        return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: p.chat_id, type: 'private' }, text: p.text } } as never;
      }
      return { ok: true, result: true } as never;
    });
  });

  afterAll(async () => {
    await app.close();
    const { PrismaClient } = await import('./../src/generated/prisma/client.js');
    const { createPgAdapter } = await import('./../src/infrastructure/database/pg-adapter.js');
    const db = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
    try {
      const found = await db.user.findMany({ where: { email: { startsWith: tagLower, endsWith: '@test.pvh.edu.vn' } } });
      const ids = found.map((u) => u.id);
      await db.task.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.post.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.post.deleteMany({ where: { authorId: { in: ids } } });
      await db.notification.deleteMany({ where: { userId: { in: ids } } });
      await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
      await db.auditLog.deleteMany({ where: { action: 'agent_action.expire', createdAt: { gte: START }, userId: null } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await db.$disconnect();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loginAs(email: string) {
    const a = request.agent(app.getHttpServer());
    await a.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return a;
  }
  const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const authUser = async (email: string) => (await users.findAuthUserByEmail(email))!;

  // Bài viết đang chờ duyệt (EDITOR tạo, gửi duyệt) hoặc đã hẹn giờ / đã đăng.
  async function makePost(name: string, state: 'PENDING_REVIEW' | 'SCHEDULED' | 'PUBLISHED', publishAt = new Date(Date.now() + 2 * HOUR)) {
    const editor = await loginAs(EDITOR);
    const post = (await editor.post('/posts').send({ title: `${TAG} ${name}`, content: '<p>Nội dung thử</p>' }).expect(201)).body;
    await editor.post(`/posts/${post.id}/submit`).expect(200);
    if (state === 'SCHEDULED') await editor.post(`/posts/${post.id}/approve`).send({ publishAt: publishAt.toISOString() }).expect(200);
    if (state === 'PUBLISHED') await editor.post(`/posts/${post.id}/approve`).send({}).expect(200);
    return { id: post.id as string, publishAt };
  }
  const dbPost = (id: string) => prisma.post.findUniqueOrThrow({ where: { id: BigInt(id) } });
  const actionRow = (id: string) => prisma.agentAction.findUniqueOrThrow({ where: { id: BigInt(id) } });

  async function auditActions(uid: bigint, targetId?: string) {
    const rows = await prisma.auditLog.findMany({
      where: { userId: uid, createdAt: { gte: START }, targetId: targetId ? BigInt(targetId) : undefined },
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => `${r.action}:${(r.payload as { ok: boolean }).ok ? 'ok' : 'fail'}:${r.channel}`);
  }

  // Gọi tool nhạy cảm như agent (kèm bộ gom pendingActions của lượt chat).
  function sensitiveTools(user: Awaited<ReturnType<typeof authUser>>, channel: AgentContext['channel'] = 'web') {
    const ctx: AgentContext = { user, channel, pendingActions: [] };
    const tools = app.get(AgentActionsAgentTools).buildTools(ctx);
    const call = (name: string, args: Record<string, unknown>) => (tools.find((t) => t.name === name)!.handler as (a: unknown, e: unknown) => Promise<ToolResult>)(args, {});
    return { ctx, call, names: tools.map((t) => t.name) };
  }

  describe('tool nhạy cảm không thực thi ngay', () => {
    it('có đủ 4 tool; mỗi tool chỉ tạo yêu cầu PENDING (hết hạn sau 10 phút), bài viết giữ nguyên', async () => {
      const principal = await authUser(PRINCIPAL);
      const t = sensitiveTools(principal);
      expect(t.names).toEqual(['approve_post', 'schedule_post', 'reschedule_post', 'unpublish_post']);

      const pending = await makePost('chờ duyệt', 'PENDING_REVIEW');
      const res = await t.call('approve_post', { postId: pending.id });
      expect(JSON.parse(textOf(res))).toMatchObject({ status: 'PENDING_CONFIRMATION' });
      expect((await dbPost(pending.id)).status).toBe('PENDING_REVIEW');

      const at = new Date(Date.now() + 5 * HOUR).toISOString();
      await t.call('schedule_post', { postId: pending.id, publishAt: at });
      const scheduled = await makePost('đã hẹn giờ', 'SCHEDULED');
      await t.call('reschedule_post', { postId: scheduled.id, publishAt: at });
      const published = await makePost('đã đăng', 'PUBLISHED');
      await t.call('unpublish_post', { postId: published.id });

      expect((await dbPost(pending.id)).status).toBe('PENDING_REVIEW');
      expect((await dbPost(scheduled.id)).publishAt?.getTime()).toBe(scheduled.publishAt.getTime());
      expect((await dbPost(published.id)).status).toBe('PUBLISHED');

      expect(t.ctx.pendingActions).toHaveLength(4);
      for (const a of t.ctx.pendingActions!) {
        const row = await actionRow(a.id);
        expect(row.status).toBe('PENDING');
        expect(row.userId).toBe(await userId(PRINCIPAL));
        const ttl = row.expiresAt.getTime() - Date.now();
        expect(ttl).toBeGreaterThan(9 * 60_000);
        expect(ttl).toBeLessThanOrEqual(10 * 60_000);
      }
      expect(await auditActions(await userId(PRINCIPAL), t.ctx.pendingActions![0].id)).toEqual(['agent_action.propose:ok:web']);
    });

    it('thiếu quyền, sai trạng thái hoặc giờ ở quá khứ thì không tạo yêu cầu nào', async () => {
      const before = await prisma.agentAction.count();
      const pending = await makePost('chờ duyệt 2', 'PENDING_REVIEW');
      const scheduled = await makePost('đã hẹn giờ 2', 'SCHEDULED');

      const teacher = sensitiveTools(await authUser(TEACHER));
      await expect(teacher.call('approve_post', { postId: pending.id })).rejects.toThrow(/post:approve/);
      await expect(teacher.call('unpublish_post', { postId: pending.id })).rejects.toThrow(/post:unpublish/);

      const principal = sensitiveTools(await authUser(PRINCIPAL));
      await expect(principal.call('unpublish_post', { postId: pending.id })).rejects.toThrow(/gỡ/);
      await expect(
        principal.call('reschedule_post', { postId: scheduled.id, publishAt: new Date(Date.now() - HOUR).toISOString() }),
      ).rejects.toThrow(/tương lai/);
      await expect(principal.call('approve_post', { postId: '999999999' })).rejects.toThrow(/Không tìm thấy/);
      await expect(principal.call('schedule_post', { postId: pending.id, publishAt: 'mai 8h' })).rejects.toThrow();

      expect(await prisma.agentAction.count()).toBe(before);
    });
  });

  describe('xác nhận trên web', () => {
    it('dời bài: xác nhận thì bài được dời, job đăng bài dời theo, ghi đủ audit_logs và agent_actions', async () => {
      const post = await makePost('dời lịch', 'SCHEDULED');
      const principalUser = await authUser(PRINCIPAL);
      const newTime = new Date(Date.now() + 6 * HOUR);
      const t = sensitiveTools(principalUser);
      await t.call('reschedule_post', { postId: post.id, publishAt: newTime.toISOString() });
      const proposed = t.ctx.pendingActions![0];
      expect(proposed.description).toContain('Dời lịch đăng bài');

      const web = await loginAs(PRINCIPAL);
      const listed = (await web.get('/agent/actions').expect(200)).body as AgentActionDto[];
      expect(listed.map((a) => a.id)).toContain(proposed.id);

      const res = await web.post(`/agent/actions/${proposed.id}/confirm`).expect(201);
      expect(res.body).toMatchObject({ id: proposed.id, status: 'DONE' });
      expect(res.body.resultMessage).toContain('Đã dời lịch');

      const updated = await dbPost(post.id);
      expect(updated.status).toBe('SCHEDULED');
      expect(updated.publishAt?.getTime()).toBe(newTime.getTime());
      const job = await queues.queue(PUBLISH_QUEUE)!.getJob(publishJobId(post.id));
      expect(job).toBeTruthy();
      expect(Math.abs(job!.timestamp + job!.delay - newTime.getTime())).toBeLessThan(5000);

      const row = await actionRow(proposed.id);
      expect(row.status).toBe('DONE');
      expect(row.confirmedAt).toBeInstanceOf(Date);
      expect(row.result).toMatchObject({ ok: true, status: 'SCHEDULED' });
      expect(await auditActions(await userId(PRINCIPAL), undefined)).toEqual(
        expect.arrayContaining(['agent_action.propose:ok:web', 'post.reschedule:ok:web', 'agent_action.confirm:ok:web']),
      );
      expect((await web.get('/agent/actions').expect(200)).body.map((a: AgentActionDto) => a.id)).not.toContain(proposed.id);
    });

    it('duyệt đăng ngay, hẹn giờ và gỡ bài đều thực thi đúng sau khi xác nhận', async () => {
      const principalUser = await authUser(PRINCIPAL);
      const web = await loginAs(PRINCIPAL);
      const t = sensitiveTools(principalUser);

      const a = await makePost('đăng ngay', 'PENDING_REVIEW');
      await t.call('approve_post', { postId: a.id });
      const at = new Date(Date.now() + 4 * HOUR);
      const b = await makePost('hẹn giờ', 'PENDING_REVIEW');
      await t.call('schedule_post', { postId: b.id, publishAt: at.toISOString() });
      const c = await makePost('gỡ bài', 'PUBLISHED');
      await t.call('unpublish_post', { postId: c.id });

      for (const action of t.ctx.pendingActions!) {
        expect((await web.post(`/agent/actions/${action.id}/confirm`).expect(201)).body.status).toBe('DONE');
      }
      expect((await dbPost(a.id)).status).toBe('PUBLISHED');
      const scheduled = await dbPost(b.id);
      expect(scheduled.status).toBe('SCHEDULED');
      expect(scheduled.publishAt?.getTime()).toBe(at.getTime());
      expect((await dbPost(c.id)).status).toBe('ARCHIVED');
    });

    it('huỷ thì không thực thi, và xác nhận sau khi huỷ cũng không thực thi', async () => {
      const post = await makePost('huỷ', 'SCHEDULED');
      const t = sensitiveTools(await authUser(PRINCIPAL));
      await t.call('reschedule_post', { postId: post.id, publishAt: new Date(Date.now() + 8 * HOUR).toISOString() });
      const id = t.ctx.pendingActions![0].id;

      const web = await loginAs(PRINCIPAL);
      expect((await web.post(`/agent/actions/${id}/cancel`).expect(201)).body.status).toBe('CANCELLED');
      const again = await web.post(`/agent/actions/${id}/confirm`).expect(201);
      expect(again.body.status).toBe('CANCELLED');

      expect((await dbPost(post.id)).publishAt?.getTime()).toBe(post.publishAt.getTime());
      expect((await actionRow(id)).status).toBe('CANCELLED');
      const audit = await auditActions(await userId(PRINCIPAL), id);
      expect(audit).toEqual(['agent_action.propose:ok:web', 'agent_action.cancel:ok:web', 'agent_action.confirm:fail:web']);
    });

    it('hết hạn: bấm Xác nhận sau hạn thì không thực thi; job định kỳ chuyển EXPIRED và ghi audit', async () => {
      const post = await makePost('hết hạn', 'SCHEDULED');
      const t = sensitiveTools(await authUser(PRINCIPAL));
      const at = new Date(Date.now() + 9 * HOUR).toISOString();
      await t.call('reschedule_post', { postId: post.id, publishAt: at });
      await t.call('reschedule_post', { postId: post.id, publishAt: at });
      const [bấm, quét] = t.ctx.pendingActions!;

      // Quá 10 phút: một yêu cầu bị bấm sau hạn, một yêu cầu để job quét.
      await prisma.agentAction.updateMany({ where: { id: { in: [BigInt(bấm.id), BigInt(quét.id)] } }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const web = await loginAs(PRINCIPAL);
      // Yêu cầu quá hạn không còn nằm trong danh sách đang chờ (các yêu cầu chờ của test khác thì vẫn còn).
      const stillPending = (await web.get('/agent/actions').expect(200)).body.map((a: AgentActionDto) => a.id);
      expect(stillPending).not.toContain(bấm.id);
      expect(stillPending).not.toContain(quét.id);

      const late = await web.post(`/agent/actions/${bấm.id}/confirm`).expect(201);
      expect(late.body.status).toBe('EXPIRED');
      expect((await dbPost(post.id)).publishAt?.getTime()).toBe(post.publishAt.getTime());

      expect(await actions.expireDue()).toBeGreaterThanOrEqual(1);
      expect((await actionRow(quét.id)).status).toBe('EXPIRED');
      expect(await auditActions(await userId(PRINCIPAL), quét.id)).toEqual(['agent_action.propose:ok:web', 'agent_action.expire:ok:scheduler']);
      // Quét lại không đổi gì.
      expect(await actions.expireDue()).toBe(0);
      await web.post(`/agent/actions/${quét.id}/confirm`).expect(201);
      expect((await dbPost(post.id)).publishAt?.getTime()).toBe(post.publishAt.getTime());
    });

    it('job định kỳ (worker BullMQ thật) tự chuyển yêu cầu quá hạn sang EXPIRED', async () => {
      const post = await makePost('worker hết hạn', 'SCHEDULED');
      const t = sensitiveTools(await authUser(PRINCIPAL));
      await t.call('reschedule_post', { postId: post.id, publishAt: new Date(Date.now() + 5 * HOUR).toISOString() });
      const id = t.ctx.pendingActions![0].id;
      await prisma.agentAction.update({ where: { id: BigInt(id) }, data: { expiresAt: new Date(Date.now() - 1000) } });

      // Lịch lặp mỗi phút đã được đăng ký khi khởi động; chạy ngay một lượt thay vì chờ.
      const queue = queues.queue(AGENT_ACTION_QUEUE)!;
      expect((await queue.getJobSchedulers()).map((j) => j.key)).toContain(SCHEDULER_AGENT_ACTION_EXPIRE);
      await queue.add(JOB_AGENT_ACTION_EXPIRE, {}, { removeOnComplete: true });
      await vi.waitFor(async () => expect((await actionRow(id)).status).toBe('EXPIRED'), { timeout: 10_000, interval: 200 });
      expect((await dbPost(post.id)).publishAt?.getTime()).toBe(post.publishAt.getTime());
    }, 20_000);

    it('người khác xác nhận hoặc huỷ hộ đều bị từ chối (404), yêu cầu vẫn chờ', async () => {
      const post = await makePost('sai người', 'SCHEDULED');
      const t = sensitiveTools(await authUser(PRINCIPAL));
      await t.call('reschedule_post', { postId: post.id, publishAt: new Date(Date.now() + 7 * HOUR).toISOString() });
      const id = t.ctx.pendingActions![0].id;

      for (const email of [EDITOR, EDITOR2, TEACHER]) {
        const other = await loginAs(email);
        await other.post(`/agent/actions/${id}/confirm`).expect(404);
        await other.post(`/agent/actions/${id}/cancel`).expect(404);
        expect((await other.get('/agent/actions').expect(200)).body).toEqual([]);
      }
      await request(app.getHttpServer()).post(`/agent/actions/${id}/confirm`).expect(401);

      expect((await actionRow(id)).status).toBe('PENDING');
      expect((await dbPost(post.id)).publishAt?.getTime()).toBe(post.publishAt.getTime());
      const denied = await prisma.auditLog.count({
        where: { action: 'agent_action.denied', targetId: BigInt(id), userId: { in: [await userId(EDITOR), await userId(EDITOR2), await userId(TEACHER)] } },
      });
      expect(denied).toBe(6);
    });

    it('bấm lặp và bấm đồng thời chỉ chạy một lần', async () => {
      const post = await makePost('bấm lặp', 'SCHEDULED');
      const principalUser = await authUser(PRINCIPAL);
      const t = sensitiveTools(principalUser);
      await t.call('reschedule_post', { postId: post.id, publishAt: new Date(Date.now() + 3 * HOUR).toISOString() });
      const id = t.ctx.pendingActions![0].id;

      const results = await Promise.all([
        actions.confirm(principalUser, id, 'web'),
        actions.confirm(principalUser, id, 'telegram'),
        actions.confirm(principalUser, id, 'web'),
      ]);
      const executed = await prisma.auditLog.count({ where: { action: 'post.reschedule', userId: principalUser.id ? BigInt(principalUser.id) : undefined, targetId: BigInt(post.id) } });
      expect(executed).toBe(1);
      expect(results.filter((r) => r.status === 'DONE').length).toBeGreaterThanOrEqual(1);

      const again = await actions.confirm(principalUser, id, 'web');
      expect(again.status).toBe('DONE');
      expect(await prisma.auditLog.count({ where: { action: 'post.reschedule', targetId: BigInt(post.id) } })).toBe(1);
      const stale = await prisma.auditLog.count({ where: { action: 'agent_action.confirm', targetId: BigInt(id), userId: principalUser.id ? BigInt(principalUser.id) : undefined, payload: { path: ['ok'], equals: false } } });
      expect(stale).toBeGreaterThanOrEqual(2);
    });

    it('mất quyền hoặc bài đã đổi trong lúc chờ: kiểm tra lại, không thực thi và ghi FAILED', async () => {
      // Bài đã bị người khác dời/đăng trước khi xác nhận.
      const changed = await makePost('bài đã đổi', 'SCHEDULED');
      const principalUser = await authUser(PRINCIPAL);
      const t = sensitiveTools(principalUser);
      await t.call('reschedule_post', { postId: changed.id, publishAt: new Date(Date.now() + 5 * HOUR).toISOString() });
      await prisma.post.update({ where: { id: BigInt(changed.id) }, data: { status: 'DRAFT', publishAt: null } });
      const failed = await actions.confirm(principalUser, t.ctx.pendingActions![0].id, 'web');
      expect(failed.status).toBe('FAILED');
      expect(failed.resultMessage).toContain('Không thể dời lịch');
      expect((await dbPost(changed.id)).status).toBe('DRAFT');

      // Người đề xuất bị rút vai trò (mất quyền) trước khi xác nhận.
      const post = await makePost('mất quyền', 'PUBLISHED');
      const editorUser = await authUser(EDITOR2);
      const te = sensitiveTools(editorUser);
      await te.call('unpublish_post', { postId: post.id });
      const roles = await prisma.userRole.findMany({ where: { userId: await userId(EDITOR2) } });
      await prisma.userRole.deleteMany({ where: { userId: await userId(EDITOR2) } });
      const fresh = await authUser(EDITOR2);
      expect(fresh.permissions).toEqual([]);
      const denied = await actions.confirm(fresh, te.ctx.pendingActions![0].id, 'web');
      expect(denied.status).toBe('FAILED');
      expect(denied.resultMessage).toContain('post:unpublish');
      expect((await dbPost(post.id)).status).toBe('PUBLISHED');
      await prisma.userRole.createMany({ data: roles });
      expect((await actionRow(denied.id)).status).toBe('FAILED');
    });
  });

  describe('nút Xác nhận/Huỷ trên Telegram', () => {
    const upd = (extra: object) => ({ update_id: ++updateId, ...extra });
    const textUpdate = (chatId: number, text: string) =>
      upd({
        message: { message_id: updateId + 1, date: 0, chat: { id: chatId, type: 'private', first_name: 'x' }, from: { id: chatId, is_bot: false, first_name: 'x' }, text },
      });
    const buttonUpdate = (chatId: number, data: string, fromId = chatId) =>
      upd({
        callback_query: {
          id: String(updateId + 1),
          chat_instance: 'x',
          from: { id: fromId, is_bot: false, first_name: 'x' },
          data,
          message: { message_id: 77, date: 0, chat: { id: chatId, type: 'private', first_name: 'x' }, text: 'Cần xác nhận' },
        },
      });
    const post = (body: object) =>
      request(app.getHttpServer()).post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(body).expect(200);

    async function linkChat(email: string): Promise<number> {
      const chat = newChat();
      await prisma.user.update({ where: { email }, data: { telegramChatId: String(chat) } });
      return chat;
    }
    const unlink = (email: string) => prisma.user.update({ where: { email }, data: { telegramChatId: null } });

    // Giả lập agent: gọi thẳng tool thật như model sẽ làm, trả về pendingActions như AgentService.
    function fakeAgent(toolName: string, args: Record<string, unknown>) {
      return vi.spyOn(agent, 'chat').mockImplementation(async (ctx) => {
        const t = sensitiveTools(ctx.user, 'telegram');
        await t.call(toolName, args);
        return { reply: 'Đang chờ bạn xác nhận.', numTurns: 1, costUsd: 0, pendingActions: t.ctx.pendingActions! };
      });
    }
    const prompts = () => calls.filter((c) => c.method === 'sendMessage' && c.payload.reply_markup);

    it('ra lệnh dời bài → bot hỏi xác nhận kèm nút → bấm Xác nhận thì bài được dời, tin sửa thành kết quả', async () => {
      const principal = await linkChat(PRINCIPAL);
      const scheduled = await makePost('tele dời', 'SCHEDULED');
      const newTime = new Date(Date.now() + 10 * HOUR);
      fakeAgent('reschedule_post', { postId: scheduled.id, publishAt: newTime.toISOString() });

      calls = [];
      await post(textUpdate(principal, 'Dời bài tele dời sang 8h'));
      await telegram.idle();
      expect((await dbPost(scheduled.id)).publishAt?.getTime()).toBe(scheduled.publishAt.getTime());

      const [prompt] = prompts();
      expect(prompt.payload.text).toContain('Cần xác nhận');
      expect(prompt.payload.text).toContain('Dời lịch đăng bài');
      const keyboard = prompt.payload.reply_markup.inline_keyboard[0] as { text: string; callback_data: string }[];
      expect(keyboard.map((b) => b.text)).toEqual(['✅ Xác nhận', '❌ Huỷ']);
      const [confirm, cancel] = keyboard.map((b) => b.callback_data);
      expect(confirm).toMatch(/^aa:c:\d+$/);
      expect(cancel).toMatch(/^aa:x:\d+$/);
      const id = confirm.split(':')[2];

      calls = [];
      await post(buttonUpdate(principal, confirm));
      const edited = calls.find((c) => c.method === 'editMessageText')!;
      expect(edited.payload.text).toContain('Đã dời lịch');
      expect(edited.payload.reply_markup).toBeUndefined();
      expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);

      expect((await dbPost(scheduled.id)).publishAt?.getTime()).toBe(newTime.getTime());
      expect((await actionRow(id)).status).toBe('DONE');
      expect(await auditActions(await userId(PRINCIPAL), id)).toEqual(['agent_action.propose:ok:telegram', 'agent_action.confirm:ok:telegram']);

      // Bấm lặp: không chạy lại.
      calls = [];
      await post(buttonUpdate(principal, confirm));
      expect(calls.find((c) => c.method === 'editMessageText')!.payload.text).toContain('Đã dời lịch');
      expect(await prisma.auditLog.count({ where: { action: 'post.reschedule', targetId: BigInt(scheduled.id), channel: 'telegram' } })).toBe(1);
      await unlink(PRINCIPAL);
    });

    it('bấm Huỷ thì không thực thi; bấm Xác nhận sau khi huỷ hoặc sau khi hết hạn cũng không thực thi', async () => {
      const principal = await linkChat(PRINCIPAL);
      const scheduled = await makePost('tele huỷ', 'SCHEDULED');
      fakeAgent('reschedule_post', { postId: scheduled.id, publishAt: new Date(Date.now() + 11 * HOUR).toISOString() });

      calls = [];
      await post(textUpdate(principal, 'Dời bài'));
      await telegram.idle();
      const id = (prompts()[0].payload.reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[2];

      calls = [];
      await post(buttonUpdate(principal, `aa:x:${id}`));
      expect(calls.find((c) => c.method === 'editMessageText')!.payload.text).toContain('Đã huỷ');
      await post(buttonUpdate(principal, `aa:c:${id}`));
      expect(calls.filter((c) => c.method === 'editMessageText').at(-1)!.payload.text).toContain('Đã huỷ');
      expect((await actionRow(id)).status).toBe('CANCELLED');

      // Yêu cầu khác: để quá hạn rồi bấm.
      calls = [];
      await post(textUpdate(principal, 'Dời bài lần nữa'));
      await telegram.idle();
      const id2 = (prompts()[0].payload.reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[2];
      await prisma.agentAction.update({ where: { id: BigInt(id2) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      calls = [];
      await post(buttonUpdate(principal, `aa:c:${id2}`));
      expect(calls.find((c) => c.method === 'editMessageText')!.payload.text).toContain('hết hạn');
      expect((await actionRow(id2)).status).toBe('EXPIRED');

      expect((await dbPost(scheduled.id)).publishAt?.getTime()).toBe(scheduled.publishAt.getTime());
      await unlink(PRINCIPAL);
    });

    it('người khác hoặc chat lạ bấm nút của người ra lệnh thì bị từ chối, không thực thi', async () => {
      const principal = await linkChat(PRINCIPAL);
      const editor = await linkChat(EDITOR);
      const stranger = newChat();
      const scheduled = await makePost('tele sai người', 'SCHEDULED');
      fakeAgent('reschedule_post', { postId: scheduled.id, publishAt: new Date(Date.now() + 12 * HOUR).toISOString() });

      calls = [];
      await post(textUpdate(principal, 'Dời bài'));
      await telegram.idle();
      const id = (prompts()[0].payload.reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[2];

      // Biên tập viên đã liên kết bấm nút (dữ liệu nút bị chuyển tiếp): không phải người tạo.
      calls = [];
      await post(buttonUpdate(editor, `aa:c:${id}`));
      expect(calls.find((c) => c.method === 'editMessageText')!.payload.text).toContain('Không tìm thấy');
      // Chat lạ chưa liên kết: chỉ nhận cảnh báo.
      calls = [];
      await post(buttonUpdate(stranger, `aa:c:${id}`));
      expect(calls.some((c) => c.method === 'editMessageText')).toBe(false);
      expect(calls.find((c) => c.method === 'answerCallbackQuery')!.payload.text).toContain('chưa liên kết');
      // Người bấm không phải chủ chat (from.id khác chat.id): bị bỏ qua hoàn toàn.
      calls = [];
      await post(buttonUpdate(principal, `aa:c:${id}`, stranger));
      expect(calls.some((c) => ['editMessageText', 'answerCallbackQuery'].includes(c.method))).toBe(false);

      expect((await actionRow(id)).status).toBe('PENDING');
      expect((await dbPost(scheduled.id)).publishAt?.getTime()).toBe(scheduled.publishAt.getTime());
      await unlink(PRINCIPAL);
      await unlink(EDITOR);
    });
  });

  describe('tool không nhạy cảm (A07)', () => {
    it('create_announcement tạo bài nháp ở chuyên mục Thông báo, không đăng; giáo viên cũng tạo được nháp', async () => {
      const teacher = await authUser(TEACHER);
      const ctx: AgentContext = { user: teacher, channel: 'telegram' };
      const tool = app.get(PostsAgentTools).buildTools(ctx).find((t) => t.name === 'create_announcement')!;
      const res = await (tool.handler as Handler)({ title: `${TAG} Thông báo họp`, content: '<p>Họp lúc 8h</p>' }, {});
      const post = JSON.parse(textOf(res));
      expect(post).toMatchObject({ status: 'DRAFT', categoryName: 'Thông báo' });
      const row = await dbPost(post.id);
      expect(row.status).toBe('DRAFT');
      expect(row.publishedAt).toBeNull();
    });

    it('summarize_day trả việc và bài hẹn giờ trong ngày, giáo viên chỉ thấy phần của mình', async () => {
      const principal = await userId(PRINCIPAL);
      const teacher = await userId(TEACHER);
      const editor = await userId(EDITOR);
      const inHour = new Date(Date.now() + 1000);
      const today = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}T23:59:00+07:00`);
      const dueAt = today.getTime() > Date.now() ? today : inHour;
      await prisma.task.createMany({
        data: [
          { title: `${TAG} việc GV`, assigneeId: teacher, createdBy: principal, dueAt },
          { title: `${TAG} việc BT`, assigneeId: editor, createdBy: principal, dueAt: new Date('2016-01-01T00:00:00Z') },
        ],
      });
      const run = async (email: string) => {
        const tool = app.get(SystemAgentTools).buildTools({ user: await authUser(email), channel: 'telegram' }).find((t) => t.name === 'summarize_day')!;
        return JSON.parse(textOf(await (tool.handler as Handler)({}, {})));
      };
      const all = await run(PRINCIPAL);
      expect(all.tasks.map((t: { title: string }) => t.title)).toEqual(expect.arrayContaining([`${TAG} việc GV`, `${TAG} việc BT`]));
      expect(all.tasks.find((t: { title: string }) => t.title.endsWith('việc BT')).overdue).toBe(true);

      const own = await run(TEACHER);
      expect(own.tasks.map((t: { title: string }) => t.title)).toEqual([`${TAG} việc GV`]);
      expect(own.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await prisma.task.deleteMany({ where: { title: { startsWith: TAG } } });
    });
  });
});
