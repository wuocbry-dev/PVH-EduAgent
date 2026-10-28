import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_SPIKE_WINDOW_SEC, type SystemErrorDto } from '@pvh/shared';
import type { SystemError } from '../../generated/prisma/client.js';
import type { ErrorSink, HttpErrorReport } from '../../common/filters/error-sink.js';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MonitoringAlertsService } from './monitoring-alerts.service.js';
import { crossesThreshold, errorFingerprint, routePattern, sanitizeErrorMessage } from './monitoring-rules.js';

const HOUR_SEC = 3600;
const JOB_FAILURE_WINDOW_SEC = 24 * HOUR_SEC;
const ERROR_SPIKE_KEY = 'error_spike';

// Giờ (UTC, đầu giờ) làm khoá đếm lỗi theo giờ cho biểu đồ 24 giờ.
export const hourKey = (date: Date) => date.toISOString().slice(0, 13);

export function toErrorDto(e: SystemError): SystemErrorDto {
  return {
    id: e.id.toString(),
    source: e.source,
    route: e.route,
    statusCode: e.statusCode,
    message: e.message,
    count: e.count,
    firstSeenAt: e.firstSeenAt.toISOString(),
    lastSeenAt: e.lastSeenAt.toISOString(),
    resolvedAt: e.resolvedAt?.toISOString() ?? null,
  };
}

