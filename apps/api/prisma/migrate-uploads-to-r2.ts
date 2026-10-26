// Chuyển ảnh đã tải lên trước đây (thư mục uploads/) sang Cloudflare R2. Chạy một lần sau khi cấu hình R2:
//   pnpm --filter api media:migrate --dry-run   (chỉ in ra việc sẽ làm, không đổi gì)
//   pnpm --filter api media:migrate             (đẩy file lên R2, đổi media.url và URL trong bài viết)
// Chạy lại nhiều lần vẫn an toàn.
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { migrateUploads } from '../src/features/media/migrate-uploads.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPgAdapter } from '../src/infrastructure/database/pg-adapter.js';
import { R2StorageService } from '../src/infrastructure/storage/r2-storage.service.js';
import { resolve } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const env = process.env;
const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'].filter(
  (k) => !env[k],
);
if (missing.length > 0) {
  console.error(`Thiếu biến môi trường R2 trong apps/api/.env: ${missing.join(', ')}`);
  process.exit(1);
}

const storage = new R2StorageService(
  new ConfigService({
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: env.R2_BUCKET,
    R2_PUBLIC_BASE_URL: env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, ''),
  }) as never,
);
const prisma = new PrismaClient({ adapter: createPgAdapter(env.DATABASE_URL) });

try {
  console.log(dryRun ? '== CHẠY THỬ (--dry-run): không đổi gì ==' : '== CHUYỂN DỮ LIỆU THẬT ==');
  const report = await migrateUploads({
    prisma,
    storage,
    uploadDir: resolve(process.cwd(), env.UPLOAD_DIR ?? 'uploads'),
    dryRun,
    log: console.log,
  });
  console.log(
    `\nKết quả: ${report.uploaded} file ${dryRun ? 'sẽ đẩy' : 'đã đẩy'}, ${report.mediaUpdated} media và ${report.postsUpdated} bài viết ${dryRun ? 'sẽ đổi' : 'đã đổi'} URL, ${report.missing.length} file thiếu.`,
  );
  if (report.missing.length > 0) {
    console.log(`File thiếu trên đĩa (các URL này giữ nguyên):\n${report.missing.map((k) => `  - ${k}`).join('\n')}`);
    process.exitCode = 2;
  }
} finally {
  await prisma.$disconnect();
}
