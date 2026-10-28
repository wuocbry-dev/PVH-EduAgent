import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ALERT_MESSAGES_PER_HOUR, ALERT_KIND_NAMES, type AlertKind, type SystemAlertDto } from '@pvh/shared';
import type { SystemAlert } from '../../generated/prisma/client.js';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { defang } from '../../common/utils/defang.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TelegramBotService } from '../telegram/telegram-bot.service.js';

const TZ = 'Asia/Ho_Chi_Minh';

export function toAlertDto(a: SystemAlert): SystemAlertDto {
  return {
    id: a.id.toString(),
    kind: a.kind as AlertKind,
    title: a.title,
    detail: a.detail,
    openedAt: a.openedAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
  };
}

export const formatVnTime = (date: Date) =>
  date.toLocaleString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false });

// Cảnh báo của trung tâm giám sát (bước 26).
// - Mỗi `key` chỉ một cảnh báo đang mở (index duy nhất một phần ở CSDL): nhiều tiến trình cùng phát hiện cũng chỉ một tin.
// - Gửi cho người có system:read: đã liên kết Telegram thì kênh telegram (bot gửi văn bản thuần), chưa thì hộp thông báo web.
// - Mọi giá trị đi qua defang(); nơi gọi không bao giờ đưa khoá, token, URL ký sẵn, mã kích hoạt hay giá trị điểm vào tin.
// - Tắt bằng khoá cấu hình telegram.admin_alerts; tối đa ALERT_MESSAGES_PER_HOUR tin/giờ (vượt thì chỉ ghi, không gửi).
@Injectable()
export class MonitoringAlertsService {
  private readonly logger = new Logger(MonitoringAlertsService.name);
  // e2e đặt MONITORING_ENABLED=false: không mở cảnh báo, không gửi tin (test bật tường minh).
  enabled: boolean;
  // Cảnh báo đã gửi thẳng khi không ghi được CSDL, và chat Telegram của người nhận lần gửi gần nhất.
  private readonly openWithoutDb = new Set<string>();
  private knownChats: string[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly limits: RateLimitService,
    private readonly audit: AuditLogService,
    private readonly telegram: TelegramBotService,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('MONITORING_ENABLED', { infer: true });
  }

