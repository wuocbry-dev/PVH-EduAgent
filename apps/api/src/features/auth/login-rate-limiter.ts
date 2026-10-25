import { Injectable } from '@nestjs/common';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';

const WINDOW_SEC = 60;
const MAX_FAILURES = 5;
const NAME = 'login';

// Chặn tạm thời khi đăng nhập sai quá 5 lần/phút theo cặp IP + email (đếm trong Redis, dự phòng bộ nhớ).
@Injectable()
export class LoginRateLimiter {
  constructor(private readonly limits: RateLimitService) {}

  // Số giây phải chờ nếu đang bị chặn, ngược lại 0.
  async retryAfterSeconds(ip: string, email: string): Promise<number> {
    const { count, retryAfterSec } = await this.limits.peek(NAME, this.key(ip, email));
    return count >= MAX_FAILURES ? Math.max(1, retryAfterSec) : 0;
  }

  async recordFailure(ip: string, email: string): Promise<void> {
    await this.limits.increment(NAME, this.key(ip, email), WINDOW_SEC);
  }

  async reset(ip: string, email: string): Promise<void> {
    await this.limits.reset(NAME, this.key(ip, email));
  }

  private key(ip: string, email: string): string {
    return `${ip}|${email.toLowerCase()}`;
  }
}
