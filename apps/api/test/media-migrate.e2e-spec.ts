// Bước 11 – script chuyển ảnh cũ (uploads/) sang kho đích. Dùng kho giả trong bộ nhớ: không gọi Cloudflare.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateUploads } from './../src/features/media/migrate-uploads.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { createPgAdapter } from './../src/infrastructure/database/pg-adapter.js';
import { PNG } from './media-helper.js';

const TAG = `MIG-${Date.now()}`;
const CDN = 'https://cdn.pvh.test';

describe('Chuyển ảnh cũ sang kho đích (bước 11, e2e)', () => {
  const prisma = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
  const dir = mkdtempSync(join(tmpdir(), 'pvh-migrate-'));
  const objects = new Map<string, Buffer>();
  const storage = {
    publicUrl: (key: string) => `${CDN}/${key}`,
    head: async (key: string) => (objects.has(key) ? { size: objects.get(key)!.length } : null),
    putObject: async (key: string, body: Buffer) => void objects.set(key, body),
  };
  const run = (dryRun: boolean) => migrateUploads({ prisma, storage, uploadDir: dir, dryRun });

  let userId: bigint;
  const keyA = `${randomUUID()}.png`;
  const keyB = `${randomUUID()}.png`;
  const keyGone = `${randomUUID()}.png`; // có bản ghi nhưng mất file trên đĩa
  const ids: bigint[] = [];
  let postId: bigint;
  let thumbPostId: bigint;

  beforeAll(async () => {
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'gv.toan@pvh.edu.vn' } })).id;
    writeFileSync(join(dir, keyA), PNG);
    writeFileSync(join(dir, keyB), PNG);
    for (const key of [keyA, keyB, keyGone]) {
      const m = await prisma.media.create({
        data: { url: `/media/files/${key}`, storageKey: key, status: 'READY', kind: 'IMAGE', mimeType: 'image/png', size: PNG.length, uploadedBy: userId },
      });
      ids.push(m.id);
    }
    postId = (
      await prisma.post.create({
        data: {
          title: `${TAG} bài`,
          slug: `${TAG}-bai`.toLowerCase(),
          authorId: userId,
          content:
            `<p>a</p><img src="http://localhost:4000/api/media/files/${keyA}" alt="x">` +
            `<img src="/media/files/${keyA}"><img src="http://localhost:4000/api/media/files/${keyB}">` +
            `<img src="http://localhost:4000/api/media/files/${keyGone}"><img src="https://khac.example/anh.png">`,
        },
      })
    ).id;
    thumbPostId = (
      await prisma.post.create({
        data: { title: `${TAG} thumb`, slug: `${TAG}-thumb`.toLowerCase(), authorId: userId, content: '<p>b</p>', thumbnailUrl: `/media/files/${keyB}` },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.media.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it('--dry-run chỉ báo cáo, không đổi dữ liệu và không đẩy file', async () => {
    const report = await run(true);
    expect(report).toMatchObject({ uploaded: 2, mediaUpdated: 2, missing: expect.arrayContaining([keyGone]) });
    expect(report.postsUpdated).toBeGreaterThanOrEqual(2);
    expect(objects.size).toBe(0);
    expect((await prisma.media.findUniqueOrThrow({ where: { id: ids[0] } })).url).toBe(`/media/files/${keyA}`);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: postId } })).content).toContain('/media/files/');
  });

  it('chạy thật: đẩy file, đổi media.url, thay URL cũ trong content và thumbnail (kể cả dạng tuyệt đối có /api)', async () => {
    const report = await run(false);
    expect(report).toMatchObject({ uploaded: 2, mediaUpdated: 2, missing: expect.arrayContaining([keyGone]) });
    expect([...objects.keys()].sort()).toEqual([keyA, keyB].sort());
    expect(objects.get(keyA)!.equals(PNG)).toBe(true);

    expect((await prisma.media.findUniqueOrThrow({ where: { id: ids[0] } })).url).toBe(`${CDN}/${keyA}`);
    expect((await prisma.media.findUniqueOrThrow({ where: { id: ids[2] } })).url).toBe(`/media/files/${keyGone}`); // mất file: giữ nguyên

    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post.content).toContain(`<img src="${CDN}/${keyA}" alt="x">`);
    expect(post.content).toContain(`<img src="${CDN}/${keyB}">`);
    expect(post.content.split(`${CDN}/${keyA}`)).toHaveLength(3); // cả dạng tuyệt đối lẫn tương đối
    expect(post.content).toContain('https://khac.example/anh.png'); // ảnh ngoài hệ thống giữ nguyên
    expect(post.content).toContain(`/media/files/${keyGone}`); // file mất vẫn trỏ URL cũ để người dùng biết cần xử lý
    expect(post.content).not.toContain(`/media/files/${keyA}`);
    expect(post.content).not.toContain(`/media/files/${keyB}`);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: thumbPostId } })).thumbnailUrl).toBe(`${CDN}/${keyB}`);
  });

  it('chạy lại không làm hỏng dữ liệu (không đẩy lại, không đổi lại)', async () => {
    const before = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    const report = await run(false);
    expect(report).toMatchObject({ uploaded: 0, mediaUpdated: 0, postsUpdated: 0, missing: expect.arrayContaining([keyGone]) });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: postId } })).content).toBe(before.content);
  });

  it('lần chạy trước bị ngắt giữa chừng (file đã lên kho nhưng media chưa đổi) vẫn hoàn tất được', async () => {
    await prisma.media.update({ where: { id: ids[0] }, data: { url: `/media/files/${keyA}` } });
    rmSync(join(dir, keyA));
    const report = await run(false);
    expect(report).toMatchObject({ uploaded: 0, mediaUpdated: 1 });
    expect((await prisma.media.findUniqueOrThrow({ where: { id: ids[0] } })).url).toBe(`${CDN}/${keyA}`);
  });
});
