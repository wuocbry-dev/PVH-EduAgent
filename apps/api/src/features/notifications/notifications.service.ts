import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export interface NotificationInput {
  userId: string | bigint;
  title: string;
  body: string;
}

// Hộp thông báo (bảng notifications). Bộ lập lịch và quy trình bài viết ghi vào đây với sent_at = null;
// bot Telegram (features/telegram) đăng ký `onCreated` để gửi ngay cho người đã liên kết rồi đặt sent_at.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly listeners: (() => Promise<unknown>)[] = [];

  constructor(private readonly prisma: PrismaService) {}

  // Gọi sau mỗi lần có thông báo mới; lỗi của listener không ảnh hưởng thao tác đã ghi.
  onCreated(listener: () => Promise<unknown>): void {
    this.listeners.push(listener);
  }

  async notify(entries: NotificationInput[], channel = 'telegram'): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.notification.createMany({
      data: entries.map((e) => ({
        userId: BigInt(e.userId),
        channel,
        title: e.title.slice(0, 200),
        body: e.body,
      })),
    });
    for (const listener of this.listeners) {
      listener().catch((err) =>
        this.logger.error(`Không gửi được thông báo: ${String(err)}`),
      );
    }
  }

  // Chỉ tạo nếu người dùng chưa có thông báo cùng tiêu đề (dùng cho báo cáo ngày: chạy lại không gửi trùng).
  async notifyOnce(entry: NotificationInput, channel = 'telegram'): Promise<boolean> {
    const exists = await this.prisma.notification.findFirst({
      where: { userId: BigInt(entry.userId), channel, title: entry.title.slice(0, 200) },
      select: { id: true },
    });
    if (exists) return false;
    await this.notify([entry], channel);
    return true;
  }
}
