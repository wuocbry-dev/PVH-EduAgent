import {
  HttpException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mediaKindOf,
  TELEGRAM_MAX_FILE_BYTES,
  type AgentActionDto,
  type AgentAttachment,
  type MediaDto,
} from '@pvh/shared';
import { Bot, InlineKeyboard, type Context } from 'grammy';
import type { Update } from 'grammy/types';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { AgentActionsService } from '../agent-actions/agent-actions.service.js';
import { AgentService } from '../agent/agent.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { MediaService } from '../media/media.service.js';
import { SystemService } from '../system/system.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { splitMessage } from './split-message.js';
import { TelegramAlbumService } from './telegram-album.service.js';
import { TelegramContextService } from './telegram-context.service.js';
import { TelegramFileService } from './telegram-file.service.js';
import { TelegramLinkService, type LinkResult } from './telegram-link.service.js';
import { TelegramRateLimiter } from './telegram-rate-limiter.js';
import { SettingsService } from '../settings/settings.service.js';
import { TelegramReviewService } from './telegram-review.service.js';

// Mỗi chat tối đa 20 tin / phút; tin vượt hạn mức bị bỏ qua (chỉ cảnh báo một lần).
const MESSAGE_LIMIT = 20;
const MESSAGE_WINDOW_SEC = 60;
const DEADLINE_HOURS = 48;
const DEADLINE_MAX_ITEMS = 30;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
// Dung lượng file mỗi người được gửi cho bot (đếm theo byte đã lưu thành công).
const BYTES_PER_HOUR = 100 * 1024 * 1024;
const BYTES_PER_DAY = 500 * 1024 * 1024;
const NO_CAPTION_TEXT = 'Người dùng chỉ gửi tệp, chưa có yêu cầu.';

const HELP = [
  'Các lệnh:',
  '/status – tình trạng hệ thống',
  `/deadline – công việc sắp đến hạn (${DEADLINE_HOURS} giờ tới) và quá hạn`,
  '/huy – bỏ bản nháp đang soạn và huỷ các yêu cầu đang chờ xác nhận',
  '/unlink – huỷ liên kết tài khoản',
  '/help – xem lại hướng dẫn',
  '',
  'Hoặc nhắn tự do cho trợ lý AI, ví dụ: "Có bài nào chờ duyệt không?"',
  `Soạn bài: gửi ảnh/video (tối đa ${TELEGRAM_MAX_FILE_BYTES / 1024 / 1024} MB mỗi file) kèm nội dung, ví dụ "Viết bài về lễ khai giảng, kèm các ảnh này". Muốn đăng thì nhắn "đăng bài này"; trợ lý sẽ hỏi xác nhận trước khi đăng.`,
].join('\n');

const LINK_GUIDE = [
  'Chào bạn! Đây là trợ lý của Trường THPT Phan Văn Hớn.',
  'Chat này chưa liên kết với tài khoản nào nên chưa ra lệnh được.',
  '',
  'Cách liên kết:',
  '1. Đăng nhập trang quản trị, vào "Tài khoản" và bấm "Liên kết Telegram".',
  '2. Gửi cho bot: /link <mã 6 số> (mã có hạn 5 phút).',
].join('\n');

const LINK_ERRORS: Record<Exclude<LinkResult, { ok: true }>['reason'], string> = {
  invalid: 'Mã không hợp lệ hoặc đã hết hạn. Hãy sinh mã mới trên trang quản trị.',
  locked: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.',
  chat_taken: 'Chat này đã liên kết với một tài khoản khác. Gửi /unlink trước rồi liên kết lại.',
  inactive: 'Tài khoản không còn hoạt động nên không liên kết được.',
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
}

// Dòng kết quả thay cho tin hỏi xác nhận sau khi bấm nút.
function actionResultText(action: AgentActionDto, what: 'confirm' | 'cancel', webOrigin: string): string {
  switch (action.status) {
    case 'DONE':
      // Bài đã đăng: kèm đường dẫn để mở xem ngay.
      return `✅ ${action.resultMessage ?? action.description}${action.resultSlug ? `\n${webOrigin}/tin-tuc/${action.resultSlug}` : ''}`;
    case 'FAILED':
      return `⚠️ Không thực hiện được: ${action.resultMessage ?? action.description}`;
    case 'CANCELLED':
      return `❌ Đã huỷ: ${action.description}`;
    case 'EXPIRED':
      return `⌛ Yêu cầu đã hết hạn, chưa thực hiện: ${action.description}`;
    default:
      return what === 'confirm'
        ? `Yêu cầu này đã được xử lý trước đó (${action.status}), không thực hiện lại.`
        : `Yêu cầu này đã được xử lý trước đó (${action.status}).`;
  }
}

