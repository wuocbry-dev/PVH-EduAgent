import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { BulkUserActionInput, BulkUserActionResultDto, UserSessionDto } from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { deviceOf } from '../../common/utils/device.js';
import { parseId } from '../../common/utils/parse-id.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { verifyPassword } from '../auth/password.js';
import { UsersAdminService } from './users-admin.service.js';

const PASSWORD_FAILURES_MAX = 5;
const PASSWORD_WINDOW_SEC = 15 * 60;

// Bước 26: phiên đăng nhập (refresh token còn hiệu lực) và buộc đăng xuất. Quyền user:manage (chỉ ADMIN).
// Buộc đăng xuất thu hồi mọi refresh token: người dùng phải đăng nhập lại khi access token (tối đa 15 phút) hết hạn;
// muốn chặn ngay thì khoá tài khoản (guard đọc lại trạng thái mỗi request).
// Thao tác hàng loạt cần nhập lại mật khẩu của người thao tác; không có tool AI Agent.
@Injectable()
export class UserSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: UsersAdminService,
    private readonly audit: AuditLogService,
    private readonly limits: RateLimitService,
  ) {}

  async list(actor: AuthUser, userId: string): Promise<UserSessionDto[]> {
    assertPermission(actor, 'user:manage');
    const id = await this.userOrThrow(userId);
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      ip: r.ip,
      userAgent: r.userAgent ? deviceOf(r.userAgent) : null,
    }));
  }

  async revoke(actor: AuthUser, userId: string, sessionId: string, ip?: string): Promise<void> {
    assertPermission(actor, 'user:manage');
    const id = await this.userOrThrow(userId);
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: parseId(sessionId), userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Không tìm thấy phiên đang hoạt động');
    await this.record(actor, 'user.session_revoke', id, ip, { session: sessionId });
  }

  async logoutAll(actor: AuthUser, userId: string, ip?: string): Promise<{ revoked: number }> {
    assertPermission(actor, 'user:manage');
    const id = await this.userOrThrow(userId);
    const revoked = await this.revokeAll(id);
    await this.record(actor, 'user.logout_all', id, ip, { revoked });
    return { revoked };
  }

  // Khoá hoặc buộc đăng xuất nhiều tài khoản. Bỏ qua (kèm lý do) chính mình và ADMIN cuối cùng.
  async bulk(actor: AuthUser, input: BulkUserActionInput, ip?: string): Promise<BulkUserActionResultDto> {
    assertPermission(actor, 'user:manage');
    await this.confirmPassword(actor, input.password);
    const result: BulkUserActionResultDto = { done: 0, skipped: [] };
    for (const userId of input.userIds) {
      if (userId === actor.id) {
        result.skipped.push({ userId, reason: 'Không thao tác hàng loạt lên chính tài khoản của mình' });
        continue;
      }
      try {
        if (input.action === 'lock') {
          await this.admin.setStatus(actor, userId, 'LOCKED', ip);
        } else {
          await this.revokeAll(await this.userOrThrow(userId));
        }
        result.done++;
      } catch (err) {
        result.skipped.push({ userId, reason: err instanceof HttpException ? err.message : 'Lỗi không xác định' });
      }
    }
    // Chỉ ghi số lượng; khoá từng người đã có dòng user.lock riêng.
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: input.action === 'lock' ? 'user.bulk_lock' : 'user.bulk_logout',
      params: { requested: input.userIds.length, done: result.done, skipped: result.skipped.length },
      ok: true,
      ip,
    });
    return result;
  }

  private async confirmPassword(actor: AuthUser, password: string): Promise<void> {
    const { count } = await this.limits.peek('bulk-password', actor.id);
    if (count >= PASSWORD_FAILURES_MAX) {
      throw new HttpException('Nhập sai mật khẩu quá nhiều lần, thử lại sau ít phút', HttpStatus.TOO_MANY_REQUESTS);
    }
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: BigInt(actor.id) }, select: { passwordHash: true } });
    if (!(await verifyPassword(password, me.passwordHash))) {
      await this.limits.increment('bulk-password', actor.id, PASSWORD_WINDOW_SEC);
      throw new BadRequestException('Mật khẩu xác nhận không đúng');
    }
    await this.limits.reset('bulk-password', actor.id);
  }

  private async revokeAll(userId: bigint): Promise<number> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  private async userOrThrow(id: string): Promise<bigint> {
    const user = await this.prisma.user.findUnique({ where: { id: parseId(id) }, select: { id: true } });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user.id;
  }

  private record(actor: AuthUser, action: string, targetId: bigint, ip: string | undefined, params: Record<string, unknown>) {
    return this.audit.record({ userId: actor.id, channel: 'web', action, targetType: 'user', targetId: targetId.toString(), params, ok: true, ip });
  }
}
