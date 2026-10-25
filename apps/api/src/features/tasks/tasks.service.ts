import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  SettableTaskStatus,
  TaskAssigneeDto,
  TaskDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { stripHtml } from '../../common/utils/sanitize-content.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  AuditLogService,
  type AuditChannel,
} from '../audit-log/audit-log.service.js';
import type {
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskInput,
} from './dto/tasks.dto.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_LIST = 200;

const WITH_USERS = {
  assignee: { select: { fullName: true } },
  creator: { select: { fullName: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof WITH_USERS }>;

export type DeadlineItem = TaskDto;

export interface ActionMeta {
  ip?: string;
  channel?: AuditChannel;
}

// F14 – công việc và hạn chót. Quyền: task:assign (giao/sửa/xóa việc), task:read:all (xem mọi việc),
// task:read:own (chỉ việc của mình). Người được giao tự đổi trạng thái việc của mình.
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  // A04: việc chưa xong sắp đến hạn hoặc đã quá hạn. Giáo viên chỉ thấy việc của mình.
  async listDeadlines(
    user: AuthUser,
    withinHours: number,
  ): Promise<DeadlineItem[]> {
    const scope = this.readScope(user);
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        dueAt: { lte: new Date(Date.now() + withinHours * HOUR_MS) },
        assigneeId: scope === 'all' ? undefined : BigInt(user.id),
      },
      include: WITH_USERS,
      orderBy: { dueAt: 'asc' },
    });
    return tasks.map(toTaskDto);
  }

  async list(user: AuthUser, query: ListTasksQuery): Promise<TaskDto[]> {
    const scope = this.readScope(user);
    const now = new Date();
    const where: Prisma.TaskWhereInput = {
      // Người chỉ có task:read:own luôn bị ép về việc của mình, bất kể bộ lọc.
      assigneeId:
        scope === 'all'
          ? query.assigneeId
            ? parseId(query.assigneeId)
            : undefined
          : BigInt(user.id),
      dueAt: {
        gte: query.dueFrom ? new Date(query.dueFrom) : undefined,
        lte: query.dueTo ? new Date(query.dueTo) : undefined,
      },
    };
    if (query.status === 'OVERDUE') {
      where.status = { not: 'DONE' };
      where.dueAt = { ...(where.dueAt as object), lt: now };
    } else if (query.status) {
      where.status = query.status;
    }
    const tasks = await this.prisma.task.findMany({
      where,
      include: WITH_USERS,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: MAX_LIST,
    });
    return tasks.map(toTaskDto);
  }

  async get(user: AuthUser, id: string): Promise<TaskDto> {
    const scope = this.readScope(user);
    const task = await this.findOrThrow(id);
    if (scope === 'own' && task.assigneeId.toString() !== user.id) {
      throw new ForbiddenException('Bạn không được xem công việc của người khác');
    }
    return toTaskDto(task);
  }

  // Nhân sự có thể được giao việc (không gồm học sinh).
  async listAssignees(user: AuthUser): Promise<TaskAssigneeDto[]> {
    if (!can(user, 'task:assign') && !can(user, 'task:read:all')) {
      throw new ForbiddenException(
        `Tài khoản ${user.email} không được xem danh sách người phụ trách`,
      );
    }
    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { code: { not: 'STUDENT' } } } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({ id: u.id.toString(), fullName: u.fullName }));
  }

  async create(
    user: AuthUser,
    input: CreateTaskInput,
    meta: ActionMeta = {},
  ): Promise<TaskDto> {
    assertPermission(user, 'task:assign');
    const assigneeId = await this.activeAssigneeOrThrow(input.assigneeId);
    const task = await this.prisma.task.create({
      data: {
        title: stripHtml(input.title),
        description: input.description ? stripHtml(input.description) : null,
        assigneeId,
        createdBy: BigInt(user.id),
        priority: input.priority,
        dueAt: input.dueAt,
      },
      include: WITH_USERS,
    });
    await this.record(user, 'create', task, meta, {
      title: task.title,
      assigneeId: input.assigneeId,
      dueAt: input.dueAt.toISOString(),
    });
    return toTaskDto(task);
  }

  // Sửa nội dung, đổi người phụ trách hoặc đổi hạn: chỉ người có task:assign.
  async update(
    user: AuthUser,
    id: string,
    input: UpdateTaskInput,
    meta: ActionMeta = {},
  ): Promise<TaskDto> {
    assertPermission(user, 'task:assign');
    const existing = await this.findOrThrow(id);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = stripHtml(input.title);
    if (input.description !== undefined) {
      data.description = input.description ? stripHtml(input.description) : null;
    }
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.dueAt !== undefined) {
      data.dueAt = input.dueAt;
      // Đổi hạn: việc đã bị đánh OVERDUE mà hạn mới còn ở tương lai thì mở lại, và bộ lập lịch
      // (A06) được nhắc lại cho hạn mới nên xóa các mốc nhắc cũ.
      if (existing.status === 'OVERDUE' && input.dueAt.getTime() > Date.now()) {
        data.status = 'TODO';
      }
    }
    if (input.assigneeId !== undefined) {
      data.assigneeId = await this.activeAssigneeOrThrow(input.assigneeId);
    }
    const task = await this.prisma.$transaction(async (tx) => {
      // Chỉ xóa mốc nhắc của đúng công việc này, và chỉ khi hạn chót thật sự đổi.
      if (input.dueAt !== undefined && input.dueAt.getTime() !== existing.dueAt.getTime()) {
        await tx.taskReminder.deleteMany({ where: { taskId: existing.id } });
      }
      return tx.task.update({
        where: { id: existing.id },
        data,
        include: WITH_USERS,
      });
    });
    await this.record(user, 'update', task, meta, {
      fields: Object.keys(input),
      dueAt:
        input.dueAt === undefined
          ? undefined
          : { from: existing.dueAt.toISOString(), to: input.dueAt.toISOString() },
    });
    return toTaskDto(task);
  }

  // Người được giao (hoặc người có task:assign) đổi trạng thái. DONE ghi completed_at.
  async setStatus(
    user: AuthUser,
    id: string,
    status: SettableTaskStatus,
    meta: ActionMeta = {},
  ): Promise<TaskDto> {
    const existing = await this.findOrThrow(id);
    const isAssignee = existing.assigneeId.toString() === user.id;
    if (!isAssignee && !can(user, 'task:assign')) {
      throw new ForbiddenException(
        'Chỉ người được giao hoặc người có quyền giao việc mới đổi được trạng thái công việc này',
      );
    }
    const task = await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        status,
        // Chuyển sang DONE thì ghi thời điểm hoàn thành; mở lại việc thì xóa.
        completedAt:
          status === 'DONE' ? (existing.completedAt ?? new Date()) : null,
      },
      include: WITH_USERS,
    });
    await this.record(user, 'update_status', task, meta, {
      from: existing.status,
      to: status,
    });
    return toTaskDto(task);
  }

  async remove(
    user: AuthUser,
    id: string,
    meta: ActionMeta = {},
  ): Promise<void> {
    assertPermission(user, 'task:assign');
    const existing = await this.findOrThrow(id);
    await this.prisma.task.delete({ where: { id: existing.id } });
    await this.record(user, 'delete', existing, meta, { title: existing.title });
  }

  // all = xem mọi việc, own = chỉ việc của mình; không có quyền nào thì 403.
  private readScope(user: AuthUser): 'all' | 'own' {
    if (can(user, 'task:read:all')) return 'all';
    if (can(user, 'task:read:own')) return 'own';
    throw new ForbiddenException(
      `Tài khoản ${user.email} không được xem công việc`,
    );
  }

  private async findOrThrow(id: string): Promise<TaskRow> {
    const task = await this.prisma.task.findUnique({
      where: { id: parseId(id) },
      include: WITH_USERS,
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    return task;
  }

  private async activeAssigneeOrThrow(assigneeId: string): Promise<bigint> {
    const assignee = await this.prisma.user.findUnique({
      where: { id: parseId(assigneeId) },
    });
    if (!assignee || assignee.status !== 'ACTIVE') {
      throw new BadRequestException('Người phụ trách không tồn tại hoặc đã bị khóa');
    }
    return assignee.id;
  }

  private record(
    user: AuthUser,
    action: string,
    task: { id: bigint },
    meta: ActionMeta,
    params: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      userId: user.id,
      channel: meta.channel ?? 'web',
      action: `task.${action}`,
      targetType: 'task',
      targetId: task.id.toString(),
      params,
      ok: true,
      ip: meta.ip,
    });
  }
}

function toTaskDto(task: TaskRow): TaskDto {
  return {
    id: task.id.toString(),
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId.toString(),
    assigneeName: task.assignee.fullName,
    createdById: task.createdBy.toString(),
    createdByName: task.creator.fullName,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    overdue: task.status !== 'DONE' && task.dueAt.getTime() < Date.now(),
  };
}
