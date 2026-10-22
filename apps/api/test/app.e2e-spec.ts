// Cần PostgreSQL đã migrate + seed (pnpm --filter api db:migrate && pnpm --filter api db:seed).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

const TEACHER = 'gv.toan@pvh.edu.vn';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/system/health (GET) không cần đăng nhập, CSDL kết nối được', () => {
    return request(app.getHttpServer())
      .get('/system/health')
      .expect(200)
      .expect({ status: 'ok', database: 'ok' });
  });

  it('/posts (GET) chỉ trả bài đã đăng', async () => {
    const res = await request(app.getHttpServer()).get('/posts').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      res.body.every((p: { status: string }) => p.status === 'PUBLISHED'),
    ).toBe(true);
  });

  it('/tasks/deadlines (GET) giáo viên chỉ thấy việc của mình', async () => {
    const res = await request(app.getHttpServer())
      .get('/tasks/deadlines')
      .set('x-dev-user-email', TEACHER)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      res.body.every(
        (t: { assigneeName: string }) => t.assigneeName === 'Giáo viên Toán',
      ),
    ).toBe(true);
  });

  it('/system/status (GET) giáo viên bị từ chối (đọc quyền từ role_permissions)', () => {
    return request(app.getHttpServer())
      .get('/system/status')
      .set('x-dev-user-email', TEACHER)
      .expect(403);
  });

  it('tài khoản không tồn tại bị từ chối', () => {
    return request(app.getHttpServer())
      .get('/system/status')
      .set('x-dev-user-email', 'khong-co@pvh.edu.vn')
      .expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
