// A01–A04 – bot Telegram và liên kết tài khoản. Cần PostgreSQL (đã seed) và Redis (OTP lưu trong Redis).
// Không gọi Telegram thật: mọi lệnh Bot API bị chặn bằng transformer của grammY; update gửi qua webhook.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AgentService } from './../src/features/agent/agent.service.js';
import { NotificationsService } from './../src/features/notifications/notifications.service.js';
import { TelegramBotService } from './../src/features/telegram/telegram-bot.service.js';
import { TelegramNotifierService } from './../src/features/telegram/telegram-notifier.service.js';
import { TelegramRateLimiter } from './../src/features/telegram/telegram-rate-limiter.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { RedisService } from './../src/infrastructure/queue/redis.service.js';

const PASSWORD = 'Pvh@2026';
const SEED_TEACHER = 'gv.toan@pvh.edu.vn';
const SECRET = 'pvh-e2e-webhook-secret';
const BOT_USERNAME = 'pvh_e2e_bot';

const TAG = `A01-${Date.now()}`;
// Tài khoản tạm cho lần chạy này (xoá khi xong): liên kết Telegram không đụng tới thông báo
// còn chờ của tài khoản seed trên máy dev.
const tagLower = TAG.toLowerCase();
const PRINCIPAL = `${tagLower}.bgh@test.pvh.edu.vn`;
const EDITOR = `${tagLower}.bientap@test.pvh.edu.vn`;
const TEACHER = `${tagLower}.gv@test.pvh.edu.vn`;
const TEST_USERS = [
  { email: PRINCIPAL, role: 'PRINCIPAL' },
  { email: EDITOR, role: 'EDITOR' },
  { email: TEACHER, role: 'TEACHER' },
];
const START = new Date(Date.now() - 1000);
// chat_id riêng cho lần chạy này (không trùng chat thật).
const BASE_CHAT = 7_000_000_000 + (Date.now() % 1_000_000) * 100;
let nextChat = 0;
const newChat = () => BASE_CHAT + ++nextChat;

interface Sent {
  chat_id: number | string;
  text: string;
}

