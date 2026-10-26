// Bước 13 – Telegram báo người duyệt khi có bài gửi duyệt, kèm nút Xem toàn văn / Duyệt đăng / Từ chối.
// Cần PostgreSQL (đã seed) và Redis. Không gọi Telegram thật: Bot API bị chặn bằng transformer của grammY, update gửi
// qua webhook; AgentService.chat được giả lập (để chắc chắn lý do từ chối không chuyển cho agent).
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';

const PASSWORD = 'Pvh@2026';
const SEED_TEACHER = 'gv.toan@pvh.edu.vn';
const SEED_ADMIN = 'admin@pvh.edu.vn';
const SECRET = 'pvh-e2e-webhook-secret';

const TAG = `A13-${Date.now()}`;
const tagLower = TAG.toLowerCase();
const START = new Date(Date.now() - 1000);
const mail = (n: string) => `${tagLower}.${n}@test.pvh.edu.vn`;
const AUTHOR = mail('tacgia'); // giáo viên: chỉ có quyền soạn
const PRINCIPAL = mail('bgh'); // người duyệt 1
const EDITOR = mail('bientap'); // người duyệt 2
const OUTSIDER = mail('gv2'); // giáo viên khác (không có quyền duyệt) đã liên kết
const UNLINKED = mail('chualienket'); // có quyền duyệt nhưng chưa liên kết Telegram
const LOCKED = mail('bikhoa'); // có quyền duyệt, đã liên kết nhưng tài khoản bị khoá
const SELF = mail('tuduyet'); // biên tập viên tự viết bài
const TEST_USERS = [
  { email: AUTHOR, role: 'TEACHER' },
  { email: PRINCIPAL, role: 'PRINCIPAL' },
  { email: EDITOR, role: 'EDITOR' },
  { email: OUTSIDER, role: 'TEACHER' },
  { email: UNLINKED, role: 'EDITOR' },
  { email: LOCKED, role: 'PRINCIPAL' },
  { email: SELF, role: 'EDITOR' },
];
const BASE_CHAT = 5_000_000_000 + (Date.now() % 1_000_000) * 100;
let nextChat = 0;
const newChat = () => BASE_CHAT + ++nextChat;

interface Call {
  method: string;
  payload: Record<string, any>;
}
// Người duyệt đã liên kết khi tác giả là AUTHOR: BGH, biên tập viên và biên tập viên SELF.
const REVIEWERS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// URL ảnh/video của hệ thống (đúng định dạng khoá) để bộ lọc nội dung giữ lại thẻ.
const apiBase = () => `http://localhost:${process.env.API_PORT ?? 4000}/api/media/files`;
const imgTag = () => `<img src="${apiBase()}/${randomUUID()}.png">`;
const videoUrl = () => `${apiBase()}/${randomUUID()}.mp4`;
const videoTag = (url = videoUrl()) => `<video src="${url}" controls></video>`;

