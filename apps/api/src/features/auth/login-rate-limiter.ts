import { Injectable } from '@nestjs/common';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';

const WINDOW_SEC = 60;
export const LOGIN_PAIR_MAX_FAILURES = 5;
// Bước 23: mã học sinh có quy luật nên còn chặn theo IP (mọi tài khoản cộng lại), chống thử một mật khẩu
// lần lượt trên nhiều mã học sinh. Đăng nhập đúng không xoá bộ đếm này.
export const LOGIN_IP_WINDOW_SEC = 10 * 60;
export const LOGIN_IP_MAX_FAILURES = 30;
const NAME = 'login';

// Chặn tạm thời khi đăng nhập sai quá 5 lần/phút theo cặp IP + email/mã đăng nhập, hoặc quá 30 lần/10 phút
// theo IP (đếm trong Redis, dự phòng bộ nhớ). Khoá theo IP là `ip`, theo cặp là `ip|tên đăng nhập`.
@Injectable()
export class LoginRateLimiter {
  constructor(private readonly limits: RateLimitService) {}

  // Số giây phải chờ nếu đang bị chặn, ngược lại 0.
  async retryAfterSeconds(ip: string, email: string): Promise<number> {
    const [pair, byIp] = await Promise.all([this.limits.peek(NAME, this.key(ip, email)), this.limits.peek(NAME, ip)]);
    const waits = [
      pair.count >= LOGIN_PAIR_MAX_FAILURES ? Math.max(1, pair.retryAfterSec) : 0,
      byIp.count >= LOGIN_IP_MAX_FAILURES ? Math.max(1, byIp.retryAfterSec) : 0,
    ];
    return Math.max(...waits);
  }

  async recordFailure(ip: string, email: string): Promise<void> {
    await Promise.all([
      this.limits.increment(NAME, this.key(ip, email), WINDOW_SEC),
      this.limits.increment(NAME, ip, LOGIN_IP_WINDOW_SEC),
    ]);
  }

  async reset(ip: string, email: string): Promise<void> {
    await this.limits.reset(NAME, this.key(ip, email));
  }

  private key(ip: string, email: string): string {
    return `${ip}|${email.toLowerCase()}`;
  }
}
