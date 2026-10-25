import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramLinkCodeDto, TelegramLinkStatusDto } from '@pvh/shared';
import type { Update } from 'grammy/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { TelegramLinkService } from './telegram-link.service.js';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly bot: TelegramBotService,
    private readonly links: TelegramLinkService,
  ) {}

  // Telegram gọi khi TELEGRAM_MODE=webhook. Chỉ nhận request có header secret đúng.
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | undefined,
    @Body() update: Update,
  ): Promise<{ ok: true }> {
    if (!this.bot.enabled || this.bot.mode !== 'webhook') throw new NotFoundException();
    const secret = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    // So sánh bản băm để độ dài bằng nhau và không lộ thông tin qua thời gian phản hồi.
    if (!secret || !secretHeader || !timingSafeEqual(digest(secretHeader), digest(secret))) {
      throw new UnauthorizedException('Sai secret token');
    }
    if (typeof update?.update_id !== 'number') {
      throw new BadRequestException('Update không hợp lệ');
    }
    await this.bot.handleUpdate(update);
    return { ok: true };
  }

  @Get('link')
  async status(@CurrentUser() user: AuthUser): Promise<TelegramLinkStatusDto> {
    const enabled = this.bot.enabled;
    return {
      enabled,
      linked: await this.links.isLinked(user),
      botUsername: enabled ? await this.bot.botUsername() : null,
    };
  }

  @Post('link-code')
  async createCode(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<TelegramLinkCodeDto> {
    if (!this.bot.enabled) {
      throw new NotFoundException('Bot Telegram chưa được cấu hình (TELEGRAM_BOT_TOKEN)');
    }
    const { code, expiresAt } = await this.links.createCode(user, ip);
    const username = await this.bot.botUsername();
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      deepLink: username ? `https://t.me/${username}?start=${code}` : null,
    };
  }

  @Delete('link')
  @HttpCode(204)
  async unlink(@CurrentUser() user: AuthUser, @Ip() ip: string): Promise<void> {
    const chatId = await this.links.unlinkUser(user, ip);
    if (chatId) {
      await this.bot
        .sendText(chatId, 'Tài khoản đã được huỷ liên kết từ trang quản trị. Bot sẽ không nhận lệnh từ chat này nữa.')
        .catch(() => undefined);
    }
  }
}
