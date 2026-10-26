import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AnnouncementsService } from './announcements.service.js';
import {
  createAnnouncementSchema,
  markReadSchema,
  type CreateAnnouncementInput,
  type MarkReadInput,
} from './dto/announcements.dto.js';

// Thông báo theo đối tượng và hộp thông báo (bước 20). Quyền và phạm vi kiểm tra trong service.
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('inbox')
  inbox(@CurrentUser() user: AuthUser) {
    return this.announcements.inbox(user);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { unread: await this.announcements.unreadCount(user) };
  }

  @Post('inbox/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(markReadSchema)) body: MarkReadInput) {
    return this.announcements.markRead(user, body);
  }

  @Get('targets')
  targets(@CurrentUser() user: AuthUser) {
    return this.announcements.targets(user);
  }

  @Get('sent')
  sent(@CurrentUser() user: AuthUser) {
    return this.announcements.sent(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createAnnouncementSchema)) body: CreateAnnouncementInput, @Req() req: Request) {
    return this.announcements.create(user, body, req.ip);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.announcements.remove(user, id, req.ip);
  }
}
