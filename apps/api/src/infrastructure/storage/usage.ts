import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HeadBucketCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';

// Bước 26: kiểm tra kho còn hoạt động và đo dung lượng đã dùng. Không ghi gì vào kho.

// R2: HEAD bucket (không tốn phí lưu trữ, không đọc object).
export async function r2Ping(s3: S3Client, bucket: string): Promise<void> {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
}

// R2: cộng kích thước mọi object (ListObjectsV2, 1000 object mỗi lượt). Chạy mỗi giờ, không chạy theo phút.
export async function r2UsageBytes(s3: S3Client, bucket: string): Promise<number> {
  let total = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const object of page.Contents ?? []) total += object.Size ?? 0;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return total;
}

// Thư mục local: chỉ cần tồn tại (chưa có file nào thì chưa tạo thư mục, vẫn coi là bình thường).
export async function localPing(dir: string): Promise<void> {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) throw new Error('Đường dẫn kho không phải thư mục');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function localUsageBytes(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await localUsageBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}
