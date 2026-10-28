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
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { ActivationService } from '../activation/activation.service.js';
import { normalizeLoginId, UsersService } from '../users/users.service.js';
import type {
  ActivateInput,
  ChangePasswordInput,
  LoginInput,
  ResetPasswordInput,
} from './dto/auth.dto.js';
import { deviceOf } from '../../common/utils/device.js';
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

const INVALID_CREDENTIALS = 'Tài khoản hoặc mật khẩu không đúng';
// Một thông báo chung cho mọi lý do thất bại: không tiết lộ mã học sinh có tồn tại hay mã nào đã dùng.
const INVALID_ACTIVATION = 'Mã đăng nhập hoặc mã kích hoạt không đúng, hoặc mã đã hết hạn';
export const ACTIVATE_IP_MAX_FAILURES = 20;
const ACTIVATE_IP_WINDOW_SEC = 10 * 60;
export const ACTIVATE_ID_MAX_FAILURES = 5;
const ACTIVATE_ID_WINDOW_SEC = 15 * 60;

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
    private readonly activation: ActivationService,
    private readonly limits: RateLimitService,
  ) {}

  async login(input: LoginInput, meta: ClientMeta): Promise<AuthResult> {
    const ip = meta.ip ?? 'unknown';
    const retryAfter = await this.limiter.retryAfterSeconds(ip, input.identifier);
    if (retryAfter > 0) {
      await this.recordLogin(null, input.identifier, meta, 'Bị chặn tạm thời');
      throw new HttpException(
        `Đăng nhập sai quá nhiều lần, thử lại sau ${retryAfter} giây`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cred = await this.users.findCredentials(normalizeLoginId(input.identifier));
    const valid =
      !!cred && (await verifyPassword(input.password, cred.passwordHash));
    const user =
      valid && cred.active ? await this.users.findAuthUserById(cred.id) : null;
    if (!user) {
      await this.limiter.recordFailure(ip, input.identifier);
      await this.recordLogin(
        cred?.id ?? null,
        input.identifier,
        meta,
        valid ? 'Tài khoản bị khóa' : INVALID_CREDENTIALS,
      );
      throw new UnauthorizedException(
        valid ? 'Tài khoản đang bị khóa' : INVALID_CREDENTIALS,
      );
    }

    await this.limiter.reset(ip, input.identifier);
    await this.recordLogin(user.id, input.identifier, meta);
    return {
      user: toAuthMeDto(user),
      tokens: await this.tokens.issue(user.id, meta),
    };
  }

  // Kích hoạt tài khoản (hoặc đặt lại mật khẩu khi được cấp mã mới) bằng mã dùng một lần rồi đăng nhập luôn.
  // Giới hạn theo IP và theo mã đăng nhập; sai nhiều lần thì khoá tạm, mọi lý do thất bại cùng một thông báo.
  async activate(input: ActivateInput, meta: ClientMeta): Promise<AuthResult> {
    const ip = meta.ip ?? 'unknown';
    const loginId = input.identifier.trim().toUpperCase();
    const [byIp, byId] = await Promise.all([
      this.limits.peek('activate-ip', ip),
      this.limits.peek('activate-id', loginId),
    ]);
    const blocked =
      byIp.count >= ACTIVATE_IP_MAX_FAILURES
        ? byIp.retryAfterSec
        : byId.count >= ACTIVATE_ID_MAX_FAILURES
          ? byId.retryAfterSec
          : 0;
    if (blocked > 0) {
      await this.recordActivation(null, loginId, meta, 'Bị chặn tạm thời');
      throw new HttpException(
        `Nhập sai quá nhiều lần, thử lại sau ${Math.max(1, blocked)} giây`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cred = await this.users.findCredentials(normalizeLoginId(input.identifier));
    const ok =
      !!cred &&
      cred.status !== 'LOCKED' &&
      (await this.activation.redeem(
        cred.id,
        input.activationCode,
        await hashPassword(input.newPassword),
      ));
    const user = ok ? await this.users.findAuthUserById(cred.id) : null;
    if (!user) {
      await Promise.all([
        this.limits.increment('activate-ip', ip, ACTIVATE_IP_WINDOW_SEC),
        this.limits.increment('activate-id', loginId, ACTIVATE_ID_WINDOW_SEC),
      ]);
      await this.recordActivation(cred?.id ?? null, loginId, meta, INVALID_ACTIVATION);
      throw new BadRequestException(INVALID_ACTIVATION);
    }

    await this.limits.reset('activate-id', loginId);
    // Đặt mật khẩu mới thì mọi phiên cũ (nếu là cấp lại mã) hết hiệu lực.
    await this.tokens.revokeAll(user.id);
    await this.recordActivation(user.id, loginId, meta);
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

  private recordActivation(
    userId: string | null,
    loginId: string,
    meta: ClientMeta,
    error?: string,
  ): Promise<void> {
    return this.audit.record({
      userId,
      channel: 'web',
      action: 'auth.activate',
      params: { loginId },
      ok: !error,
      error,
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
      // Thiết bị (trình duyệt + hệ điều hành, không lưu nguyên User-Agent): bước 26 so "đăng nhập từ nơi lạ".
      params: { email, device: deviceOf(meta.userAgent) },
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
