import 'dotenv/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { parseRedisUrl } from '../src/infrastructure/queue/queue.service.js';
import { QUEUE_NAMES } from '../src/infrastructure/queue/queue.constants.js';

// Chạy xong e2e thì xóa sạch các hàng đợi và khóa (OTP Telegram, bộ đếm tần suất) mang tiền tố riêng
// của lần chạy này khỏi Redis.
export default function setup() {
  return async () => {
    const url = process.env.REDIS_URL;
    const prefix = process.env.BULLMQ_PREFIX;
    if (!url || !prefix?.startsWith('pvh-test-')) return;
    for (const name of QUEUE_NAMES) {
      const queue = new Queue(name, { connection: parseRedisUrl(url), prefix });
      try {
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
      }
    }
    const redis = new Redis(parseRedisUrl(url) as object);
    try {
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length) await redis.del(...keys);
    } finally {
      redis.disconnect();
    }
  };
}
