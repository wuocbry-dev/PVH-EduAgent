import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../queue/redis.service.js';

// Bộ đếm theo cửa sổ cố định dùng chung cho mọi giới hạn tần suất (đăng nhập, liên hệ, lượt xem, bot Telegram...).
// Có Redis thì đếm trong Redis (nhiều tiến trình API dùng chung, khóa theo BULLMQ_PREFIX), không có hoặc Redis lỗi
// thì đếm trong bộ nhớ của tiến trình.
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redis: RedisService) {}

  // Ghi nhận một lần trong cửa sổ `windowSec` giây; trả về tổng số lần (đã tính lần này) và số giây còn lại của cửa sổ.
  async increment(name: string, id: string, windowSec: number): Promise<{ count: number; retryAfterSec: number }> {
    return this.touch(name, id, windowSec, 1);
  }

  // Số lần hiện tại trong cửa sổ, không tính thêm.
  async peek(name: string, id: string): Promise<{ count: number; retryAfterSec: number }> {
    return this.touch(name, id, 0, 0);
  }

  async reset(name: string, id: string): Promise<void> {
    this.memory.delete(`${name}:${id}`);
    await this.redis.client?.del(this.redis.key('rl', name, id)).catch(() => 0);
  }

  private async touch(name: string, id: string, windowSec: number, add: 0 | 1) {
    const client = this.redis.client;
    if (client) {
      const key = this.redis.key('rl', name, id);
      try {
        if (add === 0) {
          const [count, ttl] = await Promise.all([client.get(key), client.ttl(key)]);
          return { count: Number(count ?? 0), retryAfterSec: Math.max(0, ttl) };
        }
        const result = await client.multi().incr(key).expire(key, windowSec, 'NX').ttl(key).exec();
        const count = Number(result?.[0]?.[1] ?? 1);
        return { count, retryAfterSec: Math.max(1, Number(result?.[2]?.[1] ?? windowSec)) };
      } catch (err) {
        this.logger.warn(`Không đếm được trong Redis, dùng bộ nhớ: ${String(err)}`);
      }
    }
    return this.touchMemory(`${name}:${id}`, windowSec, add);
  }

  private touchMemory(key: string, windowSec: number, add: 0 | 1) {
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      if (add === 0) return { count: 0, retryAfterSec: 0 };
      entry = { count: 0, resetAt: now + windowSec * 1000 };
      this.memory.set(key, entry);
    }
    entry.count += add;
    if (this.memory.size > 10_000) {
      for (const [k, v] of this.memory) if (v.resetAt <= now) this.memory.delete(k);
    }
    return { count: entry.count, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
}
