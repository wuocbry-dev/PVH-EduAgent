import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthMeDto } from '@pvh/shared';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { UsersService } from '../users/users.service.js';
import type {
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
} from './dto/auth.dto.js';
import { LoginRateLimiter } from './login-rate-limiter.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  TokenService,
  type ClientMeta,
  type TokenPair,
} from './token.service.js';

export interface AuthResult {
  user: AuthMeDto;
  tokens: TokenPair;
}

const INVALID_CREDENTIALS = 'Email hoặc mật khẩu không đúng';

// F10 – đăng nhập, refresh, đăng xuất, đổi/quên mật khẩu.
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly limiter: LoginRateLimiter,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(input: LoginInput, meta: ClientMeta): Promise<AuthResult> {
    const ip = meta.ip ?? 'unknown';
    const retryAfter = this.limiter.retryAfterSeconds(ip, input.email);
    if (retryAfter > 0) {
      await this.recordLogin(null, input.email, meta, 'Bị chặn tạm thời');
      throw new HttpException(
        `Đăng nhập sai quá nhiều lần, thử lại sau ${retryAfter} giây`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cred = await this.users.findCredentials({ email: input.email });
    const valid =
      !!cred && (await verifyPassword(input.password, cred.passwordHash));
    const user =
      valid && cred.active ? await this.users.findAuthUserById(cred.id) : null;
    if (!user) {
      this.limiter.recordFailure(ip, input.email);
      await this.recordLogin(
        cred?.id ?? null,
        input.email,
        meta,
        valid ? 'Tài khoản bị khóa' : INVALID_CREDENTIALS,
      );
      throw new UnauthorizedException(
        valid ? 'Tài khoản đang bị khóa' : INVALID_CREDENTIALS,
      );
    }

    this.limiter.reset(ip, input.email);
    await this.recordLogin(user.id, input.email, meta);
    return {
      user: toAuthMeDto(user),
      tokens: await this.tokens.issue(user.id, meta),
    };
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<AuthResult> {
    const result = await this.tokens.rotate(refreshToken, meta);
    const user = result.ok
      ? await this.users.findAuthUserById(result.userId)
      : null;
    if (!result.ok || !user) {
      if (result.userId) {
        await this.audit.record({
          userId: result.userId,
          channel: 'web',
          action: 'auth.refresh',
          ok: false,
          error: 'Refresh token không hợp lệ hoặc đã dùng',
          ip: meta.ip,
        });
      }
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }
    return { user: toAuthMeDto(user), tokens: result.tokens };
  }

  async logout(
    refreshToken: string | undefined,
    meta: ClientMeta,
  ): Promise<void> {
    if (!refreshToken) return;
    const userId = await this.tokens.revoke(refreshToken);
    if (userId) {
      await this.audit.record({
        userId,
        channel: 'web',
        action: 'auth.logout',
        ok: true,
        ip: meta.ip,
      });
    }
  }

  // Đổi mật khẩu xong thì thu hồi mọi phiên khác và cấp phiên mới cho phiên hiện tại.
  async changePassword(
    user: AuthUser,
    input: ChangePasswordInput,
    meta: ClientMeta,
  ): Promise<TokenPair> {
    const cred = await this.users.findCredentials({ id: user.id });
    if (
      !cred ||
      !(await verifyPassword(input.currentPassword, cred.passwordHash))
    ) {
      await this.audit.record({
        userId: user.id,
        channel: 'web',
        action: 'auth.change_password',
        ok: false,
        error: 'Mật khẩu hiện tại không đúng',
        ip: meta.ip,
      });
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    await this.users.updatePasswordHash(
      user.id,
      await hashPassword(input.newPassword),
    );
    await this.tokens.revokeAll(user.id);
    await this.audit.record({
      userId: user.id,
      channel: 'web',
      action: 'auth.change_password',
      ok: true,
      ip: meta.ip,
    });
    return this.tokens.issue(user.id, meta);
  }

  // Luôn trả cùng một kết quả để không lộ email nào có trong hệ thống.
  // Chưa có dịch vụ email: tạm in link đặt lại ra log.
  async forgotPassword(email: string, meta: ClientMeta): Promise<void> {
    const cred = await this.users.findCredentials({ email });
    if (!cred?.active) return;

    const token = await this.tokens.signReset(cred.id, cred.passwordHash);
    const url = new URL(
      '/dat-lai-mat-khau',
      this.config.get('WEB_ORIGIN', { infer: true }),
    );
    url.searchParams.set('token', token);
    this.logger.log(
      `Link đặt lại mật khẩu cho ${email} (hạn 30 phút): ${url.toString()}`,
    );
    await this.audit.record({
      userId: cred.id,
      channel: 'web',
      action: 'auth.forgot_password',
      ok: true,
      ip: meta.ip,
    });
  }

  async resetPassword(
    input: ResetPasswordInput,
    meta: ClientMeta,
  ): Promise<void> {
    const claims = await this.tokens.verifyReset(input.token);
    const cred = claims
      ? await this.users.findCredentials({ id: claims.userId })
      : null;
    if (
      !claims ||
      !cred?.active ||
      this.tokens.passwordFingerprint(cred.passwordHash) !== claims.pwd
    ) {
      throw new BadRequestException(
        'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      );
    }

    await this.users.updatePasswordHash(
      cred.id,
      await hashPassword(input.newPassword),
    );
    await this.tokens.revokeAll(cred.id);
    await this.audit.record({
      userId: cred.id,
      channel: 'web',
      action: 'auth.reset_password',
      ok: true,
      ip: meta.ip,
    });
  }

  private recordLogin(
    userId: string | null,
    email: string,
    meta: ClientMeta,
    error?: string,
  ): Promise<void> {
    return this.audit.record({
      userId,
      channel: 'web',
      action: 'auth.login',
      params: { email },
      ok: !error,
      error,
      ip: meta.ip,
    });
  }
}

export function toAuthMeDto(user: AuthUser): AuthMeDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
    permissions: user.permissions,
  };
}
