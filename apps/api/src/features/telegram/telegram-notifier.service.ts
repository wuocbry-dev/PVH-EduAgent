import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TelegramBotService } from './telegram-bot.service.js';

const SWEEP_EVERY_MS = 60_000;
const BATCH_SIZE = 50;
// Gửi lỗi quá số lần này (vd. người dùng đã chặn bot) thì bỏ qua đến khi API khởi động lại.
const MAX_FAILURES = 3;

// Nối bước 7: thông báo (nhắc hạn, báo cáo ngày, kết quả đăng bài...) được gửi qua Telegram cho người đã liên kết.
// Gửi ngay khi có thông báo mới, và quét lại mỗi phút để gửi những tin còn sót.
// Mỗi dòng được "giữ chỗ" bằng cách đặt sent_at có điều kiện trước khi gửi, nên nhiều tiến trình
// không gửi trùng; gửi lỗi thì trả sent_at về null để lần sau gửi lại.
@Injectable()
export class TelegramNotifierService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramNotifierService.name);
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<number>;
  private again = false;
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramBotService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegram.enabled) return;
    this.notifications.onCreated(() => this.flush());
    this.timer = setInterval(() => void this.flush().catch(() => 0), SWEEP_EVERY_MS);
    this.timer.unref();
    void this.flush().catch(() => 0);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.flushing?.catch(() => 0);
  }

  // Gửi các thông báo chưa gửi của người đã liên kết; trả về số tin đã gửi.
  // Đang có lượt gửi thì lượt mới chờ lượt đó xong rồi chạy thêm một lần.
  async flush(): Promise<number> {
    if (!this.telegram.enabled) return 0;
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      let sent = 0;
      try {
        do {
          this.again = false;
          sent += await this.sendBatch();
        } while (this.again);
      } finally {
        this.flushing = undefined;
      }
      return sent;
    })();
    return this.flushing;
  }

  private async sendBatch(): Promise<number> {
    const skip = [...this.failures].filter(([, n]) => n >= MAX_FAILURES).map(([id]) => BigInt(id));
    const rows = await this.prisma.notification.findMany({
      where: {
        channel: 'telegram',
        sentAt: null,
        id: skip.length ? { notIn: skip } : undefined,
        user: { telegramChatId: { not: null }, status: 'ACTIVE' },
      },
      include: { user: { select: { telegramChatId: true } } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });

    let sent = 0;
    for (const row of rows) {
      const claimed = await this.prisma.notification.updateMany({
        where: { id: row.id, sentAt: null },
        data: { sentAt: new Date() },
      });
      if (claimed.count === 0) continue;
      try {
        await this.telegram.sendText(row.user.telegramChatId!, `🔔 ${row.title}\n\n${row.body}`);
        this.failures.delete(row.id.toString());
        sent++;
      } catch (err) {
        await this.prisma.notification.update({ where: { id: row.id }, data: { sentAt: null } });
        const id = row.id.toString();
        this.failures.set(id, (this.failures.get(id) ?? 0) + 1);
        this.logger.warn(`Không gửi được thông báo ${id} qua Telegram: ${String(err)}`);
      }
    }
    return sent;
  }
}
