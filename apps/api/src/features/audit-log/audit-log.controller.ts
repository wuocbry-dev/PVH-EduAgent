import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AuditLogReader } from './audit-log-reader.service.js';
import {
  listAuditLogsQuerySchema,
  type ListAuditLogsQuery,
} from './dto/audit-logs.dto.js';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly reader: AuditLogReader) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listAuditLogsQuerySchema))
    query: ListAuditLogsQuery,
  ) {
    return this.reader.list(user, query);
  }

  @Get('filters')
  filters(@CurrentUser() user: AuthUser) {
    return this.reader.filters(user);
  }
}
