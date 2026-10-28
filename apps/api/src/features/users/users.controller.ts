import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  bulkUserActionSchema,
  createUserSchema,
  listUsersQuerySchema,
  resetUserPasswordSchema,
  setUserStatusSchema,
  updateUserSchema,
  type BulkUserActionBody,
  type CreateUserInput,
  type ListUsersQuery,
  type ResetUserPasswordInput,
  type SetUserStatusInput,
  type UpdateUserInput,
} from './dto/users.dto.js';
import { UserSessionsService } from './user-sessions.service.js';
import { UsersAdminService } from './users-admin.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersAdminService,
    private readonly sessions: UserSessionsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ) {
    return this.users.list(user, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @Req() req: Request,
  ) {
    return this.users.create(user, body, req.ip);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @Req() req: Request,
  ) {
    return this.users.update(user, id, body, req.ip);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setUserStatusSchema)) body: SetUserStatusInput,
    @Req() req: Request,
  ) {
    return this.users.setStatus(user, id, body.status, req.ip);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetUserPasswordSchema))
    body: ResetUserPasswordInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.resetPassword(user, id, body.newPassword, req.ip);
  }

  // ── Bước 26: phiên đăng nhập, buộc đăng xuất, thao tác hàng loạt (user:manage) ──

  @Post('bulk-action')
  @HttpCode(200)
  bulkAction(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bulkUserActionSchema)) body: BulkUserActionBody,
    @Req() req: Request,
  ) {
    return this.sessions.bulk(user, body, req.ip);
  }

  @Get(':id/sessions')
  listSessions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessions.list(user, id);
  }

  @Delete(':id/sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.sessions.revoke(user, id, sessionId, req.ip);
  }

  @Post(':id/logout-all')
  @HttpCode(200)
  logoutAll(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.sessions.logoutAll(user, id, req.ip);
  }
}
