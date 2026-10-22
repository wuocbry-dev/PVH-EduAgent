import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthMeDto } from '@pvh/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import {
  clearAuthCookies,
  clientMeta,
  readCookie,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth.cookies.js';
import { AuthService, toAuthMeDto } from './auth.service.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
} from './dto/auth.dto.js';

@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookies =
      config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthMeDto> {
    const { user, tokens } = await this.auth.login(body, clientMeta(req));
    setAuthCookies(res, tokens, this.secureCookies);
    return user;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthMeDto> {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    try {
      if (!refreshToken) throw new UnauthorizedException('Chưa đăng nhập');
      const { user, tokens } = await this.auth.refresh(
        refreshToken,
        clientMeta(req),
      );
      setAuthCookies(res, tokens, this.secureCookies);
      return user;
    } catch (err) {
      clearAuthCookies(res, this.secureCookies);
      throw err;
    }
  }

  // Public để đăng xuất được cả khi access token đã hết hạn.
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE), clientMeta(req));
    clearAuthCookies(res, this.secureCookies);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthMeDto {
    return toAuthMeDto(user);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const tokens = await this.auth.changePassword(user, body, clientMeta(req));
    setAuthCookies(res, tokens, this.secureCookies);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    await this.auth.forgotPassword(body.email, clientMeta(req));
    return {
      message: 'Nếu email có trong hệ thống, link đặt lại mật khẩu đã được gửi',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.resetPassword(body, clientMeta(req));
  }
}