describe('Telegram báo người duyệt khi có bài gửi duyệt (bước 13, e2e)', () => {
  let app: INestApplication<App>;
  type Prisma = import('./../src/infrastructure/database/prisma.service.js').PrismaService;
  let prisma: Prisma;
  let telegram: import('./../src/features/telegram/telegram-bot.service.js').TelegramBotService;
  let agent: import('./../src/features/agent/agent.service.js').AgentService;
  let review: import('./../src/features/telegram/telegram-review.service.js').TelegramReviewService;
  let posts: import('./../src/features/posts/posts.service.js').PostsService;
  let usersService: import('./../src/features/users/users.service.js').UsersService;
  let calls: Call[] = [];
  let updateId = 0;
  let messageId = 100;
  const chats: Record<string, number> = {};
  const failingChats = new Set<number>();

  beforeAll(async () => {
    const { AppModule } = await import('./../src/app.module.js');
    const { TelegramBotService } = await import('./../src/features/telegram/telegram-bot.service.js');
    const { AgentService } = await import('./../src/features/agent/agent.service.js');
    const { TelegramReviewService } = await import('./../src/features/telegram/telegram-review.service.js');
    const { PostsService } = await import('./../src/features/posts/posts.service.js');
    const { UsersService } = await import('./../src/features/users/users.service.js');
    const { PrismaService } = await import('./../src/infrastructure/database/prisma.service.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    telegram = app.get(TelegramBotService, { strict: false });
    agent = app.get(AgentService, { strict: false });
    review = app.get(TelegramReviewService, { strict: false });
    posts = app.get(PostsService);
    usersService = app.get(UsersService);

    const seed = await prisma.user.findUniqueOrThrow({ where: { email: SEED_TEACHER } });
    for (const u of TEST_USERS) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
      const chat = u.email === UNLINKED ? null : newChat();
      if (chat) chats[u.email] = chat;
      await prisma.user.create({
        data: {
          email: u.email,
          fullName: `${TAG} ${u.role} ${u.email.split('.')[1]}`,
          passwordHash: seed.passwordHash,
          status: u.email === LOCKED ? 'LOCKED' : 'ACTIVE',
          telegramChatId: chat ? String(chat) : null,
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
        if (failingChats.has(Number(p.chat_id))) throw new Error('Forbidden: bot was blocked by the user');
        return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: p.chat_id, type: 'private' }, text: p.text } } as never;
      }
      return { ok: true, result: true } as never;
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    const { PrismaClient } = await import('./../src/generated/prisma/client.js');
    const { createPgAdapter } = await import('./../src/infrastructure/database/pg-adapter.js');
    const db = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
    try {
      const found = await db.user.findMany({ where: { email: { startsWith: tagLower, endsWith: '@test.pvh.edu.vn' } } });
      const ids = found.map((u) => u.id);
      await db.agentAction.deleteMany({ where: { userId: { in: ids } } });
      await db.post.deleteMany({ where: { authorId: { in: ids } } });
      await db.notification.deleteMany({ where: { userId: { in: ids } } });
      await db.auditLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { action: 'post.review_notify', createdAt: { gte: START } }] } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await db.$disconnect();
    }
  });

  beforeEach(() => {
    calls = [];
    failingChats.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const ids = (await prisma.user.findMany({ where: { email: { in: TEST_USERS.map((u) => u.email) } }, select: { id: true } })).map((u) => u.id);
    await prisma.agentAction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.post.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  });

  // ── Hỗ trợ ────────────────────────────────────────────────────────────────────────────────────
  const http = () => request(app.getHttpServer());
  async function loginAs(email: string) {
    const a = request.agent(app.getHttpServer());
    await a.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return a;
  }
  const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const authUser = async (email: string) => (await usersService.findAuthUserByEmail(email))!;
  const webhook = (body: object) => http().post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send(body).expect(200);
  const chatOf = (chatId: number) => ({ id: chatId, type: 'private', first_name: 'x' });
  const textUpdate = (chatId: number, text: string) => ({
    update_id: ++updateId,
    message: {
      message_id: ++messageId,
      date: 0,
      chat: chatOf(chatId),
      from: { id: chatId, is_bot: false, first_name: 'x' },
      text,
      ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] } : {}),
    },
  });
  const buttonUpdate = (chatId: number, data: string, fromId = chatId) => ({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId + 1),
      chat_instance: 'x',
      from: { id: fromId, is_bot: false, first_name: 'x' },
      data,
      message: { message_id: 77, date: 0, chat: chatOf(chatId), text: 'Có bài mới chờ duyệt' },
    },
  });
  const sentTo = (chatId: number) => calls.filter((c) => c.method === 'sendMessage' && Number(c.payload.chat_id) === chatId);
  const textsTo = (chatId: number) => sentTo(chatId).map((c) => c.payload.text as string);
  const edits = () => calls.filter((c) => c.method === 'editMessageText').map((c) => c.payload);
  async function until(check: () => boolean | Promise<boolean>, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) return true;
      await sleep(40);
    }
    return false;
  }
  const dbPost = (id: string) => prisma.post.findUniqueOrThrow({ where: { id: BigInt(id) } });

  // Tác giả (giáo viên) tạo bài và gửi duyệt qua web.
  async function submitViaWeb(name: string, content = '<p>Nội dung bài viết cần duyệt.</p>', extra: object = {}, email = AUTHOR) {
    const a = await loginAs(email);
    const post = (await a.post('/posts').send({ title: `${TAG} ${name}`, content, ...extra }).expect(201)).body as { id: string; title: string };
    await a.post(`/posts/${post.id}/submit`).expect(200);
    return { ...post, agent: a };
  }
  // Chỉ đếm tin gửi tới chat của các tài khoản tạm (tài khoản seed trên máy dev có thể đã liên kết Telegram thật).
  const reviewMessages = () =>
    calls.filter(
      (c) =>
        c.method === 'sendMessage' &&
        Object.values(chats).includes(Number(c.payload.chat_id)) &&
        c.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('rv:v:'),
    );

  // ── 1. Ai nhận, khi nào gửi ───────────────────────────────────────────────────────────────────
  describe('gửi duyệt → báo người duyệt', () => {
    it('gửi duyệt trên web: người có quyền duyệt đã liên kết nhận ĐÚNG MỘT tin có nội dung bài; tác giả, người thiếu quyền, chưa liên kết, bị khoá không nhận', async () => {
      const post = await submitViaWeb('bài cần duyệt', '<h2>Lễ khai giảng</h2><p>Sáng nay trường tổ chức lễ khai giảng năm học mới.</p>' + imgTag());
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      await sleep(300);

      for (const email of [PRINCIPAL, EDITOR, SELF]) {
        const msgs = textsTo(chats[email]);
        expect(msgs).toHaveLength(1);
        expect(msgs[0]).toContain('Có bài mới chờ duyệt');
        expect(msgs[0]).toContain(`${TAG} bài cần duyệt`.replace('.', '​.'));
        expect(msgs[0]).toContain('Tác giả: ');
        expect(msgs[0]).toContain('Chuyên mục: chưa phân loại');
        expect(msgs[0]).toContain('Lễ khai giảng');
        expect(msgs[0]).toContain('Sáng nay trường tổ chức lễ khai giảng');
        expect(msgs[0]).toContain('Đính kèm: 1 ảnh');
        expect(msgs[0]).toMatch(/Gửi lúc: \d{2}:\d{2} \d{2}[-/]\d{2}/);
      }
      for (const email of [AUTHOR, OUTSIDER, LOCKED]) expect(textsTo(chats[email])).toHaveLength(0);
      expect(reviewMessages()).toHaveLength(REVIEWERS);
      // Không có parse_mode: văn bản thuần, không thể vỡ định dạng.
      expect(reviewMessages().every((c) => c.payload.parse_mode === undefined)).toBe(true);

      const audits = await prisma.auditLog.findMany({ where: { action: 'post.review_notify', targetId: BigInt(post.id) } });
      expect(audits.length).toBeGreaterThanOrEqual(REVIEWERS);
      expect(audits.every((a) => (a.payload as { ok: boolean }).ok)).toBe(true);
    });

    it('quyền lấy từ role_permissions: người chỉ có một trong hai quyền duyệt/đăng không nhận', async () => {
      const role = await prisma.role.create({ data: { code: `T${Date.now() % 100000}`, name: 'Chỉ duyệt' } });
      const approve = await prisma.permission.findUniqueOrThrow({ where: { code: 'post:approve' } });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: approve.id } });
      await prisma.userRole.deleteMany({ where: { userId: await userId(EDITOR) } });
      await prisma.userRole.create({ data: { userId: await userId(EDITOR), roleId: role.id } });
      const editorRole = await prisma.role.findUniqueOrThrow({ where: { code: 'EDITOR' } });
      try {
        await submitViaWeb('bài thiếu quyền đăng');
        expect(await until(() => reviewMessages().length >= 1)).toBe(true);
        await sleep(300);
        expect(textsTo(chats[PRINCIPAL])).toHaveLength(1);
        expect(textsTo(chats[EDITOR])).toHaveLength(0); // chỉ có post:approve, thiếu post:schedule
      } finally {
        await prisma.userRole.deleteMany({ where: { userId: await userId(EDITOR) } });
        await prisma.userRole.create({ data: { userId: await userId(EDITOR), roleId: editorRole.id } });
        await prisma.role.delete({ where: { id: role.id } });
      }
    });

    it('người có quyền duyệt tự viết bài và gửi duyệt thì không nhận tin của chính mình, người duyệt khác vẫn nhận', async () => {
      await submitViaWeb('bài tự duyệt', '<p>Biên tập viên tự viết.</p>', {}, SELF);
      expect(await until(() => reviewMessages().length >= REVIEWERS - 1)).toBe(true);
      await sleep(300);
      expect(textsTo(chats[SELF])).toHaveLength(0);
      expect(textsTo(chats[EDITOR])).toHaveLength(1);
      expect(textsTo(chats[PRINCIPAL])).toHaveLength(1);
    });

    it('gửi duyệt qua đường AI Agent/Telegram (PostsService kênh telegram) cũng báo; gửi duyệt lại sau khi bị từ chối thì báo lại; không báo trùng cùng một lần gửi', async () => {
      const a = await loginAs(AUTHOR);
      const post = (await a.post('/posts').send({ title: `${TAG} bài gửi qua bot`, content: '<p>Soạn qua Telegram.</p>' }).expect(201)).body;
      await posts.transition(await authUser(AUTHOR), post.id, 'submit', {}, { channel: 'telegram' });
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);

      // Gọi lại cùng một lần gửi: khoá chống trùng.
      expect(await review.notifyReviewers(post.id)).toBe(0);
      await sleep(200);
      expect(reviewMessages()).toHaveLength(REVIEWERS);

      // Bị từ chối, sửa, gửi lại: báo lại.
      const principal = await loginAs(PRINCIPAL);
      await principal.post(`/posts/${post.id}/reject`).send({ reason: 'Cần bổ sung ảnh' }).expect(200);
      await a.patch(`/posts/${post.id}`).send({ content: '<p>Đã bổ sung.</p>' }).expect(200);
      calls = [];
      await a.post(`/posts/${post.id}/submit`).expect(200);
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      expect(textsTo(chats[PRINCIPAL])).toHaveLength(1);
    });

    it('Telegram lỗi (người nhận đã chặn bot): gửi duyệt vẫn thành công, người khác vẫn nhận, có audit thất bại', async () => {
      failingChats.add(chats[PRINCIPAL]);
      const post = await submitViaWeb('bài khi telegram lỗi');
      expect(await until(async () => (await prisma.auditLog.count({ where: { action: 'post.review_notify', targetId: BigInt(post.id) } })) >= 2)).toBe(true);
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');
      expect(textsTo(chats[EDITOR])).toHaveLength(1);
      const failed = await prisma.auditLog.findFirst({ where: { action: 'post.review_notify', targetId: BigInt(post.id), userId: await userId(PRINCIPAL) } });
      expect((failed!.payload as { ok: boolean; error?: string }).ok).toBe(false);
      expect((failed!.payload as { error?: string }).error).toContain('blocked');
    });

    it('listener ném lỗi không làm hỏng việc gửi duyệt', async () => {
      vi.spyOn(review, 'notifyReviewers').mockRejectedValue(new Error('hỏng'));
      const post = await submitViaWeb('bài khi người nghe lỗi');
      await sleep(200);
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');
    });

    it('công tắc cấu hình telegram.review_notify: tắt thì không báo, mặc định bật', async () => {
      const admin = await loginAs(SEED_ADMIN);
      const before = (await admin.get('/settings').expect(200)).body.find((s: { key: string }) => s.key === 'telegram.review_notify');
      expect(before).toMatchObject({ input: 'toggle', defaultValue: 'true' });
      await admin.patch('/settings').send({ 'telegram.review_notify': 'khac' }).expect(400);
      await admin.patch('/settings').send({ 'telegram.review_notify': 'false' }).expect(200);
      try {
        await submitViaWeb('bài khi tắt thông báo');
        await sleep(600);
        expect(calls.filter((c) => c.method === 'sendMessage')).toHaveLength(0);
      } finally {
        await admin.patch('/settings').send({ 'telegram.review_notify': before.value ?? 'true' }).expect(200);
        if (before.value === null) await prisma.systemSetting.deleteMany({ where: { key: 'telegram.review_notify' } });
      }
      calls = [];
      await submitViaWeb('bài khi bật lại');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
    });
  });

  // ── 2. Nội dung tin nhắn ──────────────────────────────────────────────────────────────────────
  describe('nội dung tin nhắn an toàn', () => {
    it('tiêu đề/nội dung chứa <, &, @, HTML, liên kết giả: hiển thị an toàn, không parse_mode, không tạo liên kết/mention giả', async () => {
      await submitViaWeb(
        'a < b & c @quantri',
        '<p>Liên hệ @hieutruong qua <a href="https://evil.example/x">bấm vào đây</a>, truy cập http://evil.example hoặc www.evil.com ngay. 3 < 5 &amp; 7 > 2</p><script>alert(1)</script>',
      );
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      const c = reviewMessages()[0].payload;
      expect(c.parse_mode).toBeUndefined();
      const text = c.text as string;
      const body = text.slice(text.indexOf('\n\n') + 2);
      expect(text).not.toMatch(/@[A-Za-z]/); // không còn mention nhận diện được
      expect(body).not.toContain('://');
      expect(body).not.toMatch(/www\.[a-z]/i);
      expect(body).not.toMatch(/evil\.(example|com)/);
      expect(body).toContain('bấm vào đây');
      expect(body).toContain('3 < 5 & 7 > 2');
      expect(body).not.toContain('alert(1)');
    });

    it('đoạn đầu nội dung ~700 ký tự, giữ xuống dòng theo đoạn; ảnh/video đếm đúng; có chuyên mục', async () => {
      const category = await prisma.category.findFirstOrThrow({ orderBy: { id: 'asc' } });
      const long = Array.from({ length: 40 }, (_, i) => `<p>Đoạn số ${i} của bài viết khá dài để thử cắt bớt nội dung.</p>`).join('');
      await submitViaWeb(
        'bài dài',
        `${long}${imgTag()}${imgTag()}${videoTag()}`,
        { categoryId: category.id.toString() },
      );
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      const text = reviewMessages()[0].payload.text as string;
      const excerpt = text.slice(text.indexOf('\n\n') + 2);
      expect(excerpt.length).toBeLessThanOrEqual(701);
      expect(excerpt.endsWith('…')).toBe(true);
      expect(excerpt.split('\n').length).toBeGreaterThan(3);
      expect(text).toContain('Đính kèm: 2 ảnh, 1 video');
      expect(text).toContain(`Chuyên mục: ${category.name}`);
    });

    it('WEB_ORIGIN là localhost: không có nút URL (Telegram từ chối), hiện đường dẫn dạng văn bản; địa chỉ https công khai thì có nút "Mở trang duyệt"', async () => {
      const post = await submitViaWeb('bài localhost');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      const first = reviewMessages()[0].payload;
      const buttons = (first.reply_markup.inline_keyboard as { text: string; url?: string; callback_data?: string }[][]).flat();
      expect(buttons.some((b) => b.url)).toBe(false);
      expect(buttons.map((b) => b.callback_data)).toEqual([`rv:v:${post.id}`, `rv:a:${post.id}`, `rv:r:${post.id}`]);
      expect(first.text).toContain(`Trang duyệt: http://localhost:3000/bgh/bai-viet/${post.id}`);

      calls = [];
      (review as any).webUrl = (id: string) => `https://truong.example.vn/admin/bai-viet/${id}`;
      const again = await submitViaWeb('bài có nút url');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      delete (review as any).webUrl;
      const second = reviewMessages()[0].payload;
      const urlButton = (second.reply_markup.inline_keyboard as { text: string; url?: string }[][]).flat().find((b) => b.url);
      expect(urlButton).toMatchObject({ text: '🔗 Mở trang duyệt', url: `https://truong.example.vn/admin/bai-viet/${again.id}` });
      expect(second.text).not.toContain('Trang duyệt:');
    });
  });

  // ── 3. Nút bấm ────────────────────────────────────────────────────────────────────────────────
  describe('nút Xem toàn văn / Duyệt đăng / Từ chối', () => {
    it('Xem toàn văn: gửi đủ nội dung chia nhỏ ≤ 4096 ký tự, video kèm liên kết', async () => {
      const paragraphs = Array.from({ length: 120 }, (_, i) => `<p>Đoạn ${i}: ${'nội dung dài '.repeat(8)}</p>`).join('');
      const url = videoUrl();
      const post = await submitViaWeb('bài toàn văn', `${paragraphs}${videoTag(url)}`);
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      calls = [];
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:v:${post.id}`));
      const texts = textsTo(chats[PRINCIPAL]);
      expect(texts.length).toBeGreaterThan(1);
      expect(texts.every((t) => t.length <= 4096)).toBe(true);
      const all = texts.join('\n');
      expect(all).toContain('Đoạn 0:');
      expect(all).toContain('Đoạn 119:');
      expect(all).toContain('🎬 1 video');
      expect(all).toContain(`${apiBase()}/`);
      expect(all).toMatch(/\.mp4/);
      expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
      expect(await prisma.auditLog.count({ where: { action: 'telegram.review_view', targetId: BigInt(post.id), channel: 'telegram' } })).toBe(1);
    });

    it('Duyệt đăng: KHÔNG đăng ngay, hiện thẻ xác nhận; Xác nhận → PUBLISHED + tác giả nhận tin; Huỷ hoặc hết hạn → không đổi', async () => {
      const post = await submitViaWeb('bài duyệt đăng');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      calls = [];
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:a:${post.id}`));
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');
      const card = edits().at(-1)!;
      expect(card.text).toContain('Xác nhận đăng bài');
      const keyboard = card.reply_markup.inline_keyboard[0] as { text: string; callback_data: string }[];
      expect(keyboard.map((b) => b.text)).toEqual(['✅ Xác nhận', '❌ Huỷ']);
      const [confirm, cancel] = keyboard.map((b) => b.callback_data);

      // Huỷ rồi xác nhận: không đăng.
      await webhook(buttonUpdate(chats[PRINCIPAL], cancel));
      await webhook(buttonUpdate(chats[PRINCIPAL], confirm));
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');

      // Yêu cầu mới rồi để hết hạn.
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:a:${post.id}`));
      const id2 = (edits().at(-1)!.reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[2];
      await prisma.agentAction.update({ where: { id: BigInt(id2) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await webhook(buttonUpdate(chats[PRINCIPAL], `aa:c:${id2}`));
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');

      // Yêu cầu mới và xác nhận.
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:a:${post.id}`));
      const id3 = (edits().at(-1)!.reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[2];
      await webhook(buttonUpdate(chats[PRINCIPAL], `aa:c:${id3}`));
      const published = await dbPost(post.id);
      expect(published.status).toBe('PUBLISHED');
      expect(published.reviewerId).toBe(await userId(PRINCIPAL));
      expect(edits().at(-1)!.text).toContain('Đã đăng bài');
      const note = await prisma.notification.findFirst({ where: { userId: await userId(AUTHOR), title: 'Bài viết đã được duyệt' } });
      expect(note?.body).toContain('đã được duyệt và đăng');
    });

    it('Từ chối: bot hỏi lý do; tin kế tiếp là lý do (không chuyển cho AI Agent) → REJECTED có reject_reason, tác giả nhận tin kèm lý do', async () => {
      const chat = vi.spyOn(agent, 'chat');
      const post = await submitViaWeb('bài bị từ chối');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      calls = [];
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:r:${post.id}`));
      expect(textsTo(chats[PRINCIPAL])[0]).toContain('Nhắn lý do từ chối');
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');

      // Lý do quá dài: báo lỗi, vẫn chờ lý do.
      await webhook(textUpdate(chats[PRINCIPAL], 'x'.repeat(1001)));
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');
      await webhook(textUpdate(chats[PRINCIPAL], 'Nội dung chưa đạt, cần sửa lại phần mở đầu'));
      await telegram.idle();
      const rejected = await dbPost(post.id);
      expect(rejected).toMatchObject({ status: 'REJECTED', rejectReason: 'Nội dung chưa đạt, cần sửa lại phần mở đầu' });
      expect(rejected.reviewerId).toBe(await userId(PRINCIPAL));
      expect(chat).not.toHaveBeenCalled();
      expect(textsTo(chats[PRINCIPAL]).at(-1)).toContain('Đã từ chối bài');
      const note = await prisma.notification.findFirst({ where: { userId: await userId(AUTHOR), title: 'Bài viết bị từ chối' } });
      expect(note?.body).toContain('Nội dung chưa đạt');
      expect(await prisma.auditLog.count({ where: { action: 'post.reject', targetId: BigInt(post.id), channel: 'telegram' } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'telegram.review_reject', targetId: BigInt(post.id) } })).toBeGreaterThanOrEqual(2);

      // Hết trạng thái chờ lý do: tin sau đó lại đi vào AI Agent.
      chat.mockResolvedValue({ reply: 'ok', numTurns: 1, costUsd: 0, pendingActions: [] });
      await webhook(textUpdate(chats[PRINCIPAL], 'Có bài nào chờ duyệt không?'));
      await telegram.idle();
      expect(chat).toHaveBeenCalledTimes(1);
    });

    it('/huy thoát trạng thái chờ lý do; lý do hết hạn (5 phút) cũng không còn hiệu lực', async () => {
      const chat = vi.spyOn(agent, 'chat').mockResolvedValue({ reply: 'ok', numTurns: 1, costUsd: 0, pendingActions: [] });
      const post = await submitViaWeb('bài huỷ lý do');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:r:${post.id}`));
      calls = [];
      await webhook(textUpdate(chats[PRINCIPAL], '/huy'));
      expect(textsTo(chats[PRINCIPAL])[0]).toContain('Đã thôi nhập lý do');
      await webhook(textUpdate(chats[PRINCIPAL], 'Đây là tin thường'));
      await telegram.idle();
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');
      expect(chat).toHaveBeenCalledTimes(1);
    });

    it('kiểm tra mỗi lần bấm: chat lạ, người giả danh chat, người không có quyền, người mất quyền đều bị từ chối và bài không đổi', async () => {
      const post = await submitViaWeb('bài kiểm quyền');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);

      // Chat chưa liên kết (nhóm người lạ) bấm: báo cần liên kết.
      calls = [];
      await webhook(buttonUpdate(newChat(), `rv:a:${post.id}`));
      expect(calls.find((c) => c.method === 'answerCallbackQuery')!.payload.text).toContain('chưa liên kết');
      // Người khác bấm nút trong chat của người duyệt (from.id khác chat): bị bỏ qua.
      calls = [];
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:a:${post.id}`, chats[OUTSIDER]));
      expect(calls.filter((c) => c.method === 'editMessageText' || c.method === 'sendMessage')).toHaveLength(0);
      // Giáo viên khác (không có quyền) có được tin chuyển tiếp rồi bấm.
      calls = [];
      await webhook(buttonUpdate(chats[OUTSIDER], `rv:a:${post.id}`));
      await webhook(buttonUpdate(chats[OUTSIDER], `rv:r:${post.id}`));
      await webhook(buttonUpdate(chats[OUTSIDER], `rv:v:${post.id}`));
      expect(textsTo(chats[OUTSIDER]).every((t) => t.includes('không (còn) quyền'))).toBe(true);
      expect(textsTo(chats[OUTSIDER])).toHaveLength(3);
      expect(await prisma.agentAction.count({ where: { userId: await userId(OUTSIDER) } })).toBe(0);

      // Mất quyền sau khi nhận tin.
      const roles = await prisma.userRole.findMany({ where: { userId: await userId(EDITOR) } });
      await prisma.userRole.deleteMany({ where: { userId: await userId(EDITOR) } });
      try {
        calls = [];
        await webhook(buttonUpdate(chats[EDITOR], `rv:a:${post.id}`));
        expect(textsTo(chats[EDITOR])[0]).toContain('không (còn) quyền');
      } finally {
        await prisma.userRole.createMany({ data: roles });
      }
      // Từ chối khi chưa có quyền không mở trạng thái chờ lý do.
      expect((await dbPost(post.id)).status).toBe('PENDING_REVIEW');
    });

    it('bài đã được người khác xử lý: tin sửa thành "đã được … xử lý lúc …" và không làm gì thêm; hai người bấm cùng lúc chỉ một người thành công', async () => {
      const post = await submitViaWeb('bài đã xử lý');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);

      // Cả hai cùng tạo thẻ xác nhận rồi cùng bấm Xác nhận.
      calls = [];
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:a:${post.id}`));
      await webhook(buttonUpdate(chats[EDITOR], `rv:a:${post.id}`));
      const ids = edits().map((e) => (e.reply_markup.inline_keyboard[0][0].callback_data as string).split(':')[2]);
      expect(ids).toHaveLength(2);
      await Promise.all([webhook(buttonUpdate(chats[PRINCIPAL], `aa:c:${ids[0]}`)), webhook(buttonUpdate(chats[EDITOR], `aa:c:${ids[1]}`))]);
      expect((await dbPost(post.id)).status).toBe('PUBLISHED');
      expect(await prisma.auditLog.count({ where: { action: 'post.approve', targetId: BigInt(post.id) } })).toBe(1);
      const statuses = (await prisma.agentAction.findMany({ where: { id: { in: ids.map(BigInt) } } })).map((a) => a.status).sort();
      expect(statuses).toEqual(['DONE', 'FAILED']);

      // Bấm nút trên tin cũ sau khi bài đã được xử lý.
      calls = [];
      await webhook(buttonUpdate(chats[EDITOR], `rv:r:${post.id}`));
      await webhook(buttonUpdate(chats[EDITOR], `rv:a:${post.id}`));
      const done = edits();
      expect(done).toHaveLength(2);
      for (const e of done) {
        expect(e.text).toMatch(/đã được .+ duyệt lúc \d{2}:\d{2} \d{2}[-/]\d{2}/);
        expect(e.reply_markup).toBeUndefined();
      }
      expect(await prisma.agentAction.count({ where: { userId: await userId(EDITOR) } })).toBe(1); // không tạo thêm yêu cầu
    });

    it('tác giả rút lại bài (không còn chờ duyệt): thông báo trạng thái hiện tại, không xử lý', async () => {
      const post = await submitViaWeb('bài rút lại');
      expect(await until(() => reviewMessages().length >= REVIEWERS)).toBe(true);
      await prisma.post.update({ where: { id: BigInt(post.id) }, data: { status: 'DRAFT' } });
      calls = [];
      await webhook(buttonUpdate(chats[PRINCIPAL], `rv:r:${post.id}`));
      expect(edits()[0].text).toContain('không còn ở trạng thái chờ duyệt');
      expect(edits()[0].text).toContain('Nháp');
    });
  });

  // ── 4. Thông báo cho tác giả ──────────────────────────────────────────────────────────────────
  describe('thông báo cho tác giả khi bài được duyệt hoặc bị từ chối (web)', () => {
    it('người khác duyệt/từ chối trên web → tác giả nhận thông báo; tự duyệt bài của mình thì không', async () => {
      const principal = await loginAs(PRINCIPAL);
      const approved = await submitViaWeb('bài được duyệt web');
      await principal.post(`/posts/${approved.id}/approve`).send({}).expect(200);
      const rejected = await submitViaWeb('bài bị từ chối web');
      await principal.post(`/posts/${rejected.id}/reject`).send({ reason: 'Sai chính tả nhiều' }).expect(200);
      const notes = await prisma.notification.findMany({ where: { userId: await userId(AUTHOR) } });
      expect(notes.find((n) => n.title === 'Bài viết đã được duyệt')?.body).toContain('bài được duyệt web');
      expect(notes.find((n) => n.title === 'Bài viết bị từ chối')?.body).toContain('Sai chính tả nhiều');

      // Hẹn giờ: nêu giờ hẹn.
      const scheduled = await submitViaWeb('bài hẹn giờ web');
      await principal.post(`/posts/${scheduled.id}/approve`).send({ publishAt: new Date(Date.now() + 5 * 3_600_000).toISOString() }).expect(200);
      expect((await prisma.notification.findMany({ where: { userId: await userId(AUTHOR), body: { contains: 'hẹn đăng lúc' } } }))).toHaveLength(1);

      // Tự duyệt bài của chính mình: không tự báo cho mình.
      const own = await submitViaWeb('bài tự duyệt web', '<p>Tự viết tự duyệt.</p>', {}, SELF);
      await own.agent.post(`/posts/${own.id}/approve`).send({}).expect(200);
      expect(await prisma.notification.count({ where: { userId: await userId(SELF) } })).toBe(0);
    });
  });
});
