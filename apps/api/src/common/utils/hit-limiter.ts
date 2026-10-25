// Giới hạn số lần một khóa (vd. IP) được làm một việc trong một khoảng thời gian (cửa sổ cố định).
// Lưu trong bộ nhớ: đủ cho một tiến trình API; chạy nhiều instance thì chuyển sang Redis (bước 10).
export class HitLimiter {
  private readonly buckets = new Map<string, { hits: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  // Ghi nhận một lần; trả về số giây phải chờ nếu đã vượt giới hạn, ngược lại 0.
  hit(key: string): number {
    const now = Date.now();
    this.prune(now);
    const bucket = this.buckets.get(key);
    if (!bucket) {
      this.buckets.set(key, { hits: 1, resetAt: now + this.windowMs });
      return 0;
    }
    if (bucket.hits >= this.max) {
      return Math.ceil((bucket.resetAt - now) / 1000);
    }
    bucket.hits++;
    return 0;
  }

  // Dọn các khóa đã hết hạn để Map không phình mãi.
  private prune(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
