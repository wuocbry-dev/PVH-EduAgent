import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Giới hạn tần suất toàn API: đã đăng nhập thì tính theo tài khoản, chưa thì theo IP. Từng route chỉnh bằng @Throttle().
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override errorMessage = 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút';

  protected override getTracker(req: Record<string, any>): Promise<string> {
    const userId = (req.user as { id?: string } | undefined)?.id;
    return Promise.resolve(userId ? `user:${userId}` : `ip:${String(req.ip)}`);
  }
}
