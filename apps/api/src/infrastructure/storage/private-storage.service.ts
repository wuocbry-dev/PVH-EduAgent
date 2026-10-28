import { LIBRARY_READ_URL_TTL_SEC } from '@pvh/shared';
import type { PresignedUpload, PresignInput } from './storage.service.js';

export interface PresignGetInput {
  id: string; // id tài liệu (driver local ghép vào đường dẫn đọc)
  key: string;
  mimeType: string;
  // true = tải về (Content-Disposition: attachment), false = đọc/nghe/xem trong trang.
  download: boolean;
  filename: string; // tên gợi ý khi tải về (đã bỏ ký tự lạ), không dùng làm khoá
}

export interface PresignedRead {
  url: string; // tuyệt đối (R2) hoặc tương đối so với địa chỉ API (local)
  expiresAt: Date;
}

export const READ_TTL_SEC = LIBRARY_READ_URL_TTL_SEC;

// KHO RIÊNG TƯ (thư viện số, bước 21): khác StorageService ở chỗ KHÔNG có URL công khai. File chỉ đọc được qua URL ký
// sẵn hết hạn sau READ_TTL_SEC, do service cấp sau khi đã kiểm tra quyền của người xem. URL ký sẵn không bao giờ được ghi
// vào log, audit_logs hay CSDL.
export abstract class PrivateStorageService {
  abstract readonly driver: 'local' | 'r2';

  abstract presignPut(input: PresignInput): Promise<PresignedUpload>;

  abstract presignGet(input: PresignGetInput): Promise<PresignedRead>;

  abstract head(key: string): Promise<{ size: number } | null>;

  abstract readHead(key: string, bytes: number): Promise<Buffer | null>;

  abstract delete(key: string): Promise<void>;

  // Bước 26: kiểm tra kho còn hoạt động (không ghi gì) và đo dung lượng đã dùng (byte).
  abstract ping(): Promise<void>;
  abstract usageBytes(): Promise<number>;
}

// Tên file an toàn cho Content-Disposition (chỉ ASCII; tên tiếng Việt đầy đủ đi qua filename*).
export function contentDisposition(download: boolean, filename: string): string {
  if (!download) return 'inline';
  const ascii = filename.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\/;]/g, '').trim() || 'tai-lieu';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
