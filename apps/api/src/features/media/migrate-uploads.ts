import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { STORAGE_KEY } from '../../infrastructure/storage/media-types.js';
import type { StorageService } from '../../infrastructure/storage/storage.service.js';

export interface MigrateOptions {
  prisma: PrismaClient;
  // Kho đích (R2). Chỉ cần putObject và publicUrl.
  storage: Pick<StorageService, 'putObject' | 'publicUrl' | 'head'>;
  // Thư mục uploads/ cũ.
  uploadDir: string;
  dryRun: boolean;
  log?: (message: string) => void;
}

export interface MigrateReport {
  // Số file đã (hoặc sẽ, khi --dry-run) đẩy lên kho đích.
  uploaded: number;
  // File có bản ghi media nhưng không còn trên đĩa (bỏ qua, báo để người dùng xử lý).
  missing: string[];
  // Số bản ghi media / bài viết đã (hoặc sẽ) cập nhật URL.
  mediaUpdated: number;
  postsUpdated: number;
}

// Mọi dạng URL cũ của một file: /media/files/<khoá>, <địa chỉ API>/media/files/<khoá> (có hoặc không /api).
const oldUrlPattern = (key: string) =>
  new RegExp(`(?:https?://[^\\s"'<>]*?)?(?:/api)?/media/files/${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9A-Za-z._-])`, 'g');

// Chạy một lần khi chuyển từ STORAGE_DRIVER=local sang r2; chạy lại không làm hỏng dữ liệu (file đã có trên kho
// đích được bỏ qua, URL đã đổi không bị đổi lần nữa):
// 1. Mỗi media còn URL cũ (/media/files/…): đẩy file trong uploads/ lên kho đích với đúng khoá, đổi media.url.
// 2. Mọi bài viết: thay URL cũ của các file đó trong posts.content và posts.thumbnail_url bằng URL mới.
export async function migrateUploads(options: MigrateOptions): Promise<MigrateReport> {
  const { prisma, storage, dryRun } = options;
  const log = options.log ?? (() => undefined);
  const report: MigrateReport = { uploaded: 0, missing: [], mediaUpdated: 0, postsUpdated: 0 };

  const rows = await prisma.media.findMany({ where: { status: 'READY' }, orderBy: { id: 'asc' } });
  const newUrlOf = new Map<string, string>(); // khoá → URL mới, cho các media đã/sẽ ở kho đích
  for (const media of rows) {
    if (!STORAGE_KEY.test(media.storageKey)) continue;
    const target = storage.publicUrl(media.storageKey);
    if (media.url === target) {
      newUrlOf.set(media.storageKey, target); // đã chuyển ở lần chạy trước
      continue;
    }

    let body: Buffer;
    try {
      body = await readFile(resolve(options.uploadDir, media.storageKey));
    } catch {
      // Có thể file đã được đẩy lên kho đích rồi nhưng bản ghi chưa kịp đổi (lần chạy trước bị ngắt).
      if (await storage.head(media.storageKey)) body = Buffer.alloc(0);
      else {
        report.missing.push(media.storageKey);
        log(`THIẾU  ${media.storageKey} (không có trong ${options.uploadDir})`);
        continue;
      }
    }

    if (body.length > 0 && !(await storage.head(media.storageKey))) {
      log(`${dryRun ? 'SẼ ĐẨY' : 'ĐẨY   '} ${media.storageKey} (${body.length} byte)`);
      if (!dryRun) await storage.putObject(media.storageKey, body, media.mimeType);
      report.uploaded++;
    }
    log(`${dryRun ? 'SẼ ĐỔI' : 'ĐỔI   '} media #${media.id}: ${media.url} → ${target}`);
    if (!dryRun) await prisma.media.update({ where: { id: media.id }, data: { url: target } });
    newUrlOf.set(media.storageKey, target);
    report.mediaUpdated++;
  }

  const posts = await prisma.post.findMany({
    where: { OR: [{ content: { contains: '/media/files/' } }, { thumbnailUrl: { contains: '/media/files/' } }] },
    select: { id: true, content: true, thumbnailUrl: true },
  });
  for (const post of posts) {
    let content = post.content;
    let thumbnailUrl = post.thumbnailUrl;
    for (const [key, target] of newUrlOf) {
      const pattern = oldUrlPattern(key);
      content = content.replace(pattern, target);
      if (thumbnailUrl) thumbnailUrl = thumbnailUrl.replace(pattern, target);
    }
    if (content === post.content && thumbnailUrl === post.thumbnailUrl) continue;
    log(`${dryRun ? 'SẼ SỬA' : 'SỬA   '} bài #${post.id}`);
    if (!dryRun) await prisma.post.update({ where: { id: post.id }, data: { content, thumbnailUrl } });
    report.postsUpdated++;
  }
  return report;
}
