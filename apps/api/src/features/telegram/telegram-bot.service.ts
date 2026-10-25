import {
  HttpException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentActionDto } from '@pvh/shared';
import { Bot, InlineKeyboard, type Context } from 'grammy';
import type { Update } from 'grammy/types';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { AgentActionsService } from '../agent-actions/agent-actions.service.js';
import { AgentService } from '../agent/agent.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { SystemService } from '../system/system.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { splitMessage } from './split-message.js';
import { TelegramLinkService, type LinkResult } from './telegram-link.service.js';
import { TelegramRateLimiter } from './telegram-rate-limiter.js';

// Mỗi chat tối đa 20 tin / phút; tin vượt hạn mức bị bỏ qua (chỉ cảnh báo một lần).
const MESSAGE_LIMIT = 20;
const MESSAGE_WINDOW_SEC = 60;
const DEADLINE_HOURS = 48;
const DEADLINE_MAX_ITEMS = 30;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const HELP = [
  'Các lệnh:',
  '/status – tình trạng hệ thống',
  `/deadline – công việc sắp đến hạn (${DEADLINE_HOURS} giờ tới) và quá hạn`,
  '/unlink – huỷ liên kết tài khoản',
  '/help – xem lại hướng dẫn',
  '',
  'Hoặc nhắn tự do cho trợ lý AI, ví dụ: "Có bài nào chờ duyệt không?"',
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
function actionResultText(action: AgentActionDto, what: 'confirm' | 'cancel'): string {
  switch (action.status) {
    case 'DONE':
      return `✅ ${action.resultMessage ?? action.description}`;
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
const errorText = (err: unknown) =>
  err instanceof HttpException && err.getStatus() < 500
    ? err.message
    : err instanceof HttpException && err.getStatus() === 503
      ? 'Trợ lý AI chưa sẵn sàng (chưa cấu hình khóa API). Vui lòng báo quản trị viên.'
      : 'Có lỗi khi xử lý yêu cầu, vui lòng thử lại sau.';

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

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly links: TelegramLinkService,
    private readonly limiter: TelegramRateLimiter,
    private readonly system: SystemService,
    private readonly tasks: TasksService,
    private readonly agent: AgentService,
    private readonly audit: AuditLogService,
    private readonly actions: AgentActionsService,
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
      if (chat?.type !== 'private' || !(callback?.data || ctx.message?.text)) return;
      const chatId = String(chat.id);
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
      await next();
    });

    // A08 – nút Xác nhận / Huỷ dưới tin nhắn của agent. callback_data: aa:c:<id> hoặc aa:x:<id>.
    bot.callbackQuery(/^aa:([cx]):(\d{1,18})$/, (ctx) =>
      this.onActionButton(ctx, ctx.match[1] === 'c' ? 'confirm' : 'cancel', ctx.match[2]),
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

    bot.command('status', (ctx) =>
      this.asUser(ctx, 'status', async (user) => this.statusText(user)),
    );

    bot.command('deadline', (ctx) =>
      this.asUser(ctx, 'deadline', async (user) => this.deadlineText(user)),
    );

    // Tin nhắn tự do (và lệnh lạ) → AI Agent, hành động thay mặt người đã liên kết.
    bot.on('message:text', async (ctx) => {
      const text = ctx.message.text.trim();
      const chatId = this.chatId(ctx);
      const user = await this.links.findUserByChat(chatId);
      if (!user) return this.reject(ctx, 'chat');
      if (text.startsWith('/')) return this.reply(ctx, `Không có lệnh này.\n\n${HELP}`);
      this.track(this.chatWithAgent(ctx, user, text));
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
      return this.reply(ctx, `Chat này đã liên kết với tài khoản ${current.email}. Gửi /unlink nếu muốn đổi tài khoản.`);
    }
    const result = await this.links.verifyAndLink(code, chatId);
    if (!result.ok) return this.reply(ctx, LINK_ERRORS[result.reason]);
    await this.reply(ctx, `Liên kết thành công! Xin chào ${result.user.fullName} (${result.user.email}).\n\n${HELP}`);
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

  private async chatWithAgent(ctx: Context, user: AuthUser, text: string): Promise<void> {
    await ctx.replyWithChatAction('typing').catch(() => undefined);
    let error: string | undefined;
    try {
      const res = await this.agent.chat({ user, channel: 'telegram' }, text);
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
      line = actionResultText(action, what);
    } catch (err) {
      line = errorText(err);
    }
    await ctx.editMessageText(line).catch(() => this.sendText(chatId, line));
  }

  // Agent có thể chạy lâu: không giữ update (polling/webhook) chờ, chạy nền và trả lời khi xong.
  private track(task: Promise<void>): void {
    const p = task.catch((err) => this.logger.error(`Lỗi chat agent: ${String(err)}`));
    this.running.add(p);
    void p.finally(() => this.running.delete(p));
  }
}
