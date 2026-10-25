import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infrastructure/queue/redis.service.js';

// Đếm số lần theo cửa sổ cố định. Có Redis thì đếm trong Redis (dùng chung khi chạy nhiều tiến trình),
// không có thì đếm trong bộ nhớ.
@Injectable()
export class TelegramRateLimiter {
  private readonly logger = new Logger(TelegramRateLimiter.name);
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redis: RedisService) {}

  // true nếu còn trong hạn mức (lần này được tính), false nếu đã vượt.
  async hit(name: string, id: string, limit: number, windowSec: number): Promise<boolean> {
    return (await this.count(name, id, windowSec, 1)) <= limit;
  }

  // Tính thêm một lần, trả về số lần trong cửa sổ hiện tại.
  increment(name: string, id: string, windowSec: number): Promise<number> {
    return this.count(name, id, windowSec, 1);
  }

  // Đã vượt hạn mức chưa (không tính thêm lần nào).
  async exceeded(name: string, id: string, limit: number, windowSec: number): Promise<boolean> {
    return (await this.count(name, id, windowSec, 0)) >= limit;
  }

  async reset(name: string, id: string): Promise<void> {
    this.memory.delete(`${name}:${id}`);
    await this.redis.client?.del(this.redis.key('tg', 'rl', name, id)).catch(() => 0);
  }

  private async count(name: string, id: string, windowSec: number, add: 0 | 1): Promise<number> {
    const client = this.redis.client;
    if (client) {
      const key = this.redis.key('tg', 'rl', name, id);
      try {
        if (add === 0) return Number((await client.get(key)) ?? 0);
        const [[, count]] = (await client
          .multi()
          .incr(key)
          .expire(key, windowSec, 'NX')
          .exec()) as [[Error | null, number], unknown];
        return count;
      } catch (err) {
        this.logger.warn(`Không đếm được trong Redis, dùng bộ nhớ: ${String(err)}`);
      }
    }
    const key = `${name}:${id}`;
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSec * 1000 };
      this.memory.set(key, entry);
    }
    entry.count += add;
    if (this.memory.size > 10_000) {
      for (const [k, v] of this.memory) if (v.resetAt <= now) this.memory.delete(k);
    }
    return entry.count;
  }
}
