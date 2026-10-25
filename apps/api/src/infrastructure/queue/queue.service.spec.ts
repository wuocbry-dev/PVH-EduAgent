import { ConfigService } from '@nestjs/config';
import { parseRedisUrl, QueueService } from './queue.service.js';

describe('QueueService khi chưa cấu hình Redis', () => {
  const service = new QueueService(
    new ConfigService({ REDIS_URL: undefined, BULLMQ_PREFIX: 'pvh-unit' }),
  );
  service.onModuleInit();

  it('tắt bộ lập lịch, mọi lệnh không làm gì và không ném lỗi', async () => {
    expect(service.enabled).toBe(false);
    expect(service.workerConnection()).toBeUndefined();
    await expect(service.schedulePublish('1', new Date(Date.now() + 60_000))).resolves.toBeUndefined();
    await expect(service.cancelPublish('1')).resolves.toBeUndefined();
    await expect(service.scheduleDailyReport('07:00')).resolves.toBeUndefined();
    expect(await service.status()).toEqual({ enabled: false, queues: [] });
  });
});

describe('parseRedisUrl', () => {
  it('đọc host, cổng, mật khẩu và số CSDL', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toMatchObject({ host: 'localhost', port: 6379 });
    expect(parseRedisUrl('redis://user:p%40ss@redis.example:6380/2')).toMatchObject({
      host: 'redis.example',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
    });
  });

  it('rediss:// bật TLS, thiếu cổng thì dùng 6379', () => {
    const options = parseRedisUrl('rediss://cache.example') as { port: number; tls?: object };
    expect(options.port).toBe(6379);
    expect(options.tls).toBeDefined();
  });
});
