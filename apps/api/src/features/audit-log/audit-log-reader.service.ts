import { Injectable } from '@nestjs/common';
import type {
  AuditFiltersDto,
  AuditLogDto,
  AuditLogPageDto,
} from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { ListAuditLogsQuery } from './dto/audit-logs.dto.js';

const MAX_ACTIONS = 200;

// F16 – xem nhật ký hoạt động (audit_logs). Chỉ người có system:read (ADMIN, BGH).
@Injectable()
export class AuditLogReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: AuthUser,
    query: ListAuditLogsQuery,
  ): Promise<AuditLogPageDto> {
    assertPermission(user, 'system:read');
    const where: Prisma.AuditLogWhereInput = {
      userId: query.userId ? parseId(query.userId) : undefined,
      channel: query.channel,
      action: query.action
        ? { contains: query.action, mode: 'insensitive' }
        : undefined,
      createdAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
      // Con trỏ theo id giảm dần: ổn định kể cả khi có dòng mới được ghi trong lúc xem.
      id: query.cursor ? { lt: parseId(query.cursor) } : undefined,
    };
    // Lấy dư một dòng để biết còn trang sau hay không.
    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toDto),
      nextCursor:
        rows.length > query.limit ? page[page.length - 1].id.toString() : null,
    };
  }

  async filters(user: AuthUser): Promise<AuditFiltersDto> {
    assertPermission(user, 'system:read');
    const [users, actions] = await Promise.all([
      this.prisma.user.findMany({
        where: { auditLogs: { some: {} } },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        orderBy: { action: 'asc' },
        take: MAX_ACTIONS,
      }),
    ]);
    return {
      users: users.map((u) => ({ id: u.id.toString(), name: u.fullName })),
      actions: actions.map((a) => a.action),
    };
  }
}

function toDto(
  row: Prisma.AuditLogGetPayload<{
    include: { user: { select: { fullName: true } } };
  }>,
): AuditLogDto {
  return {
    id: row.id.toString(),
    createdAt: row.createdAt.toISOString(),
    userId: row.userId?.toString() ?? null,
    userName: row.user?.fullName ?? null,
    channel: row.channel,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId?.toString() ?? null,
    payload: row.payload,
    ip: row.ip,
  };
}
