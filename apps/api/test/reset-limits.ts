import type { INestApplication } from '@nestjs/common';
import { RateLimitService } from './../src/infrastructure/rate-limit/rate-limit.service.js';

// Bộ đếm giới hạn tần suất nằm trong Redis nên tồn tại giữa các test (và các file test cùng một lần chạy).
// Test nào gửi liên hệ/đăng nhập sai nhiều lần phải xoá bộ đếm của IP loopback trước khi chạy.
export async function resetLimits(app: INestApplication, names: string[] = ['contact']): Promise<void> {
  const limits = app.get(RateLimitService);
  for (const name of names) {
    for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) await limits.reset(name, ip);
  }
}
