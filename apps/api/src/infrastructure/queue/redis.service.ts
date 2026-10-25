import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation.js';
import { parseRedisUrl } from './queue.service.js';

// Kết nối Redis dùng chung cho dữ liệu ngắn hạn ngoài BullMQ (OTP liên kết Telegram, đếm tần suất).
// Khóa luôn mang tiền tố BULLMQ_PREFIX nên test (pvh-test-*) không đụng dữ liệu của máy dev.
// REDIS_URL để trống thì `client` là undefined.
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client?: Redis;
  private readonly prefix: string;

  constructor(config: ConfigService<Env, true>) {
    this.prefix = config.get('BULLMQ_PREFIX', { infer: true });
    const url = config.get('REDIS_URL', { infer: true });
    if (!url) return;
    this.client = new Redis({
      ...(parseRedisUrl(url) as object),
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.client.on('error', (err) =>
      this.logger.error(`Redis: ${err.message}`),
    );
  }

  key(...parts: string[]): string {
    return [this.prefix, ...parts].join(':');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.client.status !== 'end') {
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }
}
