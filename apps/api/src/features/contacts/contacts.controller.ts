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
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ContactsService } from './contacts.service.js';
import {
  createContactSchema,
  listContactsQuerySchema,
  updateContactStatusSchema,
  type CreateContactInput,
  type ListContactsQuery,
  type UpdateContactStatusInput,
} from './dto/contacts.dto.js';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Public()
  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactInput,
    @Req() req: Request,
  ) {
    await this.contacts.create(body, req.ip ?? 'unknown');
    return { message: 'Nhà trường đã nhận được liên hệ của bạn, xin cảm ơn.' };
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listContactsQuerySchema))
    query: ListContactsQuery,
  ) {
    return this.contacts.list(user, query);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContactStatusSchema))
    body: UpdateContactStatusInput,
    @Req() req: Request,
  ) {
    return this.contacts.updateStatus(user, id, body.status, req.ip);
  }
}