describe('Bot Telegram (A01–A04, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let telegram: TelegramBotService;
  let agent: AgentService;
  let sent: Sent[];
  // chat_id nào nằm trong đây thì sendMessage ném lỗi (giả lập người dùng chặn bot).
  const failingChats = new Set<string>();
  let updateId = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    telegram = app.get(TelegramBotService, { strict: false });
    agent = app.get(AgentService, { strict: false });

    // Cùng mật khẩu với tài khoản seed (chép password_hash) để đăng nhập được.
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

    sent = [];
    telegram.bot!.api.config.use(async (_prev, method, payload) => {
      const p = payload as unknown as Sent;
      if (method === 'getMe') {
        return {
          ok: true,
          result: {
            id: 123456789,
            is_bot: true,
            first_name: 'PVH test',
            username: BOT_USERNAME,
            can_join_groups: false,
            can_read_all_group_messages: false,
            supports_inline_queries: false,
            can_connect_to_business: false,
            has_main_web_app: false,
          },
        } as never;
      }
      if (method === 'sendMessage') {
        if (failingChats.has(String(p.chat_id))) throw new Error('Forbidden: bot was blocked by the user');
        sent.push({ chat_id: p.chat_id, text: p.text });
        return { ok: true, result: { message_id: sent.length, date: 0, chat: { id: p.chat_id, type: 'private' }, text: p.text } } as never;
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
      const users = await db.user.findMany({ where: { email: { endsWith: `@test.pvh.edu.vn`, startsWith: tagLower } } });
      const ids = users.map((u) => u.id);
      await db.task.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.auditLog.deleteMany({
        where: { OR: [{ userId: { in: ids } }, { action: { startsWith: 'telegram.' }, userId: null, createdAt: { gte: START } }] },
      });
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
  const userId = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;

  function textUpdate(chatId: number, text: string, chatType: 'private' | 'group' = 'private') {
    updateId++;
    const command = text.startsWith('/') ? text.split(' ')[0] : null;
    return {
      update_id: updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: chatType === 'private' ? { id: chatId, type: 'private', first_name: 'GV' } : { id: -chatId, type: 'group', title: 'Nhóm' },
        from: { id: chatId, is_bot: false, first_name: 'GV' },
        text,
        entities: command ? [{ type: 'bot_command', offset: 0, length: command.length }] : undefined,
      },
    };
  }

  // Gửi tin như Telegram gọi webhook, trả về các tin bot trả lời chat đó.
  async function say(chatId: number, text: string): Promise<string[]> {
    const before = sent.length;
    await request(app.getHttpServer())
      .post('/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', SECRET)
      .send(textUpdate(chatId, text))
      .expect(200);
    await telegram.idle();
    return sent.slice(before).filter((m) => String(m.chat_id) === String(chatId)).map((m) => m.text);
  }

  // Bỏ hạn mức sinh mã (5 mã / 10 phút) giữa các test để test không phụ thuộc thứ tự.
  async function newCode(email: string): Promise<string> {
    await app.get(TelegramRateLimiter).reset('code', (await userId(email)).toString());
    const a = await loginAs(email);
    const res = await a.post('/telegram/link-code').expect(201);
    return res.body.code as string;
  }

  async function linkChat(email: string): Promise<number> {
    const chat = newChat();
    const replies = await say(chat, `/link ${await newCode(email)}`);
    expect(replies.join('\n')).toContain('Liên kết thành công');
    return chat;
  }

  describe('webhook', () => {
    it('thiếu hoặc sai secret → 401, update sai dạng → 400, đúng → 200', async () => {
      const server = app.getHttpServer();
      const update = textUpdate(newChat(), '/help');
      await request(server).post('/telegram/webhook').send(update).expect(401);
      await request(server).post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'sai-secret').send(update).expect(401);
      await request(server).post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send({ foo: 1 }).expect(400);
      await request(server).post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(update).expect(200);
    });
  });

  describe('liên kết bằng OTP (A01)', () => {
    it('API liên kết cần đăng nhập', async () => {
      await request(app.getHttpServer()).post('/telegram/link-code').expect(401);
      await request(app.getHttpServer()).get('/telegram/link').expect(401);
    });

    it('sinh OTP 6 số kèm deep-link, Redis chỉ lưu bản băm với hạn 5 phút', async () => {
      const a = await loginAs(EDITOR);
      const status = await a.get('/telegram/link').expect(200);
      expect(status.body).toEqual({ enabled: true, linked: false, botUsername: BOT_USERNAME });

      const res = await a.post('/telegram/link-code').expect(201);
      expect(res.body.code).toMatch(/^\d{6}$/);
      expect(res.body.deepLink).toBe(`https://t.me/${BOT_USERNAME}?start=${res.body.code}`);
      const expiresIn = new Date(res.body.expiresAt).getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(290_000);
      expect(expiresIn).toBeLessThanOrEqual(300_000);

      const redis = app.get(RedisService);
      const hash = createHash('sha256').update(res.body.code).digest('hex');
      expect(await redis.client!.exists(redis.key('tg', 'link', res.body.code))).toBe(0);
      expect(await redis.client!.get(redis.key('tg', 'link', hash))).toBe((await userId(EDITOR)).toString());
      const ttl = await redis.client!.ttl(redis.key('tg', 'link', hash));
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('OTP sai bị từ chối, OTP đúng liên kết được, mã chỉ dùng một lần', async () => {
      const code = await newCode(TEACHER);
      const chat = newChat();
      expect((await say(chat, '/link 000000')).join()).toContain('không hợp lệ');
      expect((await say(chat, '/link abc')).join()).toContain('không hợp lệ');

      const ok = await say(chat, `/link ${code}`);
      expect(ok.join()).toContain('Liên kết thành công');
      const user = await prisma.user.findUniqueOrThrow({ where: { email: TEACHER } });
      expect(user.telegramChatId).toBe(String(chat));

      const a = await loginAs(TEACHER);
      expect((await a.get('/telegram/link').expect(200)).body.linked).toBe(true);

      // Dùng lại mã từ chat khác: đã bị xoá (GETDEL).
      expect((await say(newChat(), `/link ${code}`)).join()).toContain('không hợp lệ');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'telegram.link', userId: user.id, createdAt: { gte: START } },
        orderBy: { id: 'desc' },
      });
      expect(audit?.channel).toBe('telegram');
      expect((audit!.payload as { ok: boolean }).ok).toBe(true);

      await say(chat, '/unlink');
    });

    it('OTP hết hạn bị từ chối; sinh mã mới thì mã cũ mất hiệu lực', async () => {
      const redis = app.get(RedisService);
      const expired = await newCode(PRINCIPAL);
      await redis.client!.pexpire(redis.key('tg', 'link', createHash('sha256').update(expired).digest('hex')), 1);
      await new Promise((r) => setTimeout(r, 20));
      expect((await say(newChat(), `/start ${expired}`)).join()).toContain('không hợp lệ');

      const old = await newCode(PRINCIPAL);
      const fresh = await newCode(PRINCIPAL);
      expect((await say(newChat(), `/link ${old}`)).join()).toContain('không hợp lệ');
      // Deep-link /start <mã> cũng liên kết được.
      const chat = newChat();
      expect((await say(chat, `/start ${fresh}`)).join()).toContain('Liên kết thành công');
      await say(chat, '/unlink');
    });

    it('nhập sai 5 lần thì chat bị khoá tạm, kể cả với mã đúng', async () => {
      const chat = newChat();
      for (let i = 0; i < 5; i++) await say(chat, `/link 99999${i}`);
      const code = await newCode(EDITOR);
      expect((await say(chat, `/link ${code}`)).join()).toContain('sai quá nhiều lần');
      expect((await prisma.user.findUniqueOrThrow({ where: { email: EDITOR } })).telegramChatId).toBeNull();
    });

    it('chat đã liên kết không liên kết thêm tài khoản khác; /unlink và nút huỷ trên web hoạt động', async () => {
      const chat = await linkChat(TEACHER);
      const other = await newCode(PRINCIPAL);
      expect((await say(chat, `/link ${other}`)).join()).toContain('đã liên kết với tài khoản');

      expect((await say(chat, '/unlink')).join()).toContain('Đã huỷ liên kết');
      expect((await prisma.user.findUniqueOrThrow({ where: { email: TEACHER } })).telegramChatId).toBeNull();
      expect((await say(chat, '/status')).join()).toContain('chưa liên kết');

      const chat2 = await linkChat(TEACHER);
      const a = await loginAs(TEACHER);
      const before = sent.length;
      await a.delete('/telegram/link').expect(204);
      expect(sent.slice(before).some((m) => String(m.chat_id) === String(chat2))).toBe(true);
      expect((await a.get('/telegram/link').expect(200)).body.linked).toBe(false);
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'telegram.unlink', channel: 'web', createdAt: { gte: START } },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('chat lạ (chưa liên kết)', () => {
    it('chỉ nhận hướng dẫn liên kết, không gọi được lệnh hay agent', async () => {
      const chat = newChat();
      const spy = vi.spyOn(agent, 'chat');
      for (const text of ['/start', '/status', '/deadline', 'Có bài nào chờ duyệt không?', '/help']) {
        const replies = await say(chat, text);
        expect(replies).toHaveLength(1);
        expect(replies[0]).toContain('chưa liên kết');
        expect(replies[0]).not.toContain('Tình trạng hệ thống');
      }
      expect(spy).not.toHaveBeenCalled();
      const rejected = await prisma.auditLog.count({
        where: { action: 'telegram.rejected', createdAt: { gte: START }, payload: { path: ['params', 'chatId'], equals: String(chat) } },
      });
      expect(rejected).toBe(3);
    });

    it('tin trong nhóm bị bỏ qua', async () => {
      const chat = newChat();
      const before = sent.length;
      await request(app.getHttpServer())
        .post('/telegram/webhook')
        .set('X-Telegram-Bot-Api-Secret-Token', SECRET)
        .send(textUpdate(chat, '/status', 'group'))
        .expect(200);
      expect(sent.length).toBe(before);
    });

    it('gửi dồn dập quá 20 tin/phút thì bị chặn, chỉ cảnh báo một lần', async () => {
      const chat = newChat();
      let warnings = 0;
      let replies = 0;
      for (let i = 0; i < 23; i++) {
        const r = await say(chat, '/help');
        replies += r.length;
        warnings += r.filter((t) => t.includes('quá nhiều tin')).length;
      }
      expect(warnings).toBe(1);
      expect(replies).toBe(21);
    });
  });

  describe('lệnh theo quyền (A03, A04) và chat tự do', () => {
    it('/status: BGH xem được, giáo viên bị từ chối theo quyền', async () => {
      const principal = await linkChat(PRINCIPAL);
      const status = (await say(principal, '/status')).join();
      expect(status).toContain('Tình trạng hệ thống');
      expect(status).toContain('Cơ sở dữ liệu: Hoạt động');
      expect(status).toContain('Bộ lập lịch');

      const teacher = await linkChat(TEACHER);
      const denied = (await say(teacher, '/status')).join();
      expect(denied).not.toContain('Tình trạng hệ thống');
      expect(denied).toContain('system:read');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'telegram.status', userId: await userId(TEACHER), createdAt: { gte: START } },
      });
      expect((audit!.payload as { ok: boolean }).ok).toBe(false);
      await say(principal, '/unlink');
      await say(teacher, '/unlink');
    });

    it('/deadline: giáo viên chỉ thấy việc của mình, BGH thấy toàn trường', async () => {
      const principalId = await userId(PRINCIPAL);
      const teacherId = await userId(TEACHER);
      const editorId = await userId(EDITOR);
      const hour = 3_600_000;
      await prisma.task.createMany({
        data: [
          { title: `${TAG} việc GV sắp hạn`, assigneeId: teacherId, createdBy: principalId, dueAt: new Date(Date.now() + 5 * hour) },
          { title: `${TAG} việc GV quá hạn`, assigneeId: teacherId, createdBy: principalId, dueAt: new Date(Date.now() - hour) },
          // Hạn rất cũ để đứng đầu danh sách (BGH thấy toàn trường, danh sách cắt ở 30 việc).
          { title: `${TAG} việc BT`, assigneeId: editorId, createdBy: principalId, dueAt: new Date('2016-01-01T00:00:00Z') },
        ],
      });

      const teacher = await linkChat(TEACHER);
      const own = (await say(teacher, '/deadline')).join('\n');
      expect(own).toContain('của bạn');
      expect(own).toContain(`${TAG} việc GV sắp hạn`);
      expect(own).toMatch(new RegExp(`QUÁ HẠN ${TAG} việc GV quá hạn`));
      expect(own).not.toContain(`${TAG} việc BT`);

      const principal = await linkChat(PRINCIPAL);
      const all = (await say(principal, '/deadline')).join('\n');
      expect(all).toContain(`${TAG} việc BT`);
      expect(all).toContain(`${TAG} việc GV sắp hạn`);
      await say(teacher, '/unlink');
      await say(principal, '/unlink');
    });

    it('tin tự do chuyển cho AI Agent thay mặt người đã liên kết, trả lời dài được chia nhỏ', async () => {
      const chat = await linkChat(TEACHER);
      const spy = vi
        .spyOn(agent, 'chat')
        .mockResolvedValue({ reply: `${'Dòng trả lời dài.\n'.repeat(400)}Hết.`, numTurns: 1, costUsd: 0 });

      const replies = await say(chat, 'Tuần này tôi có việc gì?');
      expect(spy).toHaveBeenCalledTimes(1);
      const [ctx, message] = spy.mock.calls[0];
      expect(ctx.channel).toBe('telegram');
      expect(ctx.user.email).toBe(TEACHER);
      expect(ctx.user.permissions).not.toContain('system:read');
      expect(message).toBe('Tuần này tôi có việc gì?');
      expect(replies.length).toBe(2);
      for (const r of replies) expect(r.length).toBeLessThanOrEqual(4096);
      expect(replies.at(-1)).toContain('Hết.');

      // Lệnh lạ không chuyển cho agent.
      expect((await say(chat, '/xoa_het')).join()).toContain('Không có lệnh này');
      expect(spy).toHaveBeenCalledTimes(1);

      // Agent lỗi (chưa cấu hình khóa) → báo ngắn gọn, ghi audit thất bại.
      const { ServiceUnavailableException } = await import('@nestjs/common');
      spy.mockRejectedValueOnce(new ServiceUnavailableException('Chưa cấu hình ANTHROPIC_API_KEY'));
      expect((await say(chat, 'Xin chào')).join()).toContain('chưa sẵn sàng');
      const audits = await prisma.auditLog.findMany({
        where: { action: 'telegram.chat', userId: await userId(TEACHER), createdAt: { gte: START } },
        orderBy: { id: 'asc' },
      });
      expect(audits.map((a) => (a.payload as { ok: boolean }).ok)).toEqual([true, false]);
      await say(chat, '/unlink');
    });
  });

  describe('gửi thông báo qua Telegram (nối bước 7)', () => {
    it('gửi cho người đã liên kết rồi ghi sent_at; người chưa liên kết vẫn chờ trong CMS', async () => {
      const notifier = app.get(TelegramNotifierService, { strict: false });
      await notifier.flush();
      const chat = await linkChat(PRINCIPAL);
      const before = sent.length;

      await app.get(NotificationsService).notify([
        { userId: await userId(PRINCIPAL), title: `${TAG} Báo cáo ngày`, body: 'Có 2 việc đến hạn hôm nay' },
        { userId: await userId(EDITOR), title: `${TAG} Nhắc hạn`, body: 'Việc sắp đến hạn' },
      ]);
      await notifier.flush();

      const toChat = sent.slice(before).filter((m) => String(m.chat_id) === String(chat));
      expect(toChat).toHaveLength(1);
      expect(toChat[0].text).toContain(`${TAG} Báo cáo ngày`);
      expect(toChat[0].text).toContain('Có 2 việc đến hạn hôm nay');
      const rows = await prisma.notification.findMany({ where: { title: { startsWith: TAG } } });
      expect(rows.find((r) => r.title.endsWith('Báo cáo ngày'))?.sentAt).toBeInstanceOf(Date);
      expect(rows.find((r) => r.title.endsWith('Nhắc hạn'))?.sentAt).toBeNull();

      // Gọi lại không gửi trùng.
      const again = sent.length;
      expect(await notifier.flush()).toBe(0);
      expect(sent.length).toBe(again);
      await say(chat, '/unlink');
    });

    it('gửi lỗi (bị chặn bot) thì giữ sent_at rỗng để gửi lại sau', async () => {
      const notifier = app.get(TelegramNotifierService, { strict: false });
      const chat = await linkChat(TEACHER);
      failingChats.add(String(chat));
      await app.get(NotificationsService).notify([
        { userId: await userId(TEACHER), title: `${TAG} Nhắc hạn lỗi`, body: 'Thử gửi lỗi' },
      ]);
      await notifier.flush();
      const row = await prisma.notification.findFirstOrThrow({ where: { title: `${TAG} Nhắc hạn lỗi` } });
      expect(row.sentAt).toBeNull();

      failingChats.delete(String(chat));
      expect(await notifier.flush()).toBe(1);
      const after = await prisma.notification.findFirstOrThrow({ where: { id: row.id } });
      expect(after.sentAt).toBeInstanceOf(Date);
      await say(chat, '/unlink');
    });
  });
});
