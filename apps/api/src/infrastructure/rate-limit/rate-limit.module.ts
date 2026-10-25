import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../../config/env.validation.js';
import { AppThrottlerGuard } from './app-throttler.guard.js';
import { RedisService } from '../queue/redis.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

// Giới hạn tần suất: guard toàn cục (@nestjs/throttler, kho đếm ở Redis) + RateLimitService cho các giới hạn
// theo nghiệp vụ (đăng nhập sai, liên hệ, lượt xem, bot Telegram).
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService<Env, true>, redis: RedisService) => ({
        // ttl tính bằng mili giây. Mặc định rộng vì Next.js gọi API từ một IP; route nhạy cảm đặt hạn mức riêng.
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_SEC', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        storage: new RedisThrottlerStorage(redis),
        skipIf: () => config.get('THROTTLE_DISABLED', { infer: true }),
      }),
    }),
  ],
  providers: [RateLimitService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
  exports: [RateLimitService],
})
export class RateLimitModule {}
