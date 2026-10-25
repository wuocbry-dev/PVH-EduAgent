import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueueStatusDto } from '@pvh/shared';
import { Queue, type ConnectionOptions } from 'bullmq';
import type { Env } from '../../config/env.validation.js';
import {
  JOB_DAILY_REPORT,
  JOB_PUBLISH,
  PUBLISH_ATTEMPTS,
  PUBLISH_BACKOFF_MS,
  PUBLISH_QUEUE,
  publishJobId,
  QUEUE_NAMES,
  REPORT_QUEUE,
  SCHEDULER_DAILY_REPORT,
  TIME_ZONE,
  type QueueName,
} from './queue.constants.js';

// Kết nối Redis + các hàng đợi BullMQ. REDIS_URL để trống thì tắt hẳn (`enabled = false`):
// mọi hàm đều không làm gì và API vẫn chạy; bài hẹn giờ sẽ được quét bù khi có Redis trở lại.
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  readonly enabled: boolean;
  readonly prefix: string;
  private readonly connection?: ConnectionOptions;
  private readonly queues = new Map<QueueName, Queue>();

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('REDIS_URL', { infer: true });
    this.prefix = config.get('BULLMQ_PREFIX', { infer: true });
    this.enabled = !!url;
    if (url) this.connection = parseRedisUrl(url);
  }

  onModuleInit(): void {
    if (!this.connection) {
      this.logger.warn(
        'Chưa cấu hình REDIS_URL: bộ lập lịch (tự đăng bài, nhắc hạn, báo cáo ngày) đang tắt',
      );
      return;
    }
    for (const name of QUEUE_NAMES) {
      const queue = new Queue(name, {
        connection: this.connection,
        prefix: this.prefix,
      });
      // Redis chập chờn không được làm sập tiến trình.
      queue.on('error', (err) =>
        this.logger.error(`Hàng đợi ${name}: ${err.message}`),
      );
      this.queues.set(name, queue);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }

  // Tùy chọn kết nối cho Worker (mỗi Worker tự mở kết nối riêng).
  workerConnection(): ConnectionOptions | undefined {
    return this.connection;
  }

  queue(name: QueueName): Queue | undefined {
    return this.queues.get(name);
  }

  // A05: tạo (hoặc thay) job đăng bài trễ đến publishAt. jobId theo bài nên không bao giờ trùng.
  // Không ném lỗi: nếu Redis lỗi, bài vẫn SCHEDULED và job quét bù sẽ đăng khi tới giờ.
  async schedulePublish(postId: string, publishAt: Date): Promise<void> {
    const queue = this.queues.get(PUBLISH_QUEUE);
    if (!queue) return;
    try {
      await this.removePublishJob(queue, postId);
      await queue.add(
        JOB_PUBLISH,
        { postId },
        {
          jobId: publishJobId(postId),
          delay: Math.max(0, publishAt.getTime() - Date.now()),
          attempts: PUBLISH_ATTEMPTS,
          backoff: { type: 'exponential', delay: PUBLISH_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.error(`Không tạo được job đăng bài ${postId}: ${String(err)}`);
    }
  }

  // Hủy lịch, đổi sang đăng ngay hoặc dời lịch: job cũ không được phép đăng bài nữa.
  async cancelPublish(postId: string): Promise<void> {
    const queue = this.queues.get(PUBLISH_QUEUE);
    if (!queue) return;
    try {
      await this.removePublishJob(queue, postId);
    } catch (err) {
      this.logger.error(`Không hủy được job đăng bài ${postId}: ${String(err)}`);
    }
  }

  // A09: đăng ký (hoặc đổi) lịch gửi báo cáo ngày theo giờ Việt Nam, time dạng "HH:mm".
  async scheduleDailyReport(time: string): Promise<void> {
    const queue = this.queues.get(REPORT_QUEUE);
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!queue || !match) return;
    try {
      await queue.upsertJobScheduler(
        SCHEDULER_DAILY_REPORT,
        { pattern: `${Number(match[2])} ${Number(match[1])} * * *`, tz: TIME_ZONE },
        { name: JOB_DAILY_REPORT, opts: { removeOnComplete: true, removeOnFail: 50 } },
      );
    } catch (err) {
      this.logger.error(`Không đăng ký được lịch báo cáo ngày: ${String(err)}`);
    }
  }

  // Tình trạng các hàng đợi cho dashboard và tool get_system_status.
  async status(): Promise<QueueStatusDto> {
    if (this.queues.size === 0) return { enabled: false, queues: [] };
    try {
      const queues = await Promise.all(
        QUEUE_NAMES.map(async (name) => {
          const counts = await this.queues
            .get(name)!
            .getJobCounts('waiting', 'delayed', 'active', 'failed');
          return {
            name,
            waiting: counts.waiting ?? 0,
            delayed: counts.delayed ?? 0,
            active: counts.active ?? 0,
            failed: counts.failed ?? 0,
          };
        }),
      );
      return { enabled: true, queues };
    } catch (err) {
      this.logger.error(`Không đọc được tình trạng hàng đợi: ${String(err)}`);
      return { enabled: true, queues: [], error: 'Không kết nối được Redis' };
    }
  }

  private async removePublishJob(queue: Queue, postId: string): Promise<void> {
    const job = await queue.getJob(publishJobId(postId));
    if (!job) return;
    try {
      await job.remove();
    } catch {
      // Job đang chạy thì không gỡ được; processor tự kiểm tra lại trạng thái bài nên vẫn an toàn.
    }
  }
}

// redis://[user:pass@]host:port[/db] → tùy chọn kết nối của BullMQ (rediss:// bật TLS).
export function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
  };
}