  // Mở cảnh báo; đã có cảnh báo đang mở cùng key thì không làm gì (trả null).
  // Không ghi được CSDL (vd. chính CSDL đang ngừng) thì gửi thẳng qua Telegram cho người nhận đã biết, chống trùng trong bộ nhớ.
  // `excludeUserIds`: người là đối tượng của cảnh báo (vd. tài khoản BGH vừa tạo, người đăng nhập từ nơi lạ) không nhận tin về chính mình.
  async open(kind: AlertKind, key: string, title: string, detail?: string, excludeUserIds: string[] = []): Promise<SystemAlertDto | null> {
    if (!this.enabled) return null;
    const heading = `${ALERT_KIND_NAMES[kind]}: ${title}`;
    let row: SystemAlert;
    try {
      row = await this.prisma.systemAlert.create({
        data: { kind, key: key.slice(0, 160), title: title.slice(0, 200), detail: detail?.slice(0, 1000) ?? null },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      this.logger.error(`Không ghi được cảnh báo ${key}, gửi thẳng qua Telegram: ${String(err)}`);
      if (!this.openWithoutDb.has(key)) {
        this.openWithoutDb.add(key);
        await this.sendDirect(heading, detail);
      }
      return null;
    }
    await this.send(heading, detail, excludeUserIds);
    return toAlertDto(row);
  }

  // Đóng mọi cảnh báo đang mở của key; `notify` = gửi tin báo đã ổn (vd. dịch vụ hồi phục). Trả về số cảnh báo đã đóng.
  async resolveByKey(key: string, notify?: { title: string; detail?: string }): Promise<number> {
    if (this.openWithoutDb.delete(key) && notify && this.enabled) await this.sendDirect(notify.title, notify.detail);
    const { count } = await this.prisma.systemAlert.updateMany({
      where: { key, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    if (count > 0 && notify && this.enabled) await this.send(notify.title, notify.detail);
    return count;
  }

  async isOpen(key: string): Promise<boolean> {
    return (await this.prisma.systemAlert.count({ where: { key, resolvedAt: null } })) > 0;
  }

  async list(actor: AuthUser, open: boolean, kinds?: AlertKind[], take = 50): Promise<SystemAlertDto[]> {
    assertPermission(actor, 'system:read');
    const rows = await this.prisma.systemAlert.findMany({
      where: { resolvedAt: open ? null : undefined, kind: kinds ? { in: kinds } : undefined },
      orderBy: { openedAt: 'desc' },
      take,
    });
    return rows.map(toAlertDto);
  }

  // ADMIN đánh dấu đã xử lý (cảnh báo sự kiện như đăng nhập lạ, đổi quyền không tự đóng).
  async resolve(actor: AuthUser, id: string, ip?: string): Promise<SystemAlertDto> {
    assertPermission(actor, 'setting:manage');
    const alertId = parseId(id);
    const { count } = await this.prisma.systemAlert.updateMany({
      where: { id: alertId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedBy: BigInt(actor.id) },
    });
    const row = await this.prisma.systemAlert.findUnique({ where: { id: alertId } });
    if (!row) throw new NotFoundException('Không tìm thấy cảnh báo');
    if (count > 0) {
      await this.audit.record({
        userId: actor.id,
        channel: 'web',
        action: 'monitoring.alert_resolve',
        targetType: 'system_alert',
        targetId: row.id.toString(),
        params: { kind: row.kind },
        ok: true,
        ip,
      });
    }
    return toAlertDto(row);
  }

  private async send(title: string, detail?: string, excludeUserIds: string[] = []): Promise<void> {
    try {
      if ((await this.settings.effective('telegram.admin_alerts')) !== 'true') return;
      const { count } = await this.limits.increment('monitor-alert', 'all', 3600);
      if (count > ALERT_MESSAGES_PER_HOUR) {
        this.logger.warn(`Đã gửi quá ${ALERT_MESSAGES_PER_HOUR} cảnh báo trong giờ, bỏ qua: ${title}`);
        return;
      }
      const recipients = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          id: excludeUserIds.length ? { notIn: excludeUserIds.map((id) => BigInt(id)) } : undefined,
          roles: { some: { role: { permissions: { some: { permission: { code: 'system:read' } } } } } },
        },
        select: { id: true, telegramChatId: true },
      });
      const entry = (id: bigint) => ({ userId: id, title: defang(title), body: defang(detail ?? title) });
      const linked = recipients.filter((r) => r.telegramChatId);
      const unlinked = recipients.filter((r) => !r.telegramChatId);
      this.knownChats = linked.map((r) => r.telegramChatId!);
      await this.notifications.notify(linked.map((r) => entry(r.id)), 'telegram');
      await this.notifications.notify(unlinked.map((r) => entry(r.id)), 'web');
    } catch (err) {
      this.logger.error(`Không gửi được cảnh báo "${title}": ${String(err)}`);
    }
  }

  // Gửi thẳng (không qua bảng notifications) cho người nhận lần gửi trước; dùng khi không ghi được CSDL.
  private async sendDirect(title: string, detail?: string): Promise<void> {
    if (!this.telegram.enabled) return;
    if (this.knownChats.length === 0) {
      // Chưa từng gửi lần nào trong tiến trình này: thử đọc người nhận (có thể CSDL chỉ chập chờn).
      try {
        const rows = await this.prisma.user.findMany({
          where: { status: 'ACTIVE', telegramChatId: { not: null }, roles: { some: { role: { permissions: { some: { permission: { code: 'system:read' } } } } } } },
          select: { telegramChatId: true },
        });
        this.knownChats = rows.map((r) => r.telegramChatId!);
      } catch {
        return;
      }
    }
    for (const chat of this.knownChats) {
      await this.telegram.sendText(chat, `🔔 ${defang(title)}\n\n${defang(detail ?? title)}`).catch((err: unknown) =>
        this.logger.warn(`Không gửi thẳng được cảnh báo qua Telegram: ${String(err)}`),
      );
    }
  }
}
