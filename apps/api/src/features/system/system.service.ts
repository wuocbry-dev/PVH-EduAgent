import { Injectable } from '@nestjs/common';
import type { DashboardDto } from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { QueueService } from '../../infrastructure/queue/queue.service.js';
import { PostsService } from '../posts/posts.service.js';

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly queue: QueueService,
  ) {}

  async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // A03: tình trạng hệ thống. Hàng đợi BullMQ sẽ bổ sung khi làm Scheduler.
  async getStatus(user: AuthUser) {
    assertPermission(user, 'system:read');
    const [postsPendingReview, postsScheduled] = await Promise.all([
      this.posts.countByStatus('PENDING_REVIEW'),
      this.posts.countByStatus('SCHEDULED'),
    ]);
    return {
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node: process.version,
      database: (await this.isDatabaseUp()) ? 'ok' : 'down',
      // Hàng đợi bộ lập lịch (A05, A06, A09): số job chờ, hẹn giờ, đang chạy và lỗi.
      queue: await this.queue.status(),
      postsPendingReview,
      postsScheduled,
    };
  }

  // Số liệu cho trang tổng quan /admin: mỗi nhóm chỉ trả khi người dùng có quyền tương ứng.
  async getDashboard(user: AuthUser): Promise<DashboardDto> {
    const dashboard: DashboardDto = {};

    if (can(user, 'post:approve')) {
      const [pending, scheduled, contactsNew] = await Promise.all([
        this.posts.countByStatus('PENDING_REVIEW'),
        this.posts.countByStatus('SCHEDULED'),
        this.prisma.contact.count({ where: { status: 'NEW' } }),
      ]);
      dashboard.postsPendingReview = pending;
      dashboard.postsScheduled = scheduled;
      dashboard.contactsNew = contactsNew;
    }

    const scope = can(user, 'task:read:all')
      ? 'all'
      : can(user, 'task:read:own')
        ? 'own'
        : null;
    if (scope) {
      // Việc quá hạn: chưa DONE và đã qua due_at (tính khi truy vấn, như danh sách công việc).
      dashboard.tasksOverdue = await this.prisma.task.count({
        where: {
          status: { not: 'DONE' },
          dueAt: { lt: new Date() },
          assigneeId: scope === 'all' ? undefined : BigInt(user.id),
        },
      });
      dashboard.tasksOverdueScope = scope;
    }

    if (can(user, 'system:read')) {
      dashboard.system = {
        uptimeSec: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        node: process.version,
        database: (await this.isDatabaseUp()) ? 'ok' : 'down',
        queue: await this.queue.status(),
      };
    }
    return dashboard;
  }
}
