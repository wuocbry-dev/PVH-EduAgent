import { Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  agentStatsQuerySchema,
  listAlertsQuerySchema,
  listErrorsQuerySchema,
  type AgentStatsQuery,
  type ListAlertsQuery,
  type ListErrorsQuery,
} from './dto/monitoring.dto.js';
import { AgentStatsService } from './agent-stats.service.js';
import { MonitoringAlertsService } from './monitoring-alerts.service.js';
import { MonitoringService } from './monitoring.service.js';
import { SystemErrorsService } from './system-errors.service.js';

// Trung tâm giám sát (bước 26). Xem: system:read; thao tác hệ thống: setting:manage; gỡ chặn: user:manage
// (kiểm tra trong service). Không có tool AI Agent cho các thao tác này.
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly alerts: MonitoringAlertsService,
    private readonly errors: SystemErrorsService,
    private readonly agentStats: AgentStatsService,
  ) {}

  // Bước 27: thống kê AI Agent (chỉ số lượng và tên tool, không có nội dung hội thoại).
  @Get('agent')
  agent(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(agentStatsQuerySchema)) query: AgentStatsQuery) {
    return this.agentStats.stats(user, query.days);
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.monitoring.overview(user);
  }

  @Post('check-now')
  @HttpCode(200)
  checkNow(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.monitoring.checkNow(user, req.ip);
  }

  @Get('alerts')
  alertList(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listAlertsQuerySchema)) query: ListAlertsQuery) {
    return this.alerts.list(user, query.open);
  }

  @Post('alerts/:id/resolve')
  @HttpCode(200)
  resolveAlert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.alerts.resolve(user, id, req.ip);
  }

  @Get('errors')
  errorList(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(listErrorsQuerySchema)) query: ListErrorsQuery) {
    return this.errors.list(user, query.resolved);
  }

  @Post('errors/:id/resolve')
  @HttpCode(200)
  resolveError(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.errors.resolve(user, id, req.ip);
  }

  @Get('jobs/failed')
  failedJobs(@CurrentUser() user: AuthUser) {
    return this.monitoring.failedJobs(user);
  }

  @Post('jobs/:queue/:jobId/retry')
  @HttpCode(204)
  async retryJob(@CurrentUser() user: AuthUser, @Param('queue') queue: string, @Param('jobId') jobId: string, @Req() req: Request) {
    await this.monitoring.retryJob(user, queue, jobId, req.ip);
  }

  @Get('security')
  security(@CurrentUser() user: AuthUser) {
    return this.monitoring.security(user);
  }

  // `id` là IP, "IP|tên đăng nhập" hoặc mã đăng nhập (đã mã hoá URL).
  @Delete('blocked/:limit/:id')
  @HttpCode(204)
  async unblock(@CurrentUser() user: AuthUser, @Param('limit') limit: string, @Param('id') id: string, @Req() req: Request) {
    await this.monitoring.unblock(user, limit, id, req.ip);
  }
}
