import { HttpException, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { POST_STATUS_NAMES } from '@pvh/shared';
import { InlineKeyboard, type Context } from 'grammy';
import { can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { stripHtml } from '../../common/utils/sanitize-content.js';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/queue/redis.service.js';
import { AgentActionsService } from '../agent-actions/agent-actions.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { rejectPostSchema } from '../posts/dto/create-post.dto.js';
import { PostsService } from '../posts/posts.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { TelegramRateLimiter } from './telegram-rate-limiter.js';

const TZ = 'Asia/Ho_Chi_Minh';
export const EXCERPT_CHARS = 700;
const REJECT_WAIT_SEC = 5 * 60;
const NOTIFY_DEDUPE_SEC = 24 * 60 * 60;
const CLICKS_PER_MINUTE = 30;

const formatTime = (date: Date) =>
  date.toLocaleString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false });

// Telegram tự biến văn bản thuần thành liên kết (http://…, www.…, a.com) và nhắc tên (@ten). Nội dung do người dùng nhập
// được chèn ký tự rộng-không (U+200B) để các dạng đó không còn được nhận diện, nên không tạo liên kết/mention giả.
export function defang(text: string): string {
  return text
    .replace(/@(?=\S)/g, '@​')
    .replace(/:\/\//g, ':​//')
    .replace(/(\S)\.(?=[A-Za-z0-9])/g, '$1​.')
    .replace(/\bwww​?\./gi, 'www​.');
}

// Nội dung bài (HTML đã lọc) → văn bản thuần có xuống dòng theo đoạn.
export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\/(p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, '\n').replace(/<li\b[^>]*>/gi, '• ');
  return stripHtml(withBreaks)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function excerptOf(html: string, max = EXCERPT_CHARS): string {
  const text = htmlToText(html);
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

// Telegram từ chối nút URL trỏ tới localhost/IP nội bộ: chỉ dùng nút khi địa chỉ là https công khai.
export function isPublicHttps(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '::1' || host.startsWith('[')) return false;
    return host.includes('.');
  } catch {
    return false;
  }
}

const errorText = (err: unknown) =>
  err instanceof HttpException && err.getStatus() < 500 ? err.message : 'Có lỗi khi xử lý yêu cầu, vui lòng thử lại sau.';

