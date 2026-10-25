import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';

export type CacheTag =
  | 'posts'
  | 'categories'
  | 'admission'
  | 'settings'
  | 'events';

// Báo cho website (Next.js) làm mới cache của trang công khai khi nội dung đổi (đăng/gỡ bài, sửa chuyên mục...).
// Không bao giờ ném lỗi: web tắt hoặc chưa cấu hình thì trang tự làm mới theo cacheLife.
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);
  private readonly url: string;
  private readonly secret?: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = new URL(
      '/api/revalidate',
      config.get('WEB_ORIGIN', { infer: true }),
    ).toString();
    this.secret = config.get('REVALIDATE_SECRET', { infer: true });
  }

  async revalidate(...tags: CacheTag[]): Promise<void> {
    if (!this.secret) return;
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.secret,
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        this.logger.warn(`Web trả ${res.status} khi revalidate ${tags.join(', ')}`);
      }
    } catch (err) {
      this.logger.warn(
        `Không gọi được web để revalidate ${tags.join(', ')}: ${String(err)}`,
      );
    }
  }
}