// Nhật ký lỗi (bảng system_errors, bước 26): lỗi 5xx từ AllExceptionsFilter và job BullMQ thất bại hẳn.
// Gom theo dấu vân tay, chỉ lưu route/tên job, mã và thông điệp đã làm sạch (sanitizeErrorMessage).
// Ghi chạy nền, không bao giờ ném lỗi ra request đang lỗi.
@Injectable()
export class SystemErrorsService implements ErrorSink {
  private readonly logger = new Logger(SystemErrorsService.name);
  enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimitService,
    private readonly settings: SettingsService,
    private readonly alerts: MonitoringAlertsService,
    private readonly audit: AuditLogService,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('MONITORING_ENABLED', { infer: true });
  }

  recordHttp(report: HttpErrorReport): void {
    if (!this.enabled) return;
    void this.handleHttp(report).catch((err) => this.logger.error(`Không ghi được lỗi máy chủ: ${String(err)}`));
  }

  async handleHttp(report: HttpErrorReport): Promise<void> {
    const route = report.route ? `${report.method.toUpperCase()} ${report.route}`.slice(0, 200) : routePattern(report.method, report.path);
    const message = sanitizeErrorMessage(report.error instanceof Error ? report.error.message : String(report.error));
    await this.upsert('HTTP', route, report.statusCode, message);
    await this.limits.increment('monitor-5xx-hour', hourKey(new Date()), 26 * HOUR_SEC);
    const { count } = await this.limits.increment('monitor-5xx', 'all', ERROR_SPIKE_WINDOW_SEC);
    const threshold = Number(await this.settings.effective('monitor.error_spike'));
    if (crossesThreshold(count, threshold)) {
      await this.alerts.open(
        'error_spike',
        ERROR_SPIKE_KEY,
        `${count} lỗi máy chủ (5xx) trong ${ERROR_SPIKE_WINDOW_SEC / 60} phút`,
        `Lỗi gần nhất: ${route} (${report.statusCode}) – ${message}. Xem trang Lỗi và hàng đợi để biết các nhóm lỗi.`,
      );
    }
  }

  // Job thất bại: chỉ tính khi đã hết lượt thử (final = true). Thất bại liên tiếp của một hàng đợi vượt ngưỡng thì báo.
  async recordJob(queue: string, jobName: string, attemptsMade: number, error: unknown, final: boolean): Promise<void> {
    if (!this.enabled || !final) return;
    try {
      const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      await this.upsert('JOB', `${queue}:${jobName}`, null, message);
      const { count } = await this.limits.increment('monitor-jobfail', queue, JOB_FAILURE_WINDOW_SEC);
      const threshold = Number(await this.settings.effective('monitor.job_failures'));
      if (crossesThreshold(count, threshold)) {
        await this.alerts.open(
          'job_failures',
          `job_failures:${queue}`,
          `Hàng đợi ${queue}: ${count} job thất bại liên tiếp`,
          `Job gần nhất: ${jobName}, đã thử ${attemptsMade} lần – ${message}. Có thể chạy lại ở trang Lỗi và hàng đợi.`,
        );
      }
    } catch (err) {
      this.logger.error(`Không ghi được lỗi job ${queue}: ${String(err)}`);
    }
  }

  // Job của hàng đợi chạy thành công: đặt lại chuỗi thất bại liên tiếp và đóng cảnh báo (không gửi thêm tin).
  async jobSucceeded(queue: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const { count } = await this.limits.peek('monitor-jobfail', queue);
      if (count === 0) return;
      await this.limits.reset('monitor-jobfail', queue);
      await this.alerts.resolveByKey(`job_failures:${queue}`);
    } catch (err) {
      this.logger.error(`Không cập nhật trạng thái hàng đợi ${queue}: ${String(err)}`);
    }
  }

  // Gọi mỗi lần kiểm tra sức khoẻ: hết cửa sổ đếm mà không còn lỗi 5xx thì đóng cảnh báo tăng đột biến.
  async closeSpikeIfQuiet(): Promise<void> {
    const { count } = await this.limits.peek('monitor-5xx', 'all');
    if (count === 0) await this.alerts.resolveByKey(ERROR_SPIKE_KEY);
  }

  async countByHour(hours: number, now = new Date()): Promise<{ hour: string; count: number }[]> {
    const result: { hour: string; count: number }[] = [];
    for (let i = hours - 1; i >= 0; i--) {
      const at = new Date(now.getTime() - i * HOUR_SEC * 1000);
      const key = hourKey(at);
      result.push({ hour: `${key}:00:00.000Z`, count: (await this.limits.peek('monitor-5xx-hour', key)).count });
    }
    return result;
  }

  async list(actor: AuthUser, resolved: boolean, take = 100): Promise<SystemErrorDto[]> {
    assertPermission(actor, 'system:read');
    const rows = await this.prisma.systemError.findMany({
      where: { resolvedAt: resolved ? { not: null } : null },
      orderBy: { lastSeenAt: 'desc' },
      take,
    });
    return rows.map(toErrorDto);
  }

  // Nhóm lỗi hay gặp trong 7 ngày (chưa xử lý), nhiều lần nhất trước.
  async top(take = 5): Promise<SystemErrorDto[]> {
    const rows = await this.prisma.systemError.findMany({
      where: { resolvedAt: null, lastSeenAt: { gte: new Date(Date.now() - 7 * 24 * HOUR_SEC * 1000) } },
      orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
      take,
    });
    return rows.map(toErrorDto);
  }

  async resolve(actor: AuthUser, id: string, ip?: string): Promise<SystemErrorDto> {
    assertPermission(actor, 'setting:manage');
    const errorId = parseId(id);
    const row = await this.prisma.systemError.findUnique({ where: { id: errorId } });
    if (!row) throw new NotFoundException('Không tìm thấy nhóm lỗi');
    const updated = row.resolvedAt ? row : await this.prisma.systemError.update({ where: { id: errorId }, data: { resolvedAt: new Date() } });
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'monitoring.error_resolve',
      targetType: 'system_error',
      targetId: row.id.toString(),
      params: { route: row.route },
      ok: true,
      ip,
    });
    return toErrorDto(updated);
  }

  // Một câu lệnh: tạo nhóm mới hoặc tăng đếm; lỗi tái xuất hiện thì mở lại (resolved_at = null).
  private async upsert(source: 'HTTP' | 'JOB', route: string, statusCode: number | null, message: string): Promise<void> {
    const fingerprint = errorFingerprint(source, route, statusCode, message);
    await this.prisma.$executeRaw`
      INSERT INTO system_errors (fingerprint, source, route, status_code, message)
      VALUES (${fingerprint}, ${source}::"SystemErrorSource", ${route}, ${statusCode}, ${message})
      ON CONFLICT (fingerprint) DO UPDATE
        SET count = system_errors.count + 1, last_seen_at = now(), resolved_at = NULL, message = EXCLUDED.message`;
  }
}
