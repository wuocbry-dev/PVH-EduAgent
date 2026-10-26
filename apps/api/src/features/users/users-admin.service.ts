import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Role,
  UserDto,
  UserListDto,
  UserStatus,
} from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { UNUSABLE_PASSWORD_HASH } from '../activation/activation.service.js';
import { hashPassword } from '../auth/password.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from './dto/users.dto.js';

const WITH_ROLES = {
  roles: { include: { role: { select: { code: true } } } },
  studentProfile: { select: { studentCode: true } },
  teacherProfile: { select: { teacherCode: true } },
  // Lớp của năm học hiện hành: học sinh đang học lớp nào, giáo viên đang chủ nhiệm lớp nào.
  enrollments: { where: { schoolYear: { isCurrent: true } }, include: { class: { select: { name: true } } } },
  homeroomClasses: { where: { schoolYear: { isCurrent: true } }, select: { name: true } },
} satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof WITH_ROLES }>;

// F11 – quản lý người dùng. Chỉ ADMIN (quyền user:manage); AI Agent không có tool cho phần này.
@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: AuthUser, query: ListUsersQuery): Promise<UserListDto> {
    assertPermission(actor, 'user:manage');
    const where: Prisma.UserWhereInput = {
      status: query.status,
      roles: query.role ? { some: { role: { code: query.role } } } : undefined,
      enrollments: query.classId ? { some: { classId: BigInt(query.classId) } } : undefined,
      OR: query.q
        ? [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { studentProfile: { studentCode: { contains: query.q, mode: 'insensitive' } } },
            { teacherProfile: { teacherCode: { contains: query.q, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: WITH_ROLES,
        orderBy: { id: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: users.map(toUserDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(
    actor: AuthUser,
    input: CreateUserInput,
    ip?: string,
  ): Promise<UserDto> {
    assertPermission(actor, 'user:manage');
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException('Email đã được sử dụng');
    }
    const roleIds = await this.roleIds(input.roles);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(input.password),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
      include: WITH_ROLES,
    });
    await this.record(actor, 'user.create', user.id, ip, {
      email: user.email,
      roles: input.roles,
    });
    return toUserDto(user);
  }

  async update(
    actor: AuthUser,
    id: string,
    input: UpdateUserInput,
    ip?: string,
  ): Promise<UserDto> {
    assertPermission(actor, 'user:manage');
    const target = await this.findOrThrow(id);
    if (input.roles && !input.roles.includes('ADMIN')) {
      await this.assertNotLastAdmin(target, 'Không thể gỡ vai trò của quản trị viên cuối cùng');
    }
    const roleIds = input.roles ? await this.roleIds(input.roles) : null;
    const user = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        roles: roleIds
          ? {
              deleteMany: {},
              create: roleIds.map((roleId) => ({ roleId })),
            }
          : undefined,
      },
      include: WITH_ROLES,
    });
    await this.record(actor, 'user.update', user.id, ip, {
      fullName: input.fullName,
      phone: input.phone,
      roles: input.roles,
    });
    return toUserDto(user);
  }

  async setStatus(
    actor: AuthUser,
    id: string,
    status: UserStatus,
    ip?: string,
  ): Promise<UserDto> {
    assertPermission(actor, 'user:manage');
    const target = await this.findOrThrow(id);
    if (status === 'LOCKED') {
      if (target.id.toString() === actor.id) {
        throw new BadRequestException('Không thể tự khóa tài khoản của chính mình');
      }
      await this.assertNotLastAdmin(target, 'Không thể khóa quản trị viên cuối cùng');
    }
    // Mở khóa tài khoản chưa từng kích hoạt thì quay về "chờ kích hoạt", không thành ACTIVE với mật khẩu không dùng được.
    const hash = await this.prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { passwordHash: true } });
    const next = status === 'ACTIVE' && hash.passwordHash === UNUSABLE_PASSWORD_HASH ? 'PENDING' : status;
    const user = await this.prisma.user.update({
      where: { id: target.id },
      data: { status: next },
      include: WITH_ROLES,
    });
    // Khóa xong thì đăng xuất mọi phiên (access token tự vô hiệu vì guard đọc lại CSDL).
    if (status === 'LOCKED') await this.revokeSessions(target.id);
    await this.record(
      actor,
      status === 'LOCKED' ? 'user.lock' : 'user.unlock',
      user.id,
      ip,
      { email: user.email },
    );
    return toUserDto(user);
  }

  async resetPassword(
    actor: AuthUser,
    id: string,
    newPassword: string,
    ip?: string,
  ): Promise<void> {
    assertPermission(actor, 'user:manage');
    const target = await this.findOrThrow(id);
    await this.prisma.user.update({
      where: { id: target.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        // Quản trị đặt mật khẩu cho tài khoản chờ kích hoạt thì tài khoản dùng được ngay.
        status: target.status === 'PENDING' ? 'ACTIVE' : undefined,
      },
    });
    await this.revokeSessions(target.id);
    await this.record(actor, 'user.reset_password', target.id, ip, {
      email: target.email,
    });
  }

  private async findOrThrow(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findUnique({
      where: { id: parseId(id) },
      include: WITH_ROLES,
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  private async roleIds(codes: Role[]): Promise<bigint[]> {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: codes } },
    });
    if (roles.length !== codes.length) {
      throw new BadRequestException('Có vai trò không tồn tại');
    }
    return roles.map((r) => r.id);
  }

  // Luôn phải còn ít nhất một ADMIN đang hoạt động ngoài người bị tác động.
  private async assertNotLastAdmin(
    target: UserWithRoles,
    message: string,
  ): Promise<void> {
    const isActiveAdmin =
      target.status === 'ACTIVE' &&
      target.roles.some((ur) => ur.role.code === 'ADMIN');
    if (!isActiveAdmin) return;
    const others = await this.prisma.user.count({
      where: {
        id: { not: target.id },
        status: 'ACTIVE',
        roles: { some: { role: { code: 'ADMIN' } } },
      },
    });
    if (others === 0) throw new BadRequestException(message);
  }

  private async revokeSessions(userId: bigint): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private record(
    actor: AuthUser,
    action: string,
    targetId: bigint,
    ip: string | undefined,
    params: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      userId: actor.id,
      channel: 'web',
      action,
      targetType: 'user',
      targetId: targetId.toString(),
      params,
      ok: true,
      ip,
    });
  }
}

function toUserDto(user: UserWithRoles): UserDto {
  return {
    id: user.id.toString(),
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    status: user.status,
    roles: user.roles.map((ur) => ur.role.code as Role),
    code: user.studentProfile?.studentCode ?? user.teacherProfile?.teacherCode ?? null,
    className: user.enrollments[0]?.class.name ?? user.homeroomClasses[0]?.name ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
