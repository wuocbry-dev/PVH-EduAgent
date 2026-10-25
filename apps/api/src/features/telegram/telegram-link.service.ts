import { createHash, randomInt } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/queue/redis.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { UsersService } from '../users/users.service.js';
import { TelegramRateLimiter } from './telegram-rate-limiter.js';

export const OTP_TTL_SEC = 300;
// Mỗi tài khoản sinh tối đa 5 mã / 10 phút; mỗi chat nhập sai tối đa 5 lần / 10 phút.
const CODE_LIMIT = 5;
const OTP_FAIL_LIMIT = 5;
const LIMIT_WINDOW_SEC = 600;

export type LinkResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: 'invalid' | 'locked' | 'chat_taken' | 'inactive' };

const hashOtp = (code: string) => createHash('sha256').update(code).digest('hex');

// A01 – liên kết tài khoản với Telegram bằng OTP (sơ đồ SD02).
// OTP 6 số lưu trong Redis dạng băm: `tg:link:<sha256>` → userId, hạn 5 phút, đọc bằng GETDEL nên chỉ dùng được một lần.
@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
    private readonly audit: AuditLogService,
    private readonly limiter: TelegramRateLimiter,
  ) {}

  async isLinked(user: AuthUser): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: BigInt(user.id) },
      select: { telegramChatId: true },
    });
    return !!row?.telegramChatId;
  }

  // Sinh OTP mới; mã cũ (nếu có) mất hiệu lực.
  async createCode(user: AuthUser, ip?: string): Promise<{ code: string; expiresAt: Date }> {
    const client = this.redis.client;
    if (!client) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình Redis (REDIS_URL) nên chưa liên kết Telegram được',
      );
    }
    if (!(await this.limiter.hit('code', user.id, CODE_LIMIT, LIMIT_WINDOW_SEC))) {
      throw new HttpException(
        'Bạn đã sinh mã quá nhiều lần, vui lòng thử lại sau ít phút',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const userKey = this.redis.key('tg', 'link-user', user.id);
    const oldHash = await client.get(userKey);
    if (oldHash) await client.del(this.redis.key('tg', 'link', oldHash));

    // Hiếm khi trùng mã đang chờ của người khác; SET NX bảo đảm không ghi đè.
    for (let i = 0; i < 10; i++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const hash = hashOtp(code);
      const set = await client.set(this.redis.key('tg', 'link', hash), user.id, 'EX', OTP_TTL_SEC, 'NX');
      if (set !== 'OK') continue;
      await client.set(userKey, hash, 'EX', OTP_TTL_SEC);
      await this.audit.record({
        userId: user.id,
        channel: 'web',
        action: 'telegram.link_code',
        ok: true,
        ip,
      });
      return { code, expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000) };
    }
    throw new ServiceUnavailableException('Không sinh được mã, vui lòng thử lại');
  }

  // Bot nhận `/link <OTP>` (hoặc `/start <OTP>` từ deep-link) từ chatId.
  async verifyAndLink(rawCode: string, chatId: string): Promise<LinkResult> {
    if (await this.limiter.exceeded('otp-fail', chatId, OTP_FAIL_LIMIT)) {
      return { ok: false, reason: 'locked' };
    }
    const code = rawCode.trim();
    const client = this.redis.client;
    const userId =
      client && /^\d{6}$/.test(code)
        ? await client.getdel(this.redis.key('tg', 'link', hashOtp(code)))
        : null;

    if (!userId) {
      await this.limiter.hit('otp-fail', chatId, OTP_FAIL_LIMIT, LIMIT_WINDOW_SEC);
      await this.audit.record({
        userId: null,
        channel: 'telegram',
        action: 'telegram.link',
        params: { chatId },
        ok: false,
        error: 'OTP sai hoặc hết hạn',
      });
      return { ok: false, reason: 'invalid' };
    }
    await client!.del(this.redis.key('tg', 'link-user', userId));

    const fail = async (reason: 'chat_taken' | 'inactive', error: string): Promise<LinkResult> => {
      await this.audit.record({ userId, channel: 'telegram', action: 'telegram.link', params: { chatId }, ok: false, error });
      return { ok: false, reason };
    };

    const user = await this.users.findAuthUserById(userId);
    if (!user) return fail('inactive', 'Tài khoản không còn hoạt động');

    const owner = await this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true },
    });
    if (owner && owner.id.toString() !== userId) {
      return fail('chat_taken', 'Chat Telegram đã liên kết với tài khoản khác');
    }

    try {
      await this.prisma.user.update({
        where: { id: BigInt(userId) },
        data: { telegramChatId: chatId },
      });
    } catch {
      // Hai mã khác nhau cùng gửi từ một chat (đụng unique telegram_chat_id).
      return fail('chat_taken', 'Chat Telegram đã liên kết với tài khoản khác');
    }
    await this.limiter.reset('otp-fail', chatId);
    await this.audit.record({ userId, channel: 'telegram', action: 'telegram.link', params: { chatId }, ok: true });
    return { ok: true, user };
  }

  // Người dùng đang hoạt động đã liên kết với chat này (null = chat lạ).
  async findUserByChat(chatId: string): Promise<AuthUser | null> {
    const row = await this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true },
    });
    return row ? this.users.findAuthUserById(row.id.toString()) : null;
  }

  // Huỷ liên kết từ web (nút trên /admin/tai-khoan). Trả về chat_id cũ để bot báo cho người dùng.
  async unlinkUser(user: AuthUser, ip?: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: BigInt(user.id) },
      select: { telegramChatId: true },
    });
    if (!row?.telegramChatId) return null;
    await this.prisma.user.update({ where: { id: BigInt(user.id) }, data: { telegramChatId: null } });
    await this.audit.record({ userId: user.id, channel: 'web', action: 'telegram.unlink', ok: true, ip });
    return row.telegramChatId;
  }

  // Lệnh /unlink trên bot.
  async unlinkChat(chatId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true },
    });
    if (!row) return false;
    await this.prisma.user.update({ where: { id: row.id }, data: { telegramChatId: null } });
    await this.audit.record({
      userId: row.id.toString(),
      channel: 'telegram',
      action: 'telegram.unlink',
      params: { chatId },
      ok: true,
    });
    return true;
  }
}
