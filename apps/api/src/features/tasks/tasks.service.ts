import { ForbiddenException, Injectable } from '@nestjs/common';
import type { TaskDto } from '@pvh/shared';
import { can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const HOUR_MS = 60 * 60 * 1000;

export interface DeadlineItem extends TaskDto {
  overdue: boolean;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  // A04: việc chưa xong sắp đến hạn hoặc đã quá hạn. Giáo viên chỉ thấy việc của mình.
  async listDeadlines(
    user: AuthUser,
    withinHours: number,
  ): Promise<DeadlineItem[]> {
    const canReadAll = can(user, 'task:read:all');
    if (!canReadAll && !can(user, 'task:read:own')) {
      throw new ForbiddenException(
        `Tài khoản ${user.email} không được xem hạn chót`,
      );
    }

    const now = Date.now();
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        dueAt: { lte: new Date(now + withinHours * HOUR_MS) },
        assigneeId: canReadAll ? undefined : BigInt(user.id),
      },
      include: { assignee: { select: { fullName: true } } },
      orderBy: { dueAt: 'asc' },
    });

    return tasks.map((t) => ({
      id: t.id.toString(),
      title: t.title,
      assigneeId: t.assigneeId.toString(),
      assigneeName: t.assignee.fullName,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt.toISOString(),
      overdue: t.dueAt.getTime() < now,
    }));
  }
}
