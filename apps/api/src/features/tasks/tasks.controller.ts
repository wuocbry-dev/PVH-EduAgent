import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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
  createTaskSchema,
  listTasksQuerySchema,
  setTaskStatusSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type ListTasksQuery,
  type SetTaskStatusInput,
  type UpdateTaskInput,
} from './dto/tasks.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('deadlines')
  deadlines(
    @CurrentUser() user: AuthUser,
    @Query('withinHours', new DefaultValuePipe(48), ParseIntPipe)
    withinHours: number,
  ) {
    return this.tasks.listDeadlines(user, withinHours);
  }

  @Get('assignees')
  assignees(@CurrentUser() user: AuthUser) {
    return this.tasks.listAssignees(user);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery,
  ) {
    return this.tasks.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.get(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
    @Req() req: Request,
  ) {
    return this.tasks.create(user, body, { ip: req.ip });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
    @Req() req: Request,
  ) {
    return this.tasks.update(user, id, body, { ip: req.ip });
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setTaskStatusSchema)) body: SetTaskStatusInput,
    @Req() req: Request,
  ) {
    return this.tasks.setStatus(user, id, body.status, { ip: req.ip });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.tasks.remove(user, id, { ip: req.ip });
  }
}
