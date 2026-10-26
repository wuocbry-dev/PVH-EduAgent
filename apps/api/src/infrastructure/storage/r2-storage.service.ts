import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { STORAGE_KEY } from './media-types.js';
import { PRESIGN_TTL_SEC, StorageService, type PresignedUpload, type PresignInput } from './storage.service.js';

// Driver Cloudflare R2 (API tương thích S3). Bí mật chỉ nằm trong S3Client, không bao giờ ghi log hay trả ra API.
@Injectable()
export class R2StorageService extends StorageService {
  readonly driver = 'r2' as const;
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    const bucket = config.get('R2_BUCKET', { infer: true });
    const publicBase = config.get('R2_PUBLIC_BASE_URL', { infer: true });
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      throw new Error(
        'STORAGE_DRIVER=r2 cần đủ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL',
      );
    }
    this.bucket = bucket;
    this.publicBase = publicBase;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      // SDK mới tự thêm checksum vào PUT; trình duyệt không gửi được nên chỉ tính khi bắt buộc.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async presignPut(input: PresignInput): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.mimeType,
      ContentLength: input.size,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_TTL_SEC,
      // Ký cả loại và kích thước: PUT sai một trong hai bị R2 từ chối.
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      uploadUrl,
      headers: { 'Content-Type': input.mimeType },
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000),
    };
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer | null> {
    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      );
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : Buffer.alloc(0);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async putObject(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mimeType, ContentLength: body.length }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  contentUrl(key: string): string {
    return this.publicUrl(key);
  }

  keyFromUrl(url: string): string | null {
    if (!url.startsWith(`${this.publicBase}/`)) return null;
    const key = url.slice(this.publicBase.length + 1);
    return STORAGE_KEY.test(key) ? key : null;
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}
