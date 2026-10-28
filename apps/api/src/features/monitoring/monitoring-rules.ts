import { createHash } from 'node:crypto';
import { HEALTH_DEGRADED_MS, type HealthStatus } from '@pvh/shared';

// Hàm thuần của trung tâm giám sát (bước 26): làm sạch thông điệp lỗi, dấu vân tay, chuyển trạng thái dịch vụ.

const MAX_MESSAGE = 300;

// Thông điệp lỗi chỉ giữ phần mô tả: bỏ mọi thứ có thể là bí mật hay dữ liệu người dùng
// (URL kể cả chuỗi kết nối CSDL có mật khẩu, query ký sẵn, JWT, token bot, email, chuỗi dài giống khoá).
export function sanitizeErrorMessage(message: string): string {
  const firstLine = message.split('\n')[0] ?? '';
  return (
    firstLine
      .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
      .replace(/\beyJ[\w-]+\.[\w-]+(\.[\w-]+)?/g, '<token>')
      .replace(/\b\d{6,}:[\w-]{20,}/g, '<token>')
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '<email>')
      .replace(/[?&][\w-]*(token|signature|credential|key|secret|password)[\w-]*=[^\s&]*/gi, '<query>')
      .replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, '<…>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_MESSAGE) || 'Lỗi không có mô tả'
  );
}

// Đường dẫn thực → mẫu route để gom nhóm: id số, uuid, chuỗi hex dài thành ":id"; bỏ query.
export function routePattern(method: string, path: string): string {
  const clean = (path.split('?')[0] ?? '')
    .split('/')
    .map((part) =>
      /^\d+$/.test(part) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part) || /^[0-9a-f]{16,}$/i.test(part)
        ? ':id'
        : part,
    )
    .join('/');
  return `${method.toUpperCase()} ${clean || '/'}`.slice(0, 200);
}

// Dấu vân tay của một nhóm lỗi: nguồn + route + mã + thông điệp đã bỏ số (lỗi giống nhau khác id vẫn chung nhóm).
export function errorFingerprint(source: 'HTTP' | 'JOB', route: string, statusCode: number | null, message: string): string {
  const normalized = message.replace(/\d+/g, '#');
  return createHash('sha256').update(`${source}|${route}|${statusCode ?? ''}|${normalized}`).digest('hex');
}

// Trạng thái từ kết quả kiểm tra: lỗi → DOWN; chậm quá ngưỡng → DEGRADED.
export function statusFromProbe(ok: boolean, latencyMs: number, degradedMs = HEALTH_DEGRADED_MS): HealthStatus {
  if (!ok) return 'DOWN';
  return latencyMs > degradedMs ? 'DEGRADED' : 'OK';
}

export type HealthTransition = 'down' | 'recovered' | null;

// Chỉ hai sự kiện sinh cảnh báo: vừa ngừng (khác DOWN → DOWN) và vừa hồi phục (DOWN → OK/DEGRADED).
// OFF (không dùng) không bao giờ báo; trạng thái không đổi không báo lại.
export function healthTransition(previous: HealthStatus | null, current: HealthStatus): HealthTransition {
  if (current === 'DOWN' && previous !== 'DOWN') return 'down';
  if (previous === 'DOWN' && (current === 'OK' || current === 'DEGRADED')) return 'recovered';
  return null;
}

// Vượt ngưỡng đúng một lần trong cửa sổ đếm (lần đếm thứ `threshold`), để mỗi đợt chỉ báo một tin.
export function crossesThreshold(count: number, threshold: number): boolean {
  return threshold > 0 && count === threshold;
}

export function storagePercent(totalBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) return 0;
  return Math.round((totalBytes / quotaBytes) * 1000) / 10;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
