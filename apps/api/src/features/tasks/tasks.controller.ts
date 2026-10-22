import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
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
}
