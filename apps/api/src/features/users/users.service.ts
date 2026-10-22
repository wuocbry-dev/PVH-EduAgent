import { Injectable } from '@nestjs/common';
import type { Permission, Role } from '@pvh/shared';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

// users → user_roles → roles → role_permissions → permissions
const WITH_PERMISSIONS = {
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.UserInclude;

type UserWithPermissions = Prisma.UserGetPayload<{
  include: typeof WITH_PERMISSIONS;
}>;

export interface UserCredentials {
  id: string;
  email: string;
  passwordHash: string;
  active: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Tài khoản đang hoạt động kèm vai trò và toàn bộ quyền.
  async findAuthUserByEmail(email: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: WITH_PERMISSIONS,
    });
    return toAuthUser(user);
  }

  async findAuthUserById(id: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
      include: WITH_PERMISSIONS,
    });
    return toAuthUser(user);
  }

  // Chỉ dùng cho xác thực: trả kèm password_hash, không bao giờ đưa ra API.
  async findCredentials(
    where: { email: string } | { id: string },
  ): Promise<UserCredentials | null> {
    const user = await this.prisma.user.findUnique({
      where: 'email' in where ? where : { id: BigInt(where.id) },
      select: { id: true, email: true, passwordHash: true, status: true },
    });
    if (!user) return null;
    return {
      id: user.id.toString(),
      email: user.email,
      passwordHash: user.passwordHash,
      active: user.status === 'ACTIVE',
    };
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: BigInt(id) },
      data: { passwordHash },
    });
  }
}

function toAuthUser(user: UserWithPermissions | null): AuthUser | null {
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
