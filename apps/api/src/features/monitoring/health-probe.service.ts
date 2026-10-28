import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HEALTH_TIMEOUT_MS, MONITOR_SERVICES, type HealthStatus, type MonitorService } from '@pvh/shared';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { QueueService } from '../../infrastructure/queue/queue.service.js';
import { RedisService } from '../../infrastructure/queue/redis.service.js';
import { PrivateStorageService } from '../../infrastructure/storage/private-storage.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { TelegramBotService } from '../telegram/telegram-bot.service.js';
import { sanitizeErrorMessage, statusFromProbe } from './monitoring-rules.js';

export interface ProbeResult {
  service: MonitorService;
  status: HealthStatus;
  latencyMs: number | null;
  message: string | null;
}

type Probe = () => Promise<string | { off: string }>;

// Kiểm tra từng dịch vụ (bước 26). Chỉ đọc: SELECT 1, PING, đếm job, HEAD bucket, getMe của bot.
// Claude chỉ kiểm cấu hình (không gọi API tính phí mỗi phút). Mỗi lần kiểm tra có hạn HEALTH_TIMEOUT_MS.
@Injectable()
export class HealthProbeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
    private readonly privateStorage: PrivateStorageService,
    private readonly telegram: TelegramBotService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async runAll(): Promise<ProbeResult[]> {
    const probes: Record<MonitorService, Probe> = {
      database: async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return 'Kết nối được';
      },
      redis: async () => {
        if (!this.redis.client) return { off: 'Chưa cấu hình REDIS_URL' };
        await this.redis.client.ping();
        return 'PING thành công';
      },
      queue: async () => {
        if (!this.queue.enabled) return { off: 'Bộ lập lịch đang tắt (chưa cấu hình Redis)' };
        const status = await this.queue.status();
        if (status.error) throw new Error(status.error);
        const failed = status.queues.reduce((sum, q) => sum + q.failed, 0);
        return failed > 0 ? `${failed} job thất bại đang lưu` : 'Hoạt động';
      },
      r2_public: () => this.storageProbe(this.storage),
      r2_private: () => this.storageProbe(this.privateStorage),
      telegram: async () => {
        if (!this.telegram.enabled || !this.telegram.bot) return { off: 'Bot đang tắt (chưa cấu hình TELEGRAM_BOT_TOKEN)' };
        const me = await this.telegram.bot.api.getMe();
        return `Bot @${me.username} trả lời`;
      },
      claude: async () => {
        const configured = !!(this.config.get('ANTHROPIC_AUTH_TOKEN', { infer: true }) || this.config.get('ANTHROPIC_API_KEY', { infer: true }));
        if (!configured) return { off: 'Chưa cấu hình khoá, Trợ lý AI đang tắt' };
        return 'Đã cấu hình khoá (không gọi thử để tránh tính phí)';
      },
    };
    return Promise.all(MONITOR_SERVICES.map((service) => this.measure(service, probes[service])));
  }

  private async storageProbe(store: StorageService | PrivateStorageService): Promise<string> {
    await store.ping();
    return store.driver === 'r2' ? 'Bucket R2 trả lời' : 'Thư mục local trên máy chủ (không dùng R2)';
  }

  private async measure(service: MonitorService, probe: Probe): Promise<ProbeResult> {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Quá ${HEALTH_TIMEOUT_MS / 1000} giây không trả lời`)), HEALTH_TIMEOUT_MS);
      });
      const result = await Promise.race([probe(), timeout]);
      const latencyMs = Date.now() - started;
      if (typeof result === 'object') return { service, status: 'OFF', latencyMs: null, message: result.off };
      return { service, status: statusFromProbe(true, latencyMs), latencyMs, message: result };
    } catch (err) {
      // Thông điệp lỗi đã làm sạch (vd. chuỗi kết nối có mật khẩu, URL có token bot bị bỏ).
      return { service, status: 'DOWN', latencyMs: Date.now() - started, message: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) };
    } finally {
      clearTimeout(timer);
    }
  }
}
