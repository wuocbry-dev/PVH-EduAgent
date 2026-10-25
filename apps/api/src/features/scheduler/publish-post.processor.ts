import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  JOB_PUBLISH_SWEEP,
  PUBLISH_ATTEMPTS,
} from '../../infrastructure/queue/queue.constants.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PostsService } from '../posts/posts.service.js';

// A05 – xử lý job đăng bài theo lịch. Job `publish` đăng đúng một bài khi đến publish_at;
// job `sweep` (mỗi phút) đăng bù các bài đã quá giờ mà chưa đăng (job bị mất, máy chủ tắt lúc đến giờ...).
@Injectable()
export class PublishPostProcessor {
  private readonly logger = new Logger(PublishPostProcessor.name);

  constructor(
    private readonly posts: PostsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  // Ném lỗi để BullMQ thử lại (tối đa PUBLISH_ATTEMPTS lần, backoff mũ). Trả về 'skipped'/'early'
  // khi bài đã hủy hoặc dời lịch: job coi như xong, không đăng gì.
  async process(job: Pick<Job, 'name' | 'data'>): Promise<string> {
    if (job.name === JOB_PUBLISH_SWEEP) return this.sweep();
    const { postId } = job.data as { postId: string };
    return this.posts.publishScheduled(postId);
  }

  async sweep(now = new Date()): Promise<string> {
    const ids = await this.posts.findDueScheduledIds(now);
    let published = 0;
    for (const id of ids) {
      try {
        if ((await this.posts.publishScheduled(id, now)) === 'published') published++;
      } catch (err) {
        // Một bài lỗi không chặn các bài còn lại; lần quét sau thử lại.
        this.logger.error(`Quét bù: không đăng được bài ${id}: ${String(err)}`);
      }
    }
    return `${published}/${ids.length}`;
  }

  // Hết lượt thử mà vẫn lỗi: cảnh báo Admin (hộp thông báo + audit log).
  async onFinalFailure(job: Pick<Job, 'name' | 'data' | 'attemptsMade' | 'opts'>, err: Error): Promise<void> {
    if (job.name !== 'publish') return;
    if (job.attemptsMade < (job.opts.attempts ?? PUBLISH_ATTEMPTS)) return;
    const { postId } = job.data as { postId: string };
    this.logger.error(`Đăng bài ${postId} thất bại sau ${job.attemptsMade} lần: ${err.message}`);
    await this.audit.record({
      userId: null,
      channel: 'scheduler',
      action: 'post.publish',
      targetType: 'post',
      targetId: postId,
      params: { auto: true, attempts: job.attemptsMade },
      ok: false,
      error: err.message,
    });
    const admins = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
      select: { id: true },
    });
    await this.notifications.notify(
      admins.map((a) => ({
        userId: a.id,
        title: 'Lỗi đăng bài tự động',
        body: `Không đăng được bài #${postId} theo lịch sau ${job.attemptsMade} lần thử: ${err.message}`,
      })),
    );
  }
}
