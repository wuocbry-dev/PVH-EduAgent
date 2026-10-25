import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';

const HOUR_MS = 60 * 60 * 1000;
export const REMIND_BEFORE_DUE = 'BEFORE_DUE';
export const REMIND_OVERDUE = 'OVERDUE';

export interface DeadlineScanResult {
  markedOverdue: number;
  overdueNotified: number;
  dueSoonNotified: number;
}

const fmt = (d: Date) =>
  d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

// A06 – quét công việc: đánh dấu OVERDUE và nhắc người phụ trách trước hạn X giờ (X = reminder.hours_before).
// Mỗi mốc nhắc chỉ gửi một lần cho mỗi việc: bảng task_reminders có unique (task_id, remind_type) và
// việc ghi mốc nhắc dùng createMany skipDuplicates nên hai lần quét chạy chồng nhau cũng không nhắc trùng.
@Injectable()
export class DeadlineReminderProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
  ) {}

  async run(now = new Date()): Promise<DeadlineScanResult> {
    const hours = Number(await this.settings.effective('reminder.hours_before')) || 24;
    const result: DeadlineScanResult = { markedOverdue: 0, overdueNotified: 0, dueSoonNotified: 0 };

    // 1. Việc quá hạn mà chưa xong: đánh OVERDUE (nếu đang TODO/IN_PROGRESS) và báo một lần.
    const overdue = await this.prisma.task.findMany({
      where: { status: { not: 'DONE' }, dueAt: { lt: now } },
    });
    for (const task of overdue) {
      const { count } = await this.prisma.task.updateMany({
        where: { id: task.id, status: { in: ['TODO', 'IN_PROGRESS'] } },
        data: { status: 'OVERDUE' },
      });
      result.markedOverdue += count;
      if (await this.firstReminder(task.id, REMIND_OVERDUE)) {
        result.overdueNotified++;
        await this.notifications.notify([
          {
            userId: task.assigneeId,
            title: 'Công việc đã quá hạn',
            body: `Việc "${task.title}" đã quá hạn từ ${fmt(task.dueAt)}.`,
          },
        ]);
      }
    }

    // 2. Việc sắp đến hạn trong X giờ tới: nhắc một lần.
    const dueSoon = await this.prisma.task.findMany({
      where: {
        status: { in: ['TODO', 'IN_PROGRESS'] },
        dueAt: { gte: now, lte: new Date(now.getTime() + hours * HOUR_MS) },
      },
    });
    for (const task of dueSoon) {
      if (!(await this.firstReminder(task.id, REMIND_BEFORE_DUE))) continue;
      result.dueSoonNotified++;
      await this.notifications.notify([
        {
          userId: task.assigneeId,
          title: 'Sắp đến hạn công việc',
          body: `Việc "${task.title}" đến hạn lúc ${fmt(task.dueAt)} (trong vòng ${hours} giờ).`,
        },
      ]);
    }

    if (result.markedOverdue + result.overdueNotified + result.dueSoonNotified > 0) {
      await this.audit.record({
        userId: null,
        channel: 'scheduler',
        action: 'task.deadline_scan',
        params: { ...result, hoursBefore: hours },
        ok: true,
      });
    }
    return result;
  }

  // true nếu đây là lần đầu ghi mốc nhắc này cho việc (người ghi trước thắng, kể cả khi chạy song song).
  private async firstReminder(taskId: bigint, remindType: string): Promise<boolean> {
    const { count } = await this.prisma.taskReminder.createMany({
      data: [{ taskId, remindType }],
      skipDuplicates: true,
    });
    return count === 1;
  }
}
