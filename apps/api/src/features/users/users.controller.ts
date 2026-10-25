import {
  Body,
  Controller,
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
  createUserSchema,
  listUsersQuerySchema,
  resetUserPasswordSchema,
  setUserStatusSchema,
  updateUserSchema,
  type CreateUserInput,
  type ListUsersQuery,
  type ResetUserPasswordInput,
  type SetUserStatusInput,
  type UpdateUserInput,
} from './dto/users.dto.js';
import { UsersAdminService } from './users-admin.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersAdminService) {}

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
}
