import { Injectable } from '@nestjs/common';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { PostsService } from '../posts/posts.service.js';

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
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
      postsPendingReview,
      postsScheduled,
    };
  }
}
