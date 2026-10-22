import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { UsersService } from '../users/users.service.js';
import { ACCESS_COOKIE, readCookie } from './auth.cookies.js';
import { TokenService } from './token.service.js';

export const DEV_USER_HEADER = 'x-dev-user-email';

// Guard toàn cục (F10): đọc access token JWT từ cookie `pvh_access`
// (hoặc header `Authorization: Bearer`). Route có @Public() thì bỏ qua.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly devAuth: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
  ) {
    // Chỉ để thử nghiệm: chọn tài khoản qua header khi chạy dev và bật DEV_AUTH=true.
    this.devAuth =
      config.get('NODE_ENV', { infer: true }) === 'development' &&
      config.get('DEV_AUTH', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = await this.resolveUser(req);
    if (!user) {
      throw new UnauthorizedException('Chưa đăng nhập hoặc phiên đã hết hạn');
    }
    req.user = user;
    return true;
  }

  private async resolveUser(req: Request): Promise<AuthUser | null> {
    const devEmail = req.get(DEV_USER_HEADER);
    if (this.devAuth && devEmail) {
      return this.users.findAuthUserByEmail(devEmail);
    }

    const bearer = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '')?.[1];
    const token = readCookie(req, ACCESS_COOKIE) ?? bearer;
    const userId = token ? await this.tokens.verifyAccess(token) : null;
    // Đọc lại từ CSDL mỗi request: tài khoản bị khóa hoặc đổi quyền có hiệu lực ngay.
    return userId ? this.users.findAuthUserById(userId) : null;
  }
}
