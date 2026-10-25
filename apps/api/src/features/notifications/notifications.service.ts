import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export interface NotificationInput {
  userId: string | bigint;
  title: string;
  body: string;
}

// Hộp thông báo (bảng notifications). Bộ lập lịch ghi vào đây với sent_at = null,
// bot Telegram (bước 8) lấy các dòng chưa gửi để gửi đi rồi đặt sent_at.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
