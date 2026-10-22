import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;

interface Bucket {
  failures: number;
  resetAt: number;
}

// Chặn tạm thời khi đăng nhập sai quá 5 lần/phút theo cặp IP + email.
// Lưu trong bộ nhớ: đủ cho một tiến trình API; chạy nhiều instance thì chuyển sang Redis.
@Injectable()
export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  // Số giây phải chờ nếu đang bị chặn, ngược lại 0.
  retryAfterSeconds(ip: string, email: string): number {
    const bucket = this.active(this.key(ip, email));
    if (!bucket || bucket.failures < MAX_FAILURES) return 0;
    return Math.ceil((bucket.resetAt - Date.now()) / 1000);
  }

  recordFailure(ip: string, email: string): void {
    const key = this.key(ip, email);
    const bucket = this.active(key);
    if (bucket) bucket.failures++;
    else
      this.buckets.set(key, { failures: 1, resetAt: Date.now() + WINDOW_MS });
  }

  reset(ip: string, email: string): void {
    this.buckets.delete(this.key(ip, email));
  }

  private key(ip: string, email: string): string {
    return `${ip}|${email}`;
  }

  private active(key: string): Bucket | undefined {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt <= Date.now()) {
      this.buckets.delete(key);
      return undefined;
    }
    return bucket;
  }
}
