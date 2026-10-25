import { Global, Module } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogReader } from './audit-log-reader.service.js';
import { AuditLogService } from './audit-log.service.js';

@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogReader],
  exports: [AuditLogService],
})
export class AuditLogModule {}
