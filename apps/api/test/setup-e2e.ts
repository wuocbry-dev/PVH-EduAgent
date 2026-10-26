import 'dotenv/config';
import { Redis } from 'ioredis';
import { parseRedisUrl } from '../src/infrastructure/queue/queue.service.js';

// Bộ đếm giới hạn tần suất (đăng nhập sai, throttler) nằm trong Redis theo tiền tố của lần chạy nên tồn tại giữa các
// file test cùng một lần chạy. Xoá chúng trước mỗi file để kết quả không phụ thuộc thứ tự chạy các file.
beforeAll(async () => {
  const url = process.env.REDIS_URL;
  const prefix = process.env.BULLMQ_PREFIX;
  if (!url || !prefix?.startsWith('pvh-test-')) return;
  const redis = new Redis(parseRedisUrl(url) as object);
  try {
    for (const pattern of [`${prefix}:rl:*`, `${prefix}:throttle:*`]) {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
});
