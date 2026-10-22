import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { UsersService } from '../users/users.service.js';

export const DEV_USER_HEADER = 'x-dev-user-email';
const DEFAULT_DEV_USER = 'bgh@pvh.edu.vn';

// Guard tạm cho giai đoạn phát triển: chọn tài khoản (đã seed) qua header `x-dev-user-email`.
// Thay bằng JWT guard (F10) trước khi triển khai; ở production guard này luôn chặn.
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new UnauthorizedException('Chưa cấu hình xác thực JWT');
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const user = await this.users.findAuthUserByEmail(
      req.headers[DEV_USER_HEADER] ?? DEFAULT_DEV_USER,
    );
    if (!user) throw new UnauthorizedException('Không tìm thấy tài khoản');
    req.user = user;
    return true;
  }
}
