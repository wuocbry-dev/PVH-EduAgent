import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { STORAGE_KEY } from './media-types.js';
import { createR2Client, isNotFound } from './r2-client.js';
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
    const bucket = config.get('R2_BUCKET', { infer: true });
    const publicBase = config.get('R2_PUBLIC_BASE_URL', { infer: true });
    if (!bucket || !publicBase) throw new Error('STORAGE_DRIVER=r2 cần đủ R2_BUCKET, R2_PUBLIC_BASE_URL');
    this.bucket = bucket;
    this.publicBase = publicBase;
    this.s3 = createR2Client(config);
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