// Báo người duyệt khi có bài gửi duyệt, kèm nút Xem toàn văn / Duyệt đăng / Từ chối ngay trên Telegram.
// - Gắn vào PostsService.onSubmitted nên mọi đường gửi duyệt (web, AI Agent) đều được báo; chạy nền, lỗi chỉ ghi log + audit.
// - Duyệt đăng KHÔNG đăng ngay: tạo yêu cầu chờ xác nhận (agent_actions, cơ chế 2 bước của bước 9).
// - Từ chối: bot hỏi lý do (Redis, 5 phút), tin kế tiếp của người duyệt là lý do chứ không chuyển cho AI Agent.
@Injectable()
export class TelegramReviewService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramReviewService.name);
  private readonly memory = new Map<string, number>();
  private readonly memoryReject = new Map<string, { postId: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly settings: SettingsService,
    private readonly redis: RedisService,
    private readonly audit: AuditLogService,
    private readonly actions: AgentActionsService,
    private readonly links: TelegramLinkService,
    private readonly limiter: TelegramRateLimiter,
    private readonly config: ConfigService<Env, true>,
    private readonly moduleRef: ModuleRef,
  ) {}

  onApplicationBootstrap(): void {
    this.posts.onSubmitted((postId) => this.notifyReviewers(postId));
  }

  // BotService lấy qua ModuleRef (BotService cần ReviewService để đăng ký nút nên không inject chéo được).
  private get bot(): TelegramBotService {
    return this.moduleRef.get(TelegramBotService, { strict: false });
  }

  private webUrl(postId: string): string {
    return `${this.config.get('WEB_ORIGIN', { infer: true }).replace(/\/+$/, '')}/admin/bai-viet/${postId}`;
  }

  // ── Gửi thông báo ────────────────────────────────────────────────────────────────────────────
  // Những người được báo: tài khoản ACTIVE đã liên kết Telegram có CẢ post:approve và post:schedule (theo role_permissions),
  // không phải tác giả.
  private async reviewers(authorId: bigint) {
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        telegramChatId: { not: null },
        id: { not: authorId },
        roles: { some: { role: { permissions: { some: { permission: { code: 'post:approve' } } } } } },
      },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    return users.filter((u) => {
      const codes = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)));
      return codes.has('post:approve') && codes.has('post:schedule');
    });
  }

  // Cùng một lần gửi duyệt không báo hai lần: khoá theo bài + số lần đã gửi duyệt (mỗi lần gửi có một audit post.submit).
  private async firstNotice(postId: bigint): Promise<boolean> {
    const submissions = await this.prisma.auditLog.count({ where: { action: 'post.submit', targetId: postId } });
    const id = `${postId}:${submissions}`;
    const client = this.redis.client;
    if (client) {
      try {
        return (await client.set(this.redis.key('tg', 'review', 'notified', id), '1', 'EX', NOTIFY_DEDUPE_SEC, 'NX')) === 'OK';
      } catch {
        // Redis lỗi: dùng bộ nhớ.
      }
    }
    const now = Date.now();
    if ((this.memory.get(id) ?? 0) > now) return false;
    this.memory.set(id, now + NOTIFY_DEDUPE_SEC * 1000);
    return true;
  }

  async notifyReviewers(postId: string): Promise<number> {
    if ((await this.settings.effective('telegram.review_notify')) !== 'true') return 0;
    const bot = this.bot;
    if (!bot.enabled) return 0;
    const post = await this.prisma.post.findUnique({
      where: { id: BigInt(postId) },
      include: { author: { select: { fullName: true } }, category: { select: { name: true } } },
    });
    if (post?.status !== 'PENDING_REVIEW') return 0;
    if (!(await this.firstNotice(post.id))) return 0;

    const recipients = await this.reviewers(post.authorId);
    const images = (post.content.match(/<img\b/gi) ?? []).length;
    const videos = (post.content.match(/<video\b/gi) ?? []).length;
    const files = [images ? `${images} ảnh` : '', videos ? `${videos} video` : ''].filter(Boolean).join(', ') || 'không có';
    const url = this.webUrl(postId);
    const urlButton = isPublicHttps(url);
    const text = [
      '📝 Có bài mới chờ duyệt',
      `Tiêu đề: ${defang(post.title)}`,
      `Tác giả: ${defang(post.author.fullName)}`,
      `Chuyên mục: ${post.category ? defang(post.category.name) : 'chưa phân loại'}`,
      `Gửi lúc: ${formatTime(new Date())} (giờ Việt Nam)`,
      `Đính kèm: ${files}`,
      ...(urlButton ? [] : [`Trang duyệt: ${url}`]),
      '',
      defang(excerptOf(post.content)) || '(bài chưa có chữ)',
    ].join('\n');
    const keyboard = new InlineKeyboard()
      .text('👁 Xem toàn văn', `rv:v:${postId}`)
      .row()
      .text('✅ Duyệt đăng', `rv:a:${postId}`)
      .text('❌ Từ chối', `rv:r:${postId}`);
    if (urlButton) keyboard.row().url('🔗 Mở trang duyệt', url);

    let sent = 0;
    for (const user of recipients) {
      let error: string | undefined;
      try {
        await bot.bot!.api.sendMessage(user.telegramChatId!, text, {
          reply_markup: keyboard,
          link_preview_options: { is_disabled: true },
        });
        sent++;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Không báo được người duyệt ${user.id} qua Telegram: ${error}`);
      }
      await this.audit.record({
        userId: user.id.toString(),
        channel: 'telegram',
        action: 'post.review_notify',
        targetType: 'post',
        targetId: postId,
        ok: !error,
        error,
      });
    }
    return sent;
  }

  // ── Nút bấm ──────────────────────────────────────────────────────────────────────────────────
  private async loadPost(id: string) {
    return this.prisma.post.findUnique({
      where: { id: BigInt(id) },
      include: { author: { select: { fullName: true } }, category: { select: { name: true } } },
    });
  }

  // Bài không còn chờ duyệt: ai đã xử lý và lúc nào (theo audit_logs), hoặc trạng thái hiện tại nếu không có ai (vd. tác giả rút lại).
  private async processedText(post: { id: bigint; title: string; status: keyof typeof POST_STATUS_NAMES }): Promise<string> {
    const log = await this.prisma.auditLog.findFirst({
      where: { targetType: 'post', targetId: post.id, action: { in: ['post.approve', 'post.reject'] } },
      orderBy: { id: 'desc' },
    });
    if (log?.userId) {
      const who = await this.prisma.user.findUnique({ where: { id: log.userId }, select: { fullName: true } });
      const verb = log.action === 'post.reject' ? 'từ chối' : 'duyệt';
      return `ℹ️ Bài "${defang(post.title)}" đã được ${who?.fullName ?? 'người khác'} ${verb} lúc ${formatTime(log.createdAt)}. Không cần xử lý thêm.`;
    }
    return `ℹ️ Bài "${defang(post.title)}" không còn ở trạng thái chờ duyệt (hiện: ${POST_STATUS_NAMES[post.status]}).`;
  }

  private async record(user: AuthUser, action: string, postId: string, ok: boolean, params?: object, error?: string) {
    await this.audit.record({ userId: user.id, channel: 'telegram', action, targetType: 'post', targetId: postId, params, ok, error });
  }

  // callback_data: rv:v:<id> (xem), rv:a:<id> (duyệt đăng), rv:r:<id> (từ chối). Middleware của bot đã bảo đảm
  // đây là chat riêng và người bấm là chủ chat.
  async onButton(ctx: Context, what: 'v' | 'a' | 'r', postId: string): Promise<void> {
    const chatId = String(ctx.callbackQuery!.from.id);
    const user = await this.links.findUserByChat(chatId);
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Chat này chưa liên kết tài khoản.', show_alert: true }).catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery().catch(() => undefined);
    const action = what === 'v' ? 'telegram.review_view' : what === 'a' ? 'telegram.review_approve' : 'telegram.review_reject';
    const say = (text: string) => this.bot.sendText(chatId, text).catch(() => undefined);

    if (!(await this.limiter.hit('review', user.id, CLICKS_PER_MINUTE, 60))) {
      await say('Bạn bấm quá nhanh, vui lòng chờ một chút.');
      return;
    }
    // Quyền kiểm tra lại ở thời điểm bấm (quyền có thể đã bị rút kể từ lúc nhận tin).
    if (!can(user, 'post:approve') || !can(user, 'post:schedule')) {
      await this.record(user, action, postId, false, undefined, 'Không còn quyền duyệt bài');
      await say('Bạn không (còn) quyền duyệt bài.');
      return;
    }
    const post = await this.loadPost(postId);
    if (!post) {
      await ctx.editMessageText('ℹ️ Bài viết này không còn tồn tại.').catch(() => undefined);
      return;
    }
    if (post.status !== 'PENDING_REVIEW') {
      await this.record(user, action, postId, false, { status: post.status }, 'Bài không còn chờ duyệt');
      const text = await this.processedText(post);
      await ctx.editMessageText(text).catch(() => say(text));
      return;
    }

    try {
      if (what === 'v') {
        await this.sendFull(chatId, post);
        await this.record(user, action, postId, true);
      } else if (what === 'a') {
        // Không đăng ngay: tạo yêu cầu chờ xác nhận như mọi thao tác công khai của agent (hết hạn 10 phút).
        const pending = await this.actions.propose(user, { tool: 'approve_post', postId }, 'telegram');
        const keyboard = new InlineKeyboard().text('✅ Xác nhận', `aa:c:${pending.id}`).text('❌ Huỷ', `aa:x:${pending.id}`);
        await ctx
          .editMessageText(`⚠️ Xác nhận đăng bài "${defang(post.title)}"?\n\nBài sẽ lên website ngay khi bạn bấm Xác nhận. Yêu cầu hết hạn sau 10 phút.`, {
            reply_markup: keyboard,
          })
          .catch(() => undefined);
        await this.record(user, action, postId, true, { actionId: pending.id });
      } else {
        await this.askReason(chatId, postId);
        await say(`Nhắn lý do từ chối bài "${defang(post.title)}" (trong 5 phút). Gửi /huy để thoát.`);
        await this.record(user, action, postId, true, { stage: 'ask' });
      }
    } catch (err) {
      await this.record(user, action, postId, false, undefined, err instanceof Error ? err.message : String(err));
      await say(errorText(err));
    }
  }

  // Toàn văn bài (chia nhỏ ≤ 4096 ký tự), kèm ảnh đại diện nếu có URL công khai tuyệt đối; video chỉ hiện dòng kèm liên kết.
  private async sendFull(chatId: string, post: { title: string; content: string; thumbnailUrl: string | null; author: { fullName: string } }) {
    const bot = this.bot;
    if (post.thumbnailUrl && isPublicHttps(post.thumbnailUrl)) {
      await bot.bot!.api.sendPhoto(chatId, post.thumbnailUrl).catch((err: unknown) => this.logger.warn(`Không gửi được ảnh đại diện: ${String(err)}`));
    }
    const videos = [...post.content.matchAll(/<video\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]);
    const body = htmlToText(post.content) || '(bài chưa có chữ)';
    const lines = [`📄 ${defang(post.title)}`, `Tác giả: ${defang(post.author.fullName)}`, '', defang(body)];
    if (videos.length > 0) lines.push('', `🎬 ${videos.length} video:`, ...videos);
    await bot.sendText(chatId, lines.join('\n'));
  }

  // ── Từ chối kèm lý do ───────────────────────────────────────────────────────────────────────
  private rejectKey(chatId: string) {
    return this.redis.key('tg', 'review', 'reject', chatId);
  }

  private async askReason(chatId: string, postId: string): Promise<void> {
    const client = this.redis.client;
    if (client) {
      try {
        await client.set(this.rejectKey(chatId), postId, 'EX', REJECT_WAIT_SEC);
        return;
      } catch {
        // Redis lỗi: dùng bộ nhớ.
      }
    }
    this.memoryReject.set(chatId, { postId, expiresAt: Date.now() + REJECT_WAIT_SEC * 1000 });
  }

  private async takeReasonState(chatId: string): Promise<string | null> {
    const client = this.redis.client;
    if (client) {
      try {
        return await client.getdel(this.rejectKey(chatId));
      } catch {
        // Redis lỗi: dùng bộ nhớ.
      }
    }
    const entry = this.memoryReject.get(chatId);
    this.memoryReject.delete(chatId);
    return entry && entry.expiresAt > Date.now() ? entry.postId : null;
  }

  // /huy: thoát trạng thái chờ lý do. Trả true nếu đang chờ.
  async clearReject(chatId: string): Promise<boolean> {
    return (await this.takeReasonState(chatId)) !== null;
  }

  // Tin chữ của người duyệt đang ở trạng thái chờ lý do: trả true nếu đã xử lý (không chuyển cho AI Agent).
  async consumeRejectReason(ctx: Context, user: AuthUser, text: string): Promise<boolean> {
    const chatId = String(ctx.chat!.id);
    const postId = await this.takeReasonState(chatId);
    if (!postId) return false;
    const say = (t: string) => this.bot.sendText(chatId, t).catch(() => undefined);

    const parsed = rejectPostSchema.safeParse({ reason: text });
    if (!parsed.success) {
      await this.askReason(chatId, postId); // giữ trạng thái để nhập lại
      await say(parsed.error.issues[0]?.message ?? 'Lý do không hợp lệ (tối đa 1000 ký tự), vui lòng nhắn lại.');
      return true;
    }
    try {
      const post = await this.posts.transition(user, postId, 'reject', { reason: parsed.data.reason }, { channel: 'telegram' });
      await this.record(user, 'telegram.review_reject', postId, true, { stage: 'done' });
      await say(`❌ Đã từ chối bài "${defang(post.title)}". Lý do đã được gửi cho tác giả.`);
    } catch (err) {
      await this.record(user, 'telegram.review_reject', postId, false, { stage: 'done' }, err instanceof Error ? err.message : String(err));
      const post = await this.loadPost(postId);
      await say(post && post.status !== 'PENDING_REVIEW' ? await this.processedText(post) : errorText(err));
    }
    return true;
  }
}
