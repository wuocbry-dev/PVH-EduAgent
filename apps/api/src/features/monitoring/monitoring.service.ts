import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ERROR_RETENTION_DAYS,
  HEALTH_RETENTION_DAYS,
  MONITOR_SERVICE_NAMES,
  MONITOR_SERVICES,
  type BlockedEntryDto,
  type FailedJobDto,
  type FailedLoginDto,
  type HealthSnapshotDto,
  type HealthStatus,
  type MonitoringOverviewDto,
  type MonitorService,
  type SecurityOverviewDto,
  type StorageUsageDto,
} from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { QUEUE_NAMES, type QueueName } from '../../infrastructure/queue/queue.constants.js';
import { QueueService } from '../../infrastructure/queue/queue.service.js';
import { RedisService } from '../../infrastructure/queue/redis.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { PrivateStorageService } from '../../infrastructure/storage/private-storage.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { ACTIVATE_ID_MAX_FAILURES, ACTIVATE_IP_MAX_FAILURES } from '../auth/auth.service.js';
import { LOGIN_IP_MAX_FAILURES, LOGIN_PAIR_MAX_FAILURES } from '../auth/login-rate-limiter.js';
import { SettingsService } from '../settings/settings.service.js';
import { HealthProbeService, type ProbeResult } from './health-probe.service.js';
import { formatVnTime, MonitoringAlertsService } from './monitoring-alerts.service.js';
import { formatBytes, healthTransition, sanitizeErrorMessage, storagePercent } from './monitoring-rules.js';
import { SystemErrorsService } from './system-errors.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SECURITY_KINDS = ['login_failures', 'new_login', 'privileged_account', 'role_change'] as const;
const CHECKS_PER_MINUTE = 6;

// Bộ đếm giới hạn tần suất xem được trên trang Giám sát và ngưỡng chặn của từng loại.
const BLOCK_RULES: { limit: BlockedEntryDto['limit']; name: string; label: string; threshold: number; match: (id: string) => boolean }[] = [
  { limit: 'login', name: 'login', label: 'Đăng nhập sai (IP + tài khoản)', threshold: LOGIN_PAIR_MAX_FAILURES, match: (id) => id.includes('|') },
  { limit: 'login-ip', name: 'login', label: 'Đăng nhập sai (cả IP)', threshold: LOGIN_IP_MAX_FAILURES, match: (id) => !id.includes('|') },
  { limit: 'activate-ip', name: 'activate-ip', label: 'Kích hoạt sai (IP)', threshold: ACTIVATE_IP_MAX_FAILURES, match: () => true },
  { limit: 'activate-id', name: 'activate-id', label: 'Kích hoạt sai (mã đăng nhập)', threshold: ACTIVATE_ID_MAX_FAILURES, match: () => true },
];

