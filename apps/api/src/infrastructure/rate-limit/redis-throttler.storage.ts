import { Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../queue/redis.service.js';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

// Kho đếm của @nestjs/throttler đặt trong Redis để nhiều tiến trình API dùng chung hạn mức.
// Không có Redis (hoặc Redis lỗi) thì dùng kho trong bộ nhớ mặc định của thư viện.
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memory = new ThrottlerStorageService();

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redis.client;
    if (!client) return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    const hitsKey = this.redis.key('throttle', throttlerName, key);
    const blockKey = `${hitsKey}:block`;
    try {
      const blocked = await client.pttl(blockKey);
      if (blocked > 0) {
        const left = Math.max(0, await client.pttl(hitsKey));
        return {
          totalHits: limit + 1,
          timeToExpire: Math.ceil(left / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blocked / 1000),
        };
      }
      const result = await client.multi().incr(hitsKey).pexpire(hitsKey, ttl, 'NX').pttl(hitsKey).exec();
      const totalHits = Number(result?.[0]?.[1] ?? 1);
      const left = Math.max(0, Number(result?.[2]?.[1] ?? ttl));
      if (totalHits > limit) {
        await client.set(blockKey, '1', 'PX', blockDuration);
        return {
          totalHits,
          timeToExpire: Math.ceil(left / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDuration / 1000),
        };
      }
      return { totalHits, timeToExpire: Math.ceil(left / 1000), isBlocked: false, timeToBlockExpire: 0 };
    } catch (err) {
      this.logger.warn(`Không đếm được trong Redis, dùng bộ nhớ: ${String(err)}`);
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
