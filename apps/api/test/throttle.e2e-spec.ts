// Giới hạn tần suất toàn API (@nestjs/throttler, kho đếm ở Redis). Cần PostgreSQL (đã seed) và Redis.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';

const PASSWORD = 'Pvh@2026';
const EDITOR = 'bientap@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';

// Bật throttle với hạn mức mặc định thấp (5 lượt/phút) và dùng tiền tố Redis riêng để không lẫn với các file test khác.
// Đặt trước khi nạp AppModule: ConfigModule đọc biến môi trường ngay khi module được nạp.
// Biến môi trường được khôi phục trong afterAll: các file test có thể chạy chung một tiến trình.
const ENV_KEYS = ['THROTTLE_DISABLED', 'THROTTLE_LIMIT', 'THROTTLE_TTL_SEC', 'BULLMQ_PREFIX'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
process.env.THROTTLE_DISABLED = 'false';
process.env.THROTTLE_LIMIT = '5';
process.env.THROTTLE_TTL_SEC = '60';
const PREFIX = `${process.env.BULLMQ_PREFIX ?? 'pvh-test'}-throttle`;
process.env.BULLMQ_PREFIX = PREFIX;

describe('Giới hạn tần suất (bước 10, e2e)', () => {
  let app: INestApplication<App>;
  let redisClient: { keys(p: string): Promise<string[]>; del(...k: string[]): Promise<number> } | undefined;
  let agentChat: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const { AppModule } = await import('./../src/app.module.js');
    const { AgentService } = await import('./../src/features/agent/agent.service.js');
    const { RedisService } = await import('./../src/infrastructure/queue/redis.service.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    redisClient = app.get(RedisService).client;
    // Không gọi mô hình thật: chỉ kiểm tra giới hạn tần suất.
    agentChat = vi
      .spyOn(app.get(AgentService, { strict: false }), 'chat')
      .mockResolvedValue({ reply: 'ok', numTurns: 1, costUsd: 0, pendingActions: [] });
  });

  afterAll(async () => {
    const keys = (await redisClient?.keys(`${PREFIX}:*`)) ?? [];
    if (keys.length) await redisClient!.del(...keys);
    await app.close();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  const login = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  };

  it('vượt hạn mức mặc định → 429 tiếng Việt kèm Retry-After; đếm nằm trong Redis', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 5; i++) await http.get('/public/settings').expect(200);
    const blocked = await http.get('/public/settings').expect(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Route khác có bộ đếm riêng nên vẫn dùng được.
    await http.get('/public/gallery').expect(200);

    expect((await redisClient!.keys(`${PREFIX}:throttle:*`)).length).toBeGreaterThan(0);
  });

  it('API agent: 10 lượt/phút mỗi tài khoản, tài khoản khác không bị ảnh hưởng', async () => {
    const editor = await login(EDITOR);
    const principal = await login(PRINCIPAL);
    for (let i = 0; i < 10; i++) await editor.post('/agent/chat').send({ message: `lượt ${i}` }).expect(201);
    const blocked = await editor.post('/agent/chat').send({ message: 'lượt 11' }).expect(429);
    expect(blocked.body.message).toContain('quá nhanh');
    expect(agentChat).toHaveBeenCalledTimes(10); // lượt thứ 11 bị chặn trước khi gọi agent

    await principal.post('/agent/chat').send({ message: 'xin chào' }).expect(201);
  });

  it('webhook Telegram không bị giới hạn chung (đã có secret token)', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 8; i++) {
      const res = await http.post('/telegram/webhook').send({ update_id: i });
      expect(res.status).toBe(401); // sai secret chứ không phải 429
    }
  });
});
