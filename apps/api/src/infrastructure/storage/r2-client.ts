import { S3Client } from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';

// S3Client trỏ tới Cloudflare R2 của tài khoản; dùng chung cho bucket công khai và bucket riêng tư.
// Bí mật chỉ nằm trong client, không bao giờ ghi log hay trả ra API.
export function createR2Client(config: ConfigService<Env, true>): S3Client {
  const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
  const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
  const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('STORAGE_DRIVER=r2 cần đủ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // SDK mới tự thêm checksum vào PUT; trình duyệt không gửi được nên chỉ tính khi bắt buộc.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

export function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}
