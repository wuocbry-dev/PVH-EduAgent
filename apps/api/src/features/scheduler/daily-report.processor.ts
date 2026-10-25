import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { QueueService } from '../../infrastructure/queue/queue.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 5;

const vnDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ }); // yyyy-mm-dd
const vnTime = (d: Date) =>
  d.toLocaleTimeString('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export interface DailyReportResult {
  title: string;
  body: string;
  recipients: number;
  sent: number;
}

// A09 – báo cáo hằng ngày (giờ gửi theo cấu hình report.daily_time, mặc định 07:00 giờ Việt Nam):
// việc đến hạn trong ngày, bài sẽ đăng, cảnh báo hệ thống. Gửi cho người có system:read (ADMIN, BGH).
// Chạy lại cùng một ngày không gửi trùng (kiểm tra thông báo cùng tiêu đề).
@Injectable()
export class DailyReportProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
  ) {}

  async run(now = new Date()): Promise<DailyReportResult> {
    // Ngày theo giờ Việt Nam (UTC+7, không có giờ mùa hè).
    const day = vnDate(now);
    const start = new Date(`${day}T00:00:00+07:00`);
    const end = new Date(start.getTime() + DAY_MS);
    const title = `Báo cáo ngày ${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

    const [dueToday, overdueCount, scheduledToday, pendingReview, stuckScheduled] = await Promise.all([
      this.prisma.task.findMany({
        where: { status: { not: 'DONE' }, dueAt: { gte: start, lt: end } },
        include: { assignee: { select: { fullName: true } } },
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.task.count({ where: { status: { not: 'DONE' }, dueAt: { lt: now } } }),
      this.prisma.post.findMany({
        where: { status: 'SCHEDULED', publishAt: { gte: start, lt: end } },
        orderBy: { publishAt: 'asc' },
      }),
      this.prisma.post.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.post.count({ where: { status: 'SCHEDULED', publishAt: { lt: now } } }),
    ]);
    const queueStatus = await this.queue.status();
    const failedJobs = queueStatus.queues.reduce((sum, q) => sum + q.failed, 0);

    const lines = [`📋 ${title}`, ''];
    lines.push(`Việc đến hạn hôm nay: ${dueToday.length}`);
    for (const t of dueToday.slice(0, LIST_LIMIT)) {
      lines.push(`• ${t.title} (${t.assignee.fullName}, hạn ${vnTime(t.dueAt)})`);
    }
    if (dueToday.length > LIST_LIMIT) lines.push(`… và ${dueToday.length - LIST_LIMIT} việc khác`);
    lines.push(`Việc đã quá hạn: ${overdueCount}`, '');
    lines.push(`Bài sẽ đăng hôm nay: ${scheduledToday.length}`);
    for (const p of scheduledToday.slice(0, LIST_LIMIT)) {
      lines.push(`• ${p.title} (${p.publishAt ? vnTime(p.publishAt) : '--:--'})`);
    }
    lines.push(`Bài đang chờ duyệt: ${pendingReview}`, '');

    const warnings: string[] = [];
    if (overdueCount > 0) warnings.push(`${overdueCount} việc quá hạn chưa xong`);
    if (stuckScheduled > 0) warnings.push(`${stuckScheduled} bài hẹn giờ đã quá giờ mà chưa đăng`);
    if (failedJobs > 0) warnings.push(`${failedJobs} job trong hàng đợi bị lỗi`);
    if (!queueStatus.enabled) warnings.push('Bộ lập lịch đang tắt (chưa cấu hình Redis)');
    lines.push(
      warnings.length
        ? `⚠️ Cảnh báo hệ thống:\n${warnings.map((w) => `• ${w}`).join('\n')}`
        : '✅ Hệ thống bình thường',
    );
    const body = lines.join('\n');

    const recipients = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { permissions: { some: { permission: { code: 'system:read' } } } } } },
      },
      select: { id: true },
    });
    let sent = 0;
    for (const r of recipients) {
      if (await this.notifications.notifyOnce({ userId: r.id, title, body })) sent++;
    }
    if (sent > 0) {
      await this.audit.record({
        userId: null,
        channel: 'scheduler',
        action: 'report.daily',
        params: { date: day, recipients: sent, dueToday: dueToday.length, overdue: overdueCount },
        ok: true,
      });
    }
    return { title, body, recipients: recipients.length, sent };
  }
}
