import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Permission,
  Role,
  RoleDto,
  RolesOverviewDto,
} from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

// F11 – xem vai trò × quyền và sửa quyền của vai trò (role_permissions).
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async overview(actor: AuthUser): Promise<RolesOverviewDto> {
    assertPermission(actor, 'user:manage');
    const [roles, permissions] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: { id: 'asc' },
        include: { permissions: { include: { permission: true } } },
      }),
      this.prisma.permission.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return {
      roles: roles.map((r) => ({
        code: r.code as Role,
        name: r.name,
        permissions: r.permissions.map((rp) => rp.permission.code as Permission),
      })),
      permissions: permissions.map((p) => ({
        code: p.code as Permission,
        description: p.description,
      })),
    };
  }

  async updatePermissions(
    actor: AuthUser,
    code: Role,
    permissions: Permission[],
    ip?: string,
  ): Promise<RoleDto> {
    assertPermission(actor, 'user:manage');
    // Nếu ADMIN mất user:manage thì không còn ai quản lý được hệ thống.
    if (code === 'ADMIN' && !permissions.includes('user:manage')) {
      throw new BadRequestException(
        'Vai trò ADMIN phải giữ quyền user:manage',
      );
    }
    const role = await this.prisma.role.findUnique({
      where: { code },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');

    const rows = await this.prisma.permission.findMany({
      where: { code: { in: permissions } },
    });
    if (rows.length !== permissions.length) {
      throw new BadRequestException('Có quyền không tồn tại');
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      this.prisma.rolePermission.createMany({
        data: rows.map((p) => ({ roleId: role.id, permissionId: p.id })),
      }),
    ]);
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'role.update_permissions',
      targetType: 'role',
      targetId: role.id.toString(),
      params: {
        role: code,
        before: role.permissions.map((rp) => rp.permission.code),
        after: permissions,
      },
      ok: true,
      ip,
    });
    return { code, name: role.name, permissions };
  }
}