// Lỗi nghiệp vụ (thiếu quyền, AI chưa cấu hình...) trả nguyên thông báo tiếng Việt; lỗi khác thì báo chung.
const BOT_PAUSED = 'Bot đang tạm ngưng nhận lệnh theo quyết định của quản trị hệ thống. Vui lòng dùng website hoặc thử lại sau.';

const errorText = (err: unknown) =>
  err instanceof HttpException && err.getStatus() < 500
    ? err.message
    : err instanceof HttpException && err.getStatus() === 503
      ? 'Trợ lý AI chưa sẵn sàng (chưa cấu hình khóa API). Vui lòng báo quản trị viên.'
      : 'Có lỗi khi xử lý yêu cầu, vui lòng thử lại sau.';

// Kết quả lưu một tệp: tệp mô tả cho agent và chú thích đi kèm (nếu có).
interface SavedFile {
  caption: string;
  attachment: AgentAttachment;
}

// A01–A04 – bot Telegram (grammY). Chỉ chat riêng đã liên kết mới được ra lệnh; người lạ chỉ nhận hướng dẫn.
// Chế độ theo TELEGRAM_MODE: polling (dev), webhook (production, nhận qua TelegramController), off.
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  readonly bot?: Bot;
  readonly mode: Env['TELEGRAM_MODE'];
  private initPromise?: Promise<void>;
  private polling = false;
  // Các lượt chat với agent đang chạy nền (test chờ bằng `idle()`).
  private readonly running = new Set<Promise<void>>();
  // Các tin có tệp đang xử lý theo chat: tin chữ gửi ngay sau đó phải chờ để thấy được các tệp vừa gửi.
  private readonly fileTasks = new Map<string, Set<Promise<void>>>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly links: TelegramLinkService,
    private readonly limiter: TelegramRateLimiter,
    private readonly system: SystemService,
    private readonly tasks: TasksService,
    private readonly agent: AgentService,
    private readonly audit: AuditLogService,
    private readonly actions: AgentActionsService,
    private readonly media: MediaService,
    private readonly context: TelegramContextService,
    private readonly albums: TelegramAlbumService,
    private readonly files: TelegramFileService,
    private readonly review: TelegramReviewService,
    private readonly settings: SettingsService,
  ) {
    this.mode = config.get('TELEGRAM_MODE', { infer: true });
    const token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (!token) return;
    this.bot = new Bot(token);
    this.bot.catch((err) =>
      this.logger.error(`Lỗi xử lý tin Telegram: ${String(err.error)}`),
    );
    this.registerHandlers(this.bot);
  }

  get enabled(): boolean {
    return !!this.bot;
  }

  onApplicationBootstrap(): void {
    if (!this.bot) {
      this.logger.warn('Chưa cấu hình TELEGRAM_BOT_TOKEN: bot Telegram đang tắt');
      return;
    }
    if (this.mode === 'polling') {
      this.polling = true;
      // Không await: bot.start() chỉ kết thúc khi dừng bot. Nó tự xoá webhook cũ trước khi polling.
      this.bot
        .start({
          allowed_updates: ['message', 'callback_query'],
          onStart: (info) => this.logger.log(`Bot @${info.username} đang chạy (long polling)`),
        })
        .catch((err) => {
          this.polling = false;
          this.logger.error(
            `Bot Telegram dừng polling: ${String(err)}. (409 = có tiến trình khác đang dùng cùng token)`,
          );
        });
    } else if (this.mode === 'webhook') {
      if (!this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true })) {
        this.logger.error('Chế độ webhook cần TELEGRAM_WEBHOOK_SECRET: mọi request webhook sẽ bị từ chối');
      }
      void this.registerWebhook();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot && this.polling) {
      this.polling = false;
      await this.bot.stop().catch(() => undefined);
    }
    await this.idle();
  }

  // Đọc thông tin bot (getMe) một lần; cần trước khi xử lý update và để biết @username.
  async ensureInit(): Promise<void> {
    if (!this.bot || this.bot.isInited()) return;
    this.initPromise ??= this.bot.init().catch((err: unknown) => {
      this.initPromise = undefined;
      throw err;
    });
    await this.initPromise;
  }

  async botUsername(): Promise<string | null> {
    try {
      await this.ensureInit();
      return this.bot?.botInfo.username ?? null;
    } catch (err) {
      this.logger.warn(`Không đọc được thông tin bot: ${String(err)}`);
      return null;
    }
  }

  // Webhook: xử lý một update Telegram gửi tới.
  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot) return;
    await this.ensureInit();
    await this.bot.handleUpdate(update);
  }

  // Gửi tin văn bản thuần, tự chia nếu dài quá 4096 ký tự.
  async sendText(chatId: string | number, text: string): Promise<void> {
    if (!this.bot) return;
    for (const part of splitMessage(text)) {
      await this.bot.api.sendMessage(chatId, part, {
        link_preview_options: { is_disabled: true },
      });
    }
  }

  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled(this.running);
  }

  private async registerWebhook(): Promise<void> {
    const url = this.config.get('TELEGRAM_WEBHOOK_URL', { infer: true });
    if (!this.bot || !url) return;
    try {
      await this.bot.api.setWebhook(url, {
        secret_token: this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }),
        allowed_updates: ['message', 'callback_query'],
      });
      this.logger.log(`Đã đăng ký webhook Telegram: ${url}`);
    } catch (err) {
      this.logger.error(`Không đăng ký được webhook Telegram: ${String(err)}`);
    }
  }

  private registerHandlers(bot: Bot): void {
    // Chỉ nhận tin văn bản trong chat riêng; nhóm/kênh bị bỏ qua để không lộ dữ liệu cho người khác.
    bot.use(async (ctx, next) => {
      const callback = ctx.callbackQuery;
      // Tin văn bản và nút Xác nhận/Huỷ (callback_query) trong chat riêng; mọi loại update khác bị bỏ qua.
      const chat = callback ? callback.message?.chat : ctx.chat;
      const m = ctx.message;
      const hasFile = !!(m?.photo || m?.video || m?.document);
      if (chat?.type !== 'private' || !(callback?.data || m?.text || hasFile)) return;
      const chatId = String(chat.id);
      // Telegram gửi lại cùng một update hoặc người dùng gửi lặp: mỗi tin chỉ xử lý một lần.
      if (m && !(await this.context.firstTime(chatId, m.message_id))) return;
      if (callback) {
        // Người bấm phải chính là chủ chat riêng (id người dùng Telegram trùng id chat riêng).
        if (String(callback.from.id) !== chatId) return;
      }
      const count = await this.limiter.increment('msg', chatId, MESSAGE_WINDOW_SEC);
      if (count > MESSAGE_LIMIT) {
        if (count === MESSAGE_LIMIT + 1) {
          await this.sendText(chatId, 'Bạn gửi quá nhiều tin trong thời gian ngắn, vui lòng chờ một phút.');
        }
        if (callback) await ctx.answerCallbackQuery().catch(() => undefined);
        return;
      }
      // Bước 27: công tắc khẩn cấp telegram.bot_enabled. Bot ngừng nhận lệnh (báo một lần mỗi 10 phút mỗi chat);
      // thông báo và cảnh báo cho quản trị vẫn được gửi đi (TelegramNotifierService không đi qua đây).
      if ((await this.settings.effective('telegram.bot_enabled')) !== 'true') {
        if (callback) await ctx.answerCallbackQuery({ text: BOT_PAUSED }).catch(() => undefined);
        else if ((await this.limiter.increment('paused', chatId, 600)) === 1) await this.sendText(chatId, BOT_PAUSED);
        return;
      }
      await next();
    });

    // A08 – nút Xác nhận / Huỷ dưới tin nhắn của agent. callback_data: aa:c:<id> hoặc aa:x:<id>.
    bot.callbackQuery(/^aa:([cx]):(\d{1,18})$/, (ctx) =>
      this.onActionButton(ctx, ctx.match[1] === 'c' ? 'confirm' : 'cancel', ctx.match[2]),
    );
    // Báo người duyệt có bài mới: nút Xem toàn văn / Duyệt đăng / Từ chối. callback_data: rv:v|a|r:<id>.
    bot.callbackQuery(/^rv:([var]):(\d{1,18})$/, (ctx) =>
      this.review.onButton(ctx, ctx.match[1] as 'v' | 'a' | 'r', ctx.match[2]),
    );
    bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery().catch(() => undefined));

    bot.command('start', async (ctx) => {
      const payload = ctx.match.trim();
      if (/^\d{6}$/.test(payload)) return this.link(ctx, payload);
      const user = await this.links.findUserByChat(this.chatId(ctx));
      await this.reply(ctx, user ? `Xin chào ${user.fullName}!\n\n${HELP}` : LINK_GUIDE);
    });

    bot.command('link', async (ctx) => {
      const code = ctx.match.trim();
      if (!code) return this.reply(ctx, 'Cú pháp: /link <mã 6 số> (sinh mã trên trang quản trị → Tài khoản).');
      return this.link(ctx, code);
    });

    bot.command('help', async (ctx) => {
      const user = await this.links.findUserByChat(this.chatId(ctx));
      await this.reply(ctx, user ? HELP : LINK_GUIDE);
    });

    bot.command('unlink', async (ctx) => {
      const done = await this.links.unlinkChat(this.chatId(ctx));
      await this.reply(
        ctx,
        done
          ? 'Đã huỷ liên kết. Bot sẽ không nhận lệnh hay gửi thông báo cho chat này nữa.'
          : 'Chat này chưa liên kết với tài khoản nào.',
      );
    });

    bot.command('huy', async (ctx) => {
      const user = await this.links.findUserByChat(this.chatId(ctx));
      if (!user) return this.reject(ctx, 'huy');
      await this.context.clear(this.chatId(ctx));
      const wasRejecting = await this.review.clearReject(this.chatId(ctx));
      let cancelled = 0;
      for (const action of await this.actions.listPending(user)) {
        await this.actions.cancel(user, action.id, 'telegram').then(() => cancelled++, () => undefined);
      }
      await this.audit.record({
        userId: user.id,
        channel: 'telegram',
        action: 'telegram.huy',
        params: { cancelledActions: cancelled },
        ok: true,
      });
      await this.reply(
        ctx,
        `Đã bỏ bản nháp đang soạn (tin nhắn và tệp đã gửi chưa gắn vào bài).${cancelled ? ` Đã huỷ ${cancelled} yêu cầu đang chờ xác nhận.` : ''}${wasRejecting ? ' Đã thôi nhập lý do từ chối bài.' : ''}`,
      );
    });

    bot.command('status', (ctx) =>
      this.asUser(ctx, 'status', async (user) => this.statusText(user)),
    );

    bot.command('deadline', (ctx) =>
      this.asUser(ctx, 'deadline', async (user) => this.deadlineText(user)),
    );

    // Ảnh, video, tệp: lưu thành media của người gửi (kiểm tra loại bằng magic bytes + dung lượng) rồi chuyển cho agent.
    bot.on(['message:photo', 'message:video', 'message:document'], async (ctx) => {
      const user = await this.links.findUserByChat(this.chatId(ctx));
      if (!user) return this.reject(ctx, 'file');
      this.trackFile(this.chatId(ctx), this.onFileMessage(ctx, user));
    });

    // Tin nhắn tự do (và lệnh lạ) → AI Agent, hành động thay mặt người đã liên kết.
    bot.on('message:text', async (ctx) => {
      const text = ctx.message.text.trim();
      const chatId = this.chatId(ctx);
      const user = await this.links.findUserByChat(chatId);
      if (!user) return this.reject(ctx, 'chat');
      if (text.startsWith('/')) return this.reply(ctx, `Không có lệnh này.\n\n${HELP}`);
      // Đang chờ lý do từ chối bài thì tin này là lý do, không chuyển cho AI Agent.
      if (await this.review.consumeRejectReason(ctx, user, text)) return;
      this.track(this.afterFiles(chatId).then(() => this.chatWithAgent(ctx, user, text)));
    });
  }

  private chatId(ctx: Context): string {
    return String(ctx.chat!.id);
  }

  private async reply(ctx: Context, text: string): Promise<void> {
    await this.sendText(ctx.chat!.id, text);
  }

  private async link(ctx: Context, code: string): Promise<void> {
    const chatId = this.chatId(ctx);
    const current = await this.links.findUserByChat(chatId);
    if (current) {
      return this.reply(ctx, `Chat này đã liên kết với tài khoản ${current.fullName}. Gửi /unlink nếu muốn đổi tài khoản.`);
    }
    const result = await this.links.verifyAndLink(code, chatId);
    if (!result.ok) return this.reply(ctx, LINK_ERRORS[result.reason]);
    await this.reply(ctx, `Liên kết thành công! Xin chào ${result.user.fullName}.\n\n${HELP}`);
  }

  // Chat lạ: không gọi lệnh hay agent, chỉ gửi hướng dẫn liên kết.
  private async reject(ctx: Context, command: string): Promise<void> {
    await this.audit.record({
      userId: null,
      channel: 'telegram',
      action: 'telegram.rejected',
      params: { chatId: this.chatId(ctx), command },
      ok: false,
      error: 'Chat chưa liên kết',
    });
    await this.reply(ctx, LINK_GUIDE);
  }

  // Lệnh cần tài khoản đã liên kết; quyền do service kiểm tra theo đúng người dùng đó.
  private async asUser(ctx: Context, command: string, run: (user: AuthUser) => Promise<string>): Promise<void> {
    const user = await this.links.findUserByChat(this.chatId(ctx));
    if (!user) return this.reject(ctx, command);
    let text: string;
    let error: string | undefined;
    try {
      text = await run(user);
    } catch (err) {
      text = errorText(err);
      error = err instanceof Error ? err.message : String(err);
    }
    await this.audit.record({
      userId: user.id,
      channel: 'telegram',
      action: `telegram.${command}`,
      ok: !error,
      error,
    });
    await this.reply(ctx, text);
  }

  private async statusText(user: AuthUser): Promise<string> {
    const s = await this.system.getStatus(user);
    const q = s.queue;
    const sum = (key: 'waiting' | 'delayed' | 'active' | 'failed') =>
      q.queues.reduce((total, item) => total + item[key], 0);
    const queueLine = !q.enabled
      ? 'Đang tắt (chưa cấu hình Redis)'
      : q.error
        ? q.error
        : `Hoạt động – ${sum('delayed')} đã hẹn giờ, ${sum('waiting') + sum('active')} đang chờ/chạy, ${sum('failed')} lỗi`;
    return [
      '📊 Tình trạng hệ thống',
      `• Cơ sở dữ liệu: ${s.database === 'ok' ? 'Hoạt động' : 'MẤT KẾT NỐI'}`,
      `• Bộ lập lịch: ${queueLine}`,
      `• Thời gian chạy: ${formatUptime(s.uptimeSec)} · Bộ nhớ: ${s.memoryMb} MB`,
      `• Bài chờ duyệt: ${s.postsPendingReview} · Bài đã hẹn giờ: ${s.postsScheduled}`,
    ].join('\n');
  }

  private async deadlineText(user: AuthUser): Promise<string> {
    const items = await this.tasks.listDeadlines(user, DEADLINE_HOURS);
    const own = !user.permissions.includes('task:read:all');
    if (items.length === 0) {
      return `✅ Không có công việc ${own ? 'nào của bạn ' : ''}quá hạn hay đến hạn trong ${DEADLINE_HOURS} giờ tới.`;
    }
    const lines = items.slice(0, DEADLINE_MAX_ITEMS).map((t, i) => {
      const who = own ? '' : ` – ${t.assigneeName}`;
      return `${i + 1}. ${t.overdue ? '🔴 QUÁ HẠN ' : ''}${t.title} – hạn ${formatTime(t.dueAt)}${who}`;
    });
    if (items.length > DEADLINE_MAX_ITEMS) lines.push(`… và ${items.length - DEADLINE_MAX_ITEMS} việc khác (xem trên trang quản trị).`);
    return [`⏰ Công việc ${own ? 'của bạn ' : ''}quá hạn và đến hạn trong ${DEADLINE_HOURS} giờ tới:`, ...lines].join('\n');
  }

  // Mô tả một tệp trong tin nhắn; null nếu loại này không nhận.
  private describeFile(ctx: Context): { fileId: string; size?: number; name: string; mime?: string } | null {
    const m = ctx.message!;
    if (m.photo?.length) {
      // Ảnh Telegram gửi nhiều kích cỡ; lấy bản lớn nhất.
      const best = m.photo[m.photo.length - 1];
      return { fileId: best.file_id, size: best.file_size, name: 'ảnh', mime: 'image/jpeg' };
    }
    if (m.video) return { fileId: m.video.file_id, size: m.video.file_size, name: m.video.file_name ?? 'video', mime: m.video.mime_type };
    if (m.document) return { fileId: m.document.file_id, size: m.document.file_size, name: m.document.file_name ?? 'tệp', mime: m.document.mime_type };
    return null;
  }

  private async fileAudit(user: AuthUser, ok: boolean, params: Record<string, unknown>, error?: string): Promise<void> {
    await this.audit.record({ userId: user.id, channel: 'telegram', action: 'telegram.file', params, ok, error });
  }

  // Một tin có tệp. Album (nhiều tin cùng media_group_id) được gom để agent chỉ chạy một lần.
  private async onFileMessage(ctx: Context, user: AuthUser): Promise<void> {
    const chatId = this.chatId(ctx);
    const caption = ctx.message?.caption?.trim() ?? '';
    const groupId = ctx.message?.media_group_id;
    const processOne = () => this.saveFile(ctx, user, caption);
    const items = groupId
      ? await this.albums.collect<SavedFile>(chatId, groupId, processOne)
      : await processOne().then((item) => (item ? [item] : []));
    if (items === null || items.length === 0) return; // tin khác trong album sẽ lo, hoặc không có file nào hợp lệ

    const attachments = items.map((i) => i.attachment);
    await this.context.addAttachments(chatId, attachments);
    const text = items.map((i) => i.caption).find(Boolean);
    if (text) return this.chatWithAgent(ctx, user, text);

    const images = attachments.filter((a) => a.kind === 'IMAGE').length;
    const videos = attachments.length - images;
    const what = [images ? `${images} ảnh` : '', videos ? `${videos} video` : ''].filter(Boolean).join(' và ');
    await this.reply(
      ctx,
      `Đã nhận ${what}. Hãy nhắn nội dung bạn muốn, ví dụ: "Viết bài về ... kèm các ảnh này" (gửi /huy để bỏ).`,
    );
  }

  // Kiểm tra, tải và lưu một tệp. Trả null (kèm trả lời tiếng Việt cho người gửi) nếu bị từ chối.
  private async saveFile(ctx: Context, user: AuthUser, caption: string): Promise<SavedFile | null> {
    const chatId = this.chatId(ctx);
    const file = this.describeFile(ctx);
    const refuse = async (message: string, reason: string, params: Record<string, unknown> = {}) => {
      await this.fileAudit(user, false, { reason, ...params }, message);
      await this.reply(ctx, message).catch(() => undefined);
      return null;
    };
    if (!file) return refuse('Loại tin nhắn này chưa được hỗ trợ.', 'unsupported');
    if (file.mime && file.mime !== 'application/octet-stream' && !mediaKindOf(file.mime)) {
      return refuse('Chỉ nhận ảnh JPEG, PNG, WebP, GIF và video MP4, WebM.', 'mime', { mime: file.mime });
    }
    if (file.size && file.size > TELEGRAM_MAX_FILE_BYTES) {
      return refuse(
        `File lớn hơn ${TELEGRAM_MAX_FILE_BYTES / 1024 / 1024} MB nên bot Telegram không tải được. Hãy đăng video/ảnh này trực tiếp trên web (trang quản trị → Bài viết).`,
        'too_large',
        { size: file.size },
      );
    }
    // Hạn mức dung lượng theo giờ và theo ngày của mỗi người.
    const size = file.size ?? 0;
    const [hour, day] = await Promise.all([
      this.limiter.peek('bytes-hour', user.id),
      this.limiter.peek('bytes-day', user.id),
    ]);
    if (hour + size > BYTES_PER_HOUR) {
      return refuse('Bạn đã gửi quá nhiều tệp trong 1 giờ qua (tối đa 100 MB), vui lòng thử lại sau.', 'quota_hour', { size });
    }
    if (day + size > BYTES_PER_DAY) {
      return refuse('Bạn đã gửi quá nhiều tệp trong hôm nay (tối đa 500 MB), vui lòng thử lại vào ngày mai.', 'quota_day', { size });
    }

    let saved: MediaDto;
    try {
      const buffer = await this.files.download(ctx.api, file.fileId);
      saved = await this.media.createFromBuffer(user, buffer, { channel: 'telegram' });
    } catch (err) {
      return refuse(errorText(err), 'save_failed');
    }
    await Promise.all([
      this.limiter.increment('bytes-hour', user.id, 3600, saved.size),
      this.limiter.increment('bytes-day', user.id, 86400, saved.size),
    ]);
    await this.fileAudit(user, true, { mediaId: saved.id, kind: saved.kind, size: saved.size, chatId });
    return {
      caption,
      attachment: { mediaId: saved.id, kind: saved.kind, size: saved.size, name: file.name.slice(0, 80) },
    };
  }

  private async chatWithAgent(ctx: Context, user: AuthUser, text: string): Promise<void> {
    await ctx.replyWithChatAction('typing').catch(() => undefined);
    const chatId = this.chatId(ctx);
    let error: string | undefined;
    try {
      const chat = await this.context.get(chatId);
      const res = await this.agent.chat(
        { user, channel: 'telegram', attachments: chat.attachments, history: chat.history },
        text || NO_CAPTION_TEXT,
      );
      await this.context.recordTurn(chatId, text, res.reply, res.usedMediaIds);
      await this.reply(ctx, res.reply || 'Trợ lý không có câu trả lời.');
      for (const action of res.pendingActions ?? []) await this.sendActionPrompt(ctx.chat!.id, action);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      await this.reply(ctx, errorText(err)).catch(() => undefined);
    }
    await this.audit.record({
      userId: user.id,
      channel: 'telegram',
      action: 'telegram.chat',
      params: { length: text.length },
      ok: !error,
      error,
    });
  }

  // Tin hỏi xác nhận kèm hai nút inline cho một hành động nhạy cảm đang chờ.
  private async sendActionPrompt(chatId: string | number, action: AgentActionDto): Promise<void> {
    const keyboard = new InlineKeyboard()
      .text('✅ Xác nhận', `aa:c:${action.id}`)
      .text('❌ Huỷ', `aa:x:${action.id}`);
    await this.bot!.api.sendMessage(
      chatId,
      `⚠️ Cần xác nhận:\n${action.description}\n\nYêu cầu hết hạn sau 10 phút.`,
      { reply_markup: keyboard },
    );
  }

  // Bấm nút: service kiểm tra đúng người tạo, chưa hết hạn, chưa xử lý và kiểm tra lại quyền.
  // Chỉ chạy được một lần dù bấm lặp. Tin nhắn được sửa thành kết quả (nút biến mất).
  private async onActionButton(ctx: Context, what: 'confirm' | 'cancel', id: string): Promise<void> {
    // Middleware đã bảo đảm người bấm là chủ chat riêng (from.id = chat.id).
    const chatId = String(ctx.callbackQuery!.from.id);
    const user = await this.links.findUserByChat(chatId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Chat này chưa liên kết tài khoản.', show_alert: true }).catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery().catch(() => undefined);
    let line: string;
    try {
      const action = what === 'confirm' ? await this.actions.confirm(user, id, 'telegram') : await this.actions.cancel(user, id, 'telegram');
      line = actionResultText(action, what, this.config.get('WEB_ORIGIN', { infer: true }).replace(/\/+$/, ''));
    } catch (err) {
      line = errorText(err);
    }
    await ctx.editMessageText(line).catch(() => this.sendText(chatId, line));
  }

  private trackFile(chatId: string, task: Promise<void>): void {
    const set = this.fileTasks.get(chatId) ?? new Set<Promise<void>>();
    this.fileTasks.set(chatId, set);
    const p = task.catch((err) => this.logger.error(`Lỗi xử lý tệp Telegram: ${String(err)}`));
    set.add(p);
    this.running.add(p);
    void p.finally(() => {
      set.delete(p);
      if (set.size === 0) this.fileTasks.delete(chatId);
      this.running.delete(p);
    });
  }

  private async afterFiles(chatId: string): Promise<void> {
    const tasks = this.fileTasks.get(chatId);
    if (tasks) await Promise.allSettled(tasks);
  }

  // Agent có thể chạy lâu: không giữ update (polling/webhook) chờ, chạy nền và trả lời khi xong.
  private track(task: Promise<void>): void {
    const p = task.catch((err) => this.logger.error(`Lỗi chat agent: ${String(err)}`));
    this.running.add(p);
    void p.finally(() => this.running.delete(p));
  }
}
