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
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createEventSchema,
  listEventsQuerySchema,
  updateEventSchema,
  type CreateEventInput,
  type ListEventsQuery,
  type UpdateEventInput,
} from './dto/events.dto.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // Công khai: sự kiện sắp tới, hoặc các sự kiện trong khoảng [from, to] (lịch tháng).
  @Public()
  @Get()
  list(
    @Query(new ZodValidationPipe(listEventsQuerySchema)) query: ListEventsQuery,
  ) {
    return this.events.list(query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEventSchema)) body: CreateEventInput,
    @Req() req: Request,
  ) {
    return this.events.create(user, body, req.ip);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEventSchema)) body: UpdateEventInput,
    @Req() req: Request,
  ) {
    return this.events.update(user, id, body, req.ip);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.events.remove(user, id, req.ip);
  }
}
