import { Injectable } from '@nestjs/common';
import type { DashboardDto, SchoolOverviewDto } from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { QueueService } from '../../infrastructure/queue/queue.service.js';
import { PostsService } from '../posts/posts.service.js';
import { TasksService } from '../tasks/tasks.service.js';

const TZ = 'Asia/Ho_Chi_Minh';
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly queue: QueueService,
    private readonly tasks: TasksService,
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

  // A07: tóm tắt trong ngày (giờ Việt Nam): việc quá hạn hoặc đến hạn hôm nay và bài hẹn đăng hôm nay.
  // Mỗi phần chỉ có khi người dùng đủ quyền xem; giáo viên chỉ thấy việc và bài của mình.
  async summarizeDay(user: AuthUser, now = new Date()) {
    const day = now.toLocaleDateString('en-CA', { timeZone: TZ });
    const start = new Date(`${day}T00:00:00+07:00`);
    const end = new Date(start.getTime() + DAY_MS);
    const hoursLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 3_600_000));

    const canTasks = can(user, 'task:read:all') || can(user, 'task:read:own');
    const deadlines = canTasks ? await this.tasks.listDeadlines(user, hoursLeft) : [];
    const scheduled = (await this.posts.list(user, 'SCHEDULED')).filter(
      (p) => p.publishAt && new Date(p.publishAt) >= start && new Date(p.publishAt) < end,
    );
    return {
      date: day,
      tasks: canTasks
        ? deadlines.map((t) => ({ id: t.id, title: t.title, assignee: t.assigneeName, dueAt: t.dueAt, overdue: t.overdue }))
        : null,
      postsScheduledToday: scheduled.map((p) => ({ id: p.id, title: p.title, publishAt: p.publishAt })),
    };
  }

  // Số liệu toàn trường cho trang tổng quan của Ban giám hiệu (quyền academic:manage).
  async getOverview(user: AuthUser): Promise<SchoolOverviewDto> {
    assertPermission(user, 'academic:manage');
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    const [classes, students, teachers] = await Promise.all([
      year ? this.prisma.schoolClass.count({ where: { schoolYearId: year.id } }) : 0,
      year ? this.prisma.classEnrollment.count({ where: { schoolYearId: year.id, student: { status: { not: 'LOCKED' } } } }) : 0,
      this.prisma.teacherProfile.count({ where: { user: { status: { not: 'LOCKED' } } } }),
    ]);
    return { schoolYearName: year?.name ?? null, classes, students, teachers };
  }

  // Số liệu cho trang tổng quan của cổng: mỗi nhóm chỉ trả khi người dùng có quyền tương ứng.
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
