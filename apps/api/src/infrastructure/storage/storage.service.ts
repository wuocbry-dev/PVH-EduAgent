import type { MediaKind } from '@pvh/shared';
import { kindOfKey } from './media-types.js';

export interface PresignInput {
  id: string;
  key: string;
  mimeType: string;
  size: number;
}

export interface PresignedUpload {
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export const PRESIGN_TTL_SEC = 10 * 60;

// Mọi file người dùng tải lên đều đi qua lớp này (R2 hoặc đĩa local): không ghi thẳng đĩa, không tự ghép URL.
export abstract class StorageService {
  abstract readonly driver: 'local' | 'r2';

  // URL để trình duyệt PUT file lên; có chữ ký, hết hạn sau PRESIGN_TTL_SEC, ràng buộc loại và kích thước.
  abstract presignPut(input: PresignInput): Promise<PresignedUpload>;

  // Kích thước object; null nếu chưa có.
  abstract head(key: string): Promise<{ size: number } | null>;

  // Đọc tối đa `bytes` byte đầu của object (để nhận dạng loại); null nếu chưa có.
  abstract readHead(key: string, bytes: number): Promise<Buffer | null>;

  // Tải lên từ phía server (vd. bot Telegram); người gọi phải tự kiểm tra loại và dung lượng trước.
  abstract putObject(key: string, body: Buffer, mimeType: string): Promise<void>;

  // Xoá object; không lỗi nếu không tồn tại.
  abstract delete(key: string): Promise<void>;

  // URL công khai: đầy đủ (R2) hoặc đường dẫn tương đối so với API (local).
  abstract publicUrl(key: string): string;

  // URL tuyệt đối để nhúng vào nội dung bài viết (HTML do web hiển thị ở origin khác): R2 = URL công khai của bucket,
  // local = địa chỉ API + /api + đường dẫn tương đối.
  abstract contentUrl(key: string): string;

  // Ngược lại với publicUrl: nhận một URL (tuyệt đối hoặc tương đối) và trả khoá nếu nó trỏ tới kho của hệ thống.
  abstract keyFromUrl(url: string): string | null;

  // Loại media nếu URL là của hệ thống, ngược lại null (dùng khi lọc nội dung bài viết).
  mediaKindOfUrl(url: string): MediaKind | null {
    const key = this.keyFromUrl(url);
    return key ? kindOfKey(key) : null;
  }
}
