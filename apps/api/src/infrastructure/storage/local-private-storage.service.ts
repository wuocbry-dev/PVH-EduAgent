import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { PRIVATE_KEY } from './private-types.js';
import { PrivateStorageService, READ_TTL_SEC, type PresignedRead, type PresignGetInput } from './private-storage.service.js';
import { PRESIGN_TTL_SEC, type PresignedUpload, type PresignInput } from './storage.service.js';
import { localPing, localUsageBytes } from './usage.js';

// Token của driver local, thay cho chữ ký của R2: `put` để trình duyệt PUT file lên, `get` để đọc (hết hạn ngắn).
export interface PrivateTokenClaims {
  op: 'put' | 'get';
  id: string;
  key: string;
  mimeType: string;
  size?: number; // put
  download?: boolean; // get
  filename?: string; // get
  exp: number; // giây kể từ epoch
}

// Driver local của kho riêng tư: thư mục PRIVATE_UPLOAD_DIR, KHÔNG được phục vụ công khai. Đọc qua
// GET /library/files/:id?token= (token HMAC hết hạn ngắn, hỗ trợ Range); tải lên qua PUT /library/local-upload/:id?token=.
export class LocalPrivateStorageService extends PrivateStorageService {
  readonly driver = 'local' as const;
  readonly dir: string;
  private readonly secret: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.dir = resolve(process.cwd(), config.get('PRIVATE_UPLOAD_DIR', { infer: true }));
    // Ngữ cảnh khác khoá JWT và token tải lên của kho công khai: không dùng chéo được.
    this.secret = `library-private:${config.get('JWT_ACCESS_SECRET', { infer: true })}`;
  }

  async presignPut(input: PresignInput): Promise<PresignedUpload> {
    const expiresAt = new Date(Date.now() + PRESIGN_TTL_SEC * 1000);
    const token = this.signToken({
      op: 'put',
      id: input.id,
      key: input.key,
      mimeType: input.mimeType,
      size: input.size,
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    return { uploadUrl: `/library/local-upload/${input.id}?token=${token}`, headers: { 'Content-Type': input.mimeType }, expiresAt };
  }

  async presignGet(input: PresignGetInput): Promise<PresignedRead> {
    const expiresAt = new Date(Date.now() + READ_TTL_SEC * 1000);
    const token = this.signToken({
      op: 'get',
      id: input.id,
      key: input.key,
      mimeType: input.mimeType,
      download: input.download,
      filename: input.filename,
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    return { url: `/library/files/${input.id}?token=${token}`, expiresAt };
  }

  signToken(claims: PrivateTokenClaims): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${this.mac(payload)}`;
  }

  // Trả claims nếu token đúng chữ ký, đúng thao tác và chưa hết hạn; ngược lại null.
  verifyToken(token: string, op: PrivateTokenClaims['op']): PrivateTokenClaims | null {
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(this.mac(payload));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PrivateTokenClaims;
      if (claims.op !== op || typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
      if (!PRIVATE_KEY.test(claims.key)) return null;
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

  async putObject(key: string, body: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), body);
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  // Đường dẫn file; khoá phải đúng định dạng đã sinh (chặn ../).
  path(key: string): string {
    if (!PRIVATE_KEY.test(key)) throw new Error('Khoá file không hợp lệ');
    return resolve(this.dir, key);
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  ping(): Promise<void> {
    return localPing(this.dir);
  }

  usageBytes(): Promise<number> {
    return localUsageBytes(this.dir);
  }
}
