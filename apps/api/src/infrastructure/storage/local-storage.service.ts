import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { STORAGE_KEY } from './media-types.js';
import { PRESIGN_TTL_SEC, StorageService, type PresignedUpload, type PresignInput } from './storage.service.js';

export interface LocalUploadClaims {
  id: string;
  key: string;
  mimeType: string;
  size: number;
  exp: number; // giây kể từ epoch
}

const FILES_PREFIX = '/media/files/';

// Driver local: lưu vào thư mục UPLOAD_DIR (dev không có Cloudflare, e2e). Luồng presign giống R2: uploadUrl trỏ
// tới PUT /media/local-upload/:id của chính API, xác thực bằng token HMAC (không cần đăng nhập, như URL ký sẵn của R2).
@Injectable()
export class LocalStorageService extends StorageService {
  readonly driver = 'local' as const;
  readonly dir: string;
  private readonly secret: string;
  private readonly origins: string[];
  private readonly apiBase: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.dir = resolve(process.cwd(), config.get('UPLOAD_DIR', { infer: true }));
    // Khác khoá ký JWT một "ngữ cảnh" để token tải lên không dùng chéo được.
    this.secret = `media-local-upload:${config.get('JWT_ACCESS_SECRET', { infer: true })}`;
    const apiUrl =
      config.get('API_PUBLIC_URL', { infer: true }) ?? `http://localhost:${config.get('API_PORT', { infer: true })}`;
    this.apiBase = apiUrl.replace(/\/+$/, '');
    this.origins = [apiUrl, config.get('WEB_ORIGIN', { infer: true })].map((u) => new URL(u).origin);
  }

  async presignPut(input: PresignInput): Promise<PresignedUpload> {
    const expiresAt = new Date(Date.now() + PRESIGN_TTL_SEC * 1000);
    const token = this.signToken({
      id: input.id,
      key: input.key,
      mimeType: input.mimeType,
      size: input.size,
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    return {
      // Đường dẫn tương đối so với địa chỉ API; trình duyệt ghép với NEXT_PUBLIC_API_URL.
      uploadUrl: `/media/local-upload/${input.id}?token=${token}`,
      headers: { 'Content-Type': input.mimeType },
      expiresAt,
    };
  }

  signToken(claims: LocalUploadClaims): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${this.mac(payload)}`;
  }

  // Trả claims nếu token đúng chữ ký và chưa hết hạn, ngược lại null.
  verifyToken(token: string): LocalUploadClaims | null {
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(this.mac(payload));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LocalUploadClaims;
      if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
      if (!STORAGE_KEY.test(claims.key)) return null;
      return claims;
    } catch {
      return null;
    }
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      return { size: (await stat(this.path(key))).size };
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer | null> {
    let handle;
    try {
      handle = await open(this.path(key), 'r');
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } catch {
      return null;
    } finally {
      await handle?.close();
    }
  }

  async putObject(key: string, body: Buffer, _mimeType?: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), body);
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${FILES_PREFIX}${key}`;
  }

  contentUrl(key: string): string {
    return `${this.apiBase}/api${FILES_PREFIX}${key}`;
  }

  keyFromUrl(url: string): string | null {
    let path = url;
    if (!url.startsWith('/')) {
      try {
        const u = new URL(url);
        if (!this.origins.includes(u.origin)) return null;
        // Địa chỉ tuyệt đối do web ghép từ NEXT_PUBLIC_API_URL nên có tiền tố /api của API.
        path = u.pathname.replace(/^\/api(?=\/)/, '');
      } catch {
        return null;
      }
    }
    if (!path.startsWith(FILES_PREFIX)) return null;
    const key = path.slice(FILES_PREFIX.length);
    return STORAGE_KEY.test(key) ? key : null;
  }

  // Đường dẫn file trong thư mục lưu; khoá phải đúng định dạng đã sinh (chặn ../).
  path(key: string): string {
    if (!STORAGE_KEY.test(key)) throw new Error('Khoá file không hợp lệ');
    return resolve(this.dir, key);
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
