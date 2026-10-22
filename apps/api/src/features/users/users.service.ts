import { Injectable } from '@nestjs/common';
import type { Permission, Role } from '@pvh/shared';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Tài khoản đang hoạt động kèm vai trò và toàn bộ quyền (users → user_roles → roles → role_permissions).
  async findAuthUserByEmail(email: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE') return null;

    const roles = user.roles.map((ur) => ur.role);
    const permissions = new Set(
      roles.flatMap((r) => r.permissions.map((rp) => rp.permission.code)),
    );
    return {
      id: user.id.toString(),
      email: user.email,
      fullName: user.fullName,
      roles: roles.map((r) => r.code as Role),
      permissions: [...permissions] as Permission[],
    };
  }
}
