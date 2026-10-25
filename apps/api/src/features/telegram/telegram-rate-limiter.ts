import { Injectable } from '@nestjs/common';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';

// Giới hạn tần suất của bot Telegram (theo chat_id hoặc tài khoản) trên RateLimitService dùng chung.
@Injectable()
export class TelegramRateLimiter {
  constructor(private readonly limits: RateLimitService) {}

  // true nếu còn trong hạn mức (lần này được tính), false nếu đã vượt.
  async hit(name: string, id: string, limit: number, windowSec: number): Promise<boolean> {
    return (await this.increment(name, id, windowSec)) <= limit;
  }

  // Tính thêm một lần, trả về số lần trong cửa sổ hiện tại.
  async increment(name: string, id: string, windowSec: number): Promise<number> {
    return (await this.limits.increment(`tg-${name}`, id, windowSec)).count;
  }

  // Đã vượt hạn mức chưa (không tính thêm lần nào).
  async exceeded(name: string, id: string, limit: number): Promise<boolean> {
    return (await this.limits.peek(`tg-${name}`, id)).count >= limit;
  }

  reset(name: string, id: string): Promise<void> {
    return this.limits.reset(`tg-${name}`, id);
  }
}
