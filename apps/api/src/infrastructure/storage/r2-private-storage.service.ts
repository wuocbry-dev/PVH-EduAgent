import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { createR2Client, isNotFound } from './r2-client.js';
import { r2Ping, r2UsageBytes } from './usage.js';
import {
  contentDisposition,
  PrivateStorageService,
  READ_TTL_SEC,
  type PresignedRead,
  type PresignGetInput,
} from './private-storage.service.js';
import { PRESIGN_TTL_SEC, type PresignedUpload, type PresignInput } from './storage.service.js';

// Driver R2 của kho riêng tư: bucket R2_PRIVATE_BUCKET không có địa chỉ công khai; đọc bằng URL GET ký sẵn hết hạn ngắn.
export class R2PrivateStorageService extends PrivateStorageService {
  readonly driver = 'r2' as const;
  private readonly s3: S3Client;

  constructor(
    config: ConfigService<Env, true>,
    private readonly bucket: string,
  ) {
    super();
    this.s3 = createR2Client(config);
  }

  async presignPut(input: PresignInput): Promise<PresignedUpload> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: input.key, ContentType: input.mimeType, ContentLength: input.size });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_TTL_SEC,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { uploadUrl, headers: { 'Content-Type': input.mimeType }, expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000) };
  }

  async presignGet(input: PresignGetInput): Promise<PresignedRead> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentType: input.mimeType,
      ResponseContentDisposition: contentDisposition(input.download, input.filename),
      ResponseCacheControl: 'private, no-store',
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn: READ_TTL_SEC });
    return { url, expiresAt: new Date(Date.now() + READ_TTL_SEC * 1000) };
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
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : Buffer.alloc(0);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  ping(): Promise<void> {
    return r2Ping(this.s3, this.bucket);
  }

  usageBytes(): Promise<number> {
    return r2UsageBytes(this.s3, this.bucket);
  }
}