// Trung tâm giám sát (bước 26): chạy kiểm tra sức khoẻ, đo dung lượng kho, dọn dữ liệu cũ và cấp số liệu cho trang /admin.
// Xem cần system:read; thao tác hệ thống (chạy lại job, kiểm tra ngay) cần setting:manage; gỡ chặn IP cần user:manage.
// Quyền luôn kiểm tra TRƯỚC khi đọc input hay dữ liệu.
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly lastStatus = new Map<MonitorService, HealthStatus>();
  private storageCache: StorageUsageDto | null = null;
  readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly probes: HealthProbeService,
    private readonly alerts: MonitoringAlertsService,
    private readonly errors: SystemErrorsService,
    private readonly queue: QueueService,
    private readonly redis: RedisService,
    private readonly limits: RateLimitService,
    private readonly storage: StorageService,
    private readonly privateStorage: PrivateStorageService,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogService,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('MONITORING_ENABLED', { infer: true });
  }

  // ───────────── Job định kỳ ─────────────

  // Kiểm tra mọi dịch vụ, lưu kết quả, báo khi dịch vụ vừa ngừng hoặc vừa hồi phục (không báo lại khi trạng thái không đổi).
  async runHealthCheck(now = new Date()): Promise<ProbeResult[]> {
    const results = await this.probes.runAll();
    try {
      await this.prisma.systemHealthCheck.createMany({
        data: results.map((r) => ({ service: r.service, status: r.status, latencyMs: r.latencyMs, message: r.message, checkedAt: now })),
      });
    } catch (err) {
      this.logger.error(`Không lưu được kết quả kiểm tra sức khoẻ: ${String(err)}`);
    }
    if (this.lastStatus.size === 0) {
      for (const s of await this.latest().catch(() => [])) this.lastStatus.set(s.service, s.status);
    }
    for (const r of results) {
      const previous = this.lastStatus.get(r.service) ?? null;
      this.lastStatus.set(r.service, r.status);
      const name = MONITOR_SERVICE_NAMES[r.service];
      const key = `service:${r.service}`;
      const transition = healthTransition(previous, r.status);
      try {
        if (transition === 'down') {
          await this.alerts.open('service_down', key, `${name} đang ngừng`, `${r.message ?? 'Không trả lời'}. Phát hiện lúc ${formatVnTime(now)}.`);
        } else if (transition === 'recovered') {
          await this.alerts.resolveByKey(key, { title: `Đã hồi phục: ${name}`, detail: `${name} hoạt động lại lúc ${formatVnTime(now)}.` });
        }
      } catch (err) {
        this.logger.error(`Không xử lý được cảnh báo ${key}: ${String(err)}`);
      }
    }
    await this.errors.closeSpikeIfQuiet().catch(() => undefined);
    return results;
  }

  // Đo dung lượng hai kho (mỗi giờ). Kho R2 vượt ngưỡng thì báo, xuống dưới ngưỡng thì đóng cảnh báo.
  async measureStorage(now = new Date()): Promise<StorageUsageDto> {
    const [publicBytes, privateBytes] = await Promise.all([this.storage.usageBytes(), this.privateStorage.usageBytes()]);
    const quotaGb = Number(await this.settings.effective('monitor.r2_quota_gb'));
    const quotaBytes = quotaGb * 1024 ** 3;
    const totalBytes = publicBytes + privateBytes;
    const usage: StorageUsageDto = {
      measuredAt: now.toISOString(),
      driver: this.storage.driver === 'r2' || this.privateStorage.driver === 'r2' ? 'r2' : 'local',
      publicBytes,
      privateBytes,
      totalBytes,
      quotaBytes,
      percent: storagePercent(totalBytes, quotaBytes),
    };
    this.storageCache = usage;
    await this.redis.client?.set(this.redis.key('monitor', 'storage'), JSON.stringify(usage)).catch(() => undefined);
    if (usage.driver === 'r2') {
      const warn = Number(await this.settings.effective('monitor.r2_warn_percent'));
      if (usage.percent >= warn) {
        await this.alerts.open(
          'storage',
          'storage',
          `Kho R2 đã dùng ${usage.percent}% (ngưỡng ${warn}%)`,
          `${formatBytes(totalBytes)} / ${quotaGb} GB: ảnh/video ${formatBytes(publicBytes)}, tài liệu ${formatBytes(privateBytes)}.`,
        );
      } else {
        await this.alerts.resolveByKey('storage', { title: 'Kho R2 đã xuống dưới ngưỡng', detail: `Đang dùng ${usage.percent}%.` });
      }
    }
    return usage;
  }

  // Dọn dữ liệu giám sát cũ (mỗi ngày): kiểm tra sức khoẻ 7 ngày, nhóm lỗi không tái diễn 30 ngày, cảnh báo đã đóng 90 ngày.
  async cleanup(now = new Date()): Promise<{ checks: number; errors: number; alerts: number }> {
    const [checks, errors, alerts] = await Promise.all([
      this.prisma.systemHealthCheck.deleteMany({ where: { checkedAt: { lt: new Date(now.getTime() - HEALTH_RETENTION_DAYS * DAY_MS) } } }),
      this.prisma.systemError.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - ERROR_RETENTION_DAYS * DAY_MS) } } }),
      this.prisma.systemAlert.deleteMany({ where: { resolvedAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } } }),
    ]);
    return { checks: checks.count, errors: errors.count, alerts: alerts.count };
  }

  // ADMIN bấm "Kiểm tra ngay" (không chờ job mỗi phút).
  async checkNow(actor: AuthUser, ip?: string): Promise<HealthSnapshotDto[]> {
    assertPermission(actor, 'setting:manage');
    const { count } = await this.limits.increment('monitor-check', actor.id, 60);
    if (count > CHECKS_PER_MINUTE) throw new HttpException('Kiểm tra quá nhiều lần, thử lại sau ít phút', HttpStatus.TOO_MANY_REQUESTS);
    const now = new Date();
    const results = await this.runHealthCheck(now);
    await this.audit.record({ userId: actor.id, channel: 'web', action: 'monitoring.check_now', params: { down: results.filter((r) => r.status === 'DOWN').length }, ok: true, ip });
    return results.map((r) => ({ ...r, name: MONITOR_SERVICE_NAMES[r.service], checkedAt: now.toISOString() }));
  }

  // ───────────── Số liệu cho trang /admin ─────────────

  async overview(actor: AuthUser): Promise<MonitoringOverviewDto> {
    assertPermission(actor, 'system:read');
    const since = new Date(Date.now() - DAY_MS);
    const [services, latency24h, errorsByHour, topErrors, queue, storage, failedLogins24h, blocked, openAlerts, alertsSetting] = await Promise.all([
      this.latest(),
      this.latency24h(since),
      this.errors.countByHour(24),
      this.errors.top(5),
      this.queue.status(),
      this.storageUsage(),
      this.prisma.auditLog.count({ where: { action: 'auth.login', createdAt: { gte: since }, payload: { path: ['ok'], equals: false } } }),
      this.blockedEntries(),
      this.alerts.list(actor, true),
      this.settings.effective('telegram.admin_alerts'),
    ]);
    return {
      services,
      latency24h,
      errorsByHour,
      topErrors,
      queue,
      storage,
      failedLogins24h,
      blockedCount: blocked.length,
      openAlerts,
      system: { uptimeSec: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024), node: process.version },
      monitoringEnabled: this.enabled && this.queue.enabled,
      alertsEnabled: alertsSetting === 'true',
    };
  }

  // Job thất bại đang lưu trong từng hàng đợi (20 job mới nhất mỗi hàng), lý do đã làm sạch.
  async failedJobs(actor: AuthUser): Promise<FailedJobDto[]> {
    assertPermission(actor, 'system:read');
    const result: FailedJobDto[] = [];
    for (const name of QUEUE_NAMES) {
      const q = this.queue.queue(name);
      if (!q) continue;
      for (const job of await q.getFailed(0, 19)) {
        result.push({
          queue: name,
          id: job.id ?? '',
          name: job.name,
          reason: sanitizeErrorMessage(job.failedReason ?? ''),
          attemptsMade: job.attemptsMade,
          failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        });
      }
    }
    return result.sort((a, b) => (b.failedAt ?? '').localeCompare(a.failedAt ?? ''));
  }

  async retryJob(actor: AuthUser, queueName: string, jobId: string, ip?: string): Promise<void> {
    assertPermission(actor, 'setting:manage');
    if (!(QUEUE_NAMES as readonly string[]).includes(queueName)) throw new NotFoundException('Không tìm thấy hàng đợi');
    const q = this.queue.queue(queueName as QueueName);
    if (!q) throw new BadRequestException('Bộ lập lịch đang tắt (chưa cấu hình Redis)');
    const job = await q.getJob(jobId);
    if (!job) throw new NotFoundException('Không tìm thấy job');
    if ((await job.getState()) !== 'failed') throw new ConflictException('Job không ở trạng thái thất bại');
    await job.retry();
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'monitoring.job_retry',
      params: { queue: queueName, job: job.name },
      ok: true,
      ip,
    });
  }

  async security(actor: AuthUser): Promise<SecurityOverviewDto> {
    assertPermission(actor, 'system:read');
    const [failedLogins, blocked, alerts] = await Promise.all([
      this.failedLogins(),
      this.blockedEntries(),
      this.alerts.list(actor, false, [...SECURITY_KINDS], 30),
    ]);
    return { failedLogins, blocked, alerts };
  }

  // Gỡ một IP/tài khoản đang bị chặn tạm thời do nhập sai nhiều lần.
  async unblock(actor: AuthUser, limit: string, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'user:manage');
    const rule = BLOCK_RULES.find((r) => r.limit === limit);
    if (!rule || !rule.match(id) || id.length > 300) throw new NotFoundException('Không tìm thấy mục bị chặn');
    const { count } = await this.limits.peek(rule.name, id);
    if (count === 0) throw new NotFoundException('Mục này không còn bị chặn');
    await this.limits.reset(rule.name, id);
    await this.audit.record({ userId: actor.id, channel: 'web', action: 'monitoring.unblock', params: { limit, id }, ok: true, ip });
  }

  // ───────────── Nội bộ ─────────────

  // Kết quả mới nhất của từng dịch vụ (dịch vụ chưa kiểm tra lần nào: "Chưa kiểm tra").
  private async latest(): Promise<HealthSnapshotDto[]> {
    const rows = await this.prisma.$queryRaw<{ service: string; status: HealthStatus; latency_ms: number | null; message: string | null; checked_at: Date }[]>`
      SELECT DISTINCT ON (service) service, status::text AS status, latency_ms, message, checked_at
      FROM system_health_checks
      WHERE checked_at >= now() - interval '7 days'
      ORDER BY service, checked_at DESC`;
    const byService = new Map(rows.map((r) => [r.service, r]));
    return MONITOR_SERVICES.map((service) => {
      const row = byService.get(service);
      return {
        service,
        name: MONITOR_SERVICE_NAMES[service],
        status: row?.status ?? 'OFF',
        latencyMs: row?.latency_ms ?? null,
        message: row ? row.message : 'Chưa kiểm tra lần nào',
        checkedAt: row?.checked_at.toISOString() ?? null,
      };
    });
  }

  private async latency24h(since: Date): Promise<MonitoringOverviewDto['latency24h']> {
    const rows = await this.prisma.$queryRaw<{ service: string; hour: Date; avg_ms: number | null; down: number }[]>`
      SELECT service, date_trunc('hour', checked_at) AS hour,
             avg(latency_ms) FILTER (WHERE status <> 'DOWN' AND status <> 'OFF')::float AS avg_ms,
             count(*) FILTER (WHERE status = 'DOWN')::int AS down
      FROM system_health_checks
      WHERE checked_at >= ${since}
      GROUP BY 1, 2`;
    const start = new Date(Math.floor(since.getTime() / 3_600_000) * 3_600_000 + 3_600_000);
    return MONITOR_SERVICES.map((service) => ({
      service,
      hours: Array.from({ length: 24 }, (_, i) => {
        const hour = new Date(start.getTime() + i * 3_600_000);
        const row = rows.find((r) => r.service === service && r.hour.getTime() === hour.getTime());
        return { hour: hour.toISOString(), avgMs: row?.avg_ms == null ? null : Math.round(row.avg_ms), down: row?.down ?? 0 };
      }),
    }));
  }

  private async storageUsage(): Promise<StorageUsageDto | null> {
    if (this.storageCache) return this.storageCache;
    const raw = await this.redis.client?.get(this.redis.key('monitor', 'storage')).catch(() => null);
    if (!raw) return null;
    try {
      return (this.storageCache = JSON.parse(raw) as StorageUsageDto);
    } catch {
      return null;
    }
  }

  private async failedLogins(): Promise<FailedLoginDto[]> {
    const rows = await this.prisma.$queryRaw<{ identifier: string | null; count: number; ips: string[]; last_at: Date }[]>`
      SELECT payload->'params'->>'email' AS identifier, count(*)::int AS count,
             array_remove(array_agg(DISTINCT host(ip)), NULL) AS ips, max(created_at) AS last_at
      FROM audit_logs
      WHERE action = 'auth.login' AND payload->>'ok' = 'false' AND created_at >= now() - interval '24 hours'
      GROUP BY 1
      ORDER BY 2 DESC, 4 DESC
      LIMIT 20`;
    return rows.map((r) => ({ identifier: r.identifier ?? '(trống)', count: r.count, ips: r.ips.slice(0, 5), lastAt: r.last_at.toISOString() }));
  }

  private async blockedEntries(): Promise<BlockedEntryDto[]> {
    const names = [...new Set(BLOCK_RULES.map((r) => r.name))];
    const found = await Promise.all(names.map(async (name) => [name, await this.limits.list(name, 1)] as const));
    const entries: BlockedEntryDto[] = [];
    for (const [name, list] of found) {
      for (const item of list) {
        const rule = BLOCK_RULES.find((r) => r.name === name && r.match(item.id));
        if (rule && item.count >= rule.threshold) entries.push({ limit: rule.limit, label: rule.label, ...item });
      }
    }
    return entries.sort((a, b) => b.count - a.count);
  }
}
