// F13 – ảnh/video: luồng presign → PUT → complete (driver local), kiểm tra loại thật, xoá, dọn bản ghi chờ.
// e2e luôn dùng driver local (vitest.config.e2e.ts); không bao giờ gọi Cloudflare R2.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { LocalStorageService } from './../src/infrastructure/storage/local-storage.service.js';
import { StorageService } from './../src/infrastructure/storage/storage.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { MediaService } from './../src/features/media/media.service.js';
import type { AuthUser } from './../src/common/types/auth-user.js';
import { MP4, PNG, WEBM, uploadMedia } from './media-helper.js';

const PASSWORD = 'Pvh@2026';
const EDITOR = 'bientap@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';

const uploadDir = mkdtempSync(join(tmpdir(), 'pvh-uploads-'));
process.env.UPLOAD_DIR = uploadDir;

const TAG = `F13M-${Date.now()}`;
const OTHER = `${TAG}.gv@test.pvh.edu.vn`.toLowerCase(); // giáo viên thứ hai: có post:create, không có post:approve
const NOBODY = `${TAG}.hs@test.pvh.edu.vn`.toLowerCase(); // học sinh: không có quyền nào
const STARTED = new Date();

describe('Ảnh và video: tải lên, kiểm tra, xoá (F13, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: LocalStorageService;

  beforeAll(async () => {
    // Import sau khi đặt UPLOAD_DIR: ConfigModule đọc biến môi trường ngay khi AppModule được nạp.
    const { AppModule } = await import('./../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService) as LocalStorageService;
    expect(storage.driver).toBe('local');

    const seed = await prisma.user.findUniqueOrThrow({ where: { email: TEACHER } });
    for (const [email, code] of [
      [OTHER, 'TEACHER'],
      [NOBODY, 'STUDENT'],
    ] as const) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code } });
      await prisma.user.create({
        data: { email, fullName: `${TAG} ${code}`, passwordHash: seed.passwordHash, roles: { create: { roleId: role.id } } },
      });
    }
  }, 60_000);

  afterAll(async () => {
    const owners = await prisma.user.findMany({
      where: { email: { in: [TEACHER, EDITOR, OTHER, NOBODY] } },
      select: { id: true },
    });
    await prisma.post.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.media.deleteMany({
      where: { uploadedBy: { in: owners.map((o) => o.id) }, createdAt: { gte: STARTED } },
    });
    for (const email of [OTHER, NOBODY]) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) continue;
      await prisma.auditLog.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  async function loginAs(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }
  type Agent = Awaited<ReturnType<typeof loginAs>>;

  const http = () => request(app.getHttpServer());
  const auditCount = (action: string, id: string) =>
    prisma.auditLog.count({ where: { action, targetId: BigInt(id) } });
  const row = (id: string) => prisma.media.findUnique({ where: { id: BigInt(id) } });
  const presign = (agent: Agent, mimeType: string, size: number) =>
    agent.post('/media/presign').send({ filename: 'tep', mimeType, size });

  // Tạo bài viết (editor) rồi đưa tới trạng thái cần thiết.
  async function post(editor: Agent, name: string, extra: object, to: 'DRAFT' | 'PUBLISHED') {
    const created = (
      await editor
        .post('/posts')
        .send({ title: `${TAG} ${name}`, content: '<p>Nội dung bài viết có media</p>', ...extra })
        .expect(201)
    ).body as { id: string };
    if (to === 'PUBLISHED') {
      await editor.post(`/posts/${created.id}/submit`).expect(200);
      await editor.post(`/posts/${created.id}/approve`).send({}).expect(200);
    }
    return created;
  }

  describe('luồng tải lên hợp lệ', () => {
    it.each([
      ['ảnh PNG', PNG, 'image/png', 'IMAGE', 'png'],
      ['video MP4', MP4, 'video/mp4', 'VIDEO', 'mp4'],
      ['video WebM', WEBM, 'video/webm', 'VIDEO', 'webm'],
    ])('%s: presign → PUT → complete, lưu bảng media và phục vụ công khai', async (_n, buffer, mime, kind, ext) => {
      const teacher = await loginAs(TEACHER);
      const res = await uploadMedia(app, teacher, buffer, mime);
      expect(res.body).toMatchObject({ kind, mimeType: mime, size: buffer.length });
      expect(res.body.url).toMatch(new RegExp(`^/media/files/[0-9a-f-]{36}\\.${ext}$`));

      const saved = await row(res.body.id);
      expect(saved).toMatchObject({ status: 'READY', kind, storageKey: res.body.url.split('/').pop() });
      expect(await auditCount('media.presign', res.body.id)).toBe(1);
      expect(await auditCount('media.upload', res.body.id)).toBe(1);

      const file = await http().get(res.body.url).expect(200);
      expect(file.headers['content-type']).toContain(mime);
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(file.body).equals(buffer)).toBe(true);
      if (kind === 'VIDEO') {
        // Video tua được (Range).
        const part = await http().get(res.body.url).set('Range', 'bytes=0-9').expect(206);
        expect(part.headers['content-range']).toMatch(/^bytes 0-9\//);
      }
    });

    it('complete gọi lại không ghi audit thêm; uploadUrl không lộ khoá ký bí mật', async () => {
      const teacher = await loginAs(TEACHER);
      const first = await uploadMedia(app, teacher, PNG, 'image/png');
      await teacher.post(`/media/${first.body.id}/complete`).expect(200);
      expect(await auditCount('media.upload', first.body.id)).toBe(1);

      const p = await presign(teacher, 'image/png', PNG.length).expect(201);
      expect(p.body.uploadUrl).toMatch(/^\/media\/local-upload\/\d+\?token=/);
      expect(JSON.stringify(p.body)).not.toContain(process.env.JWT_ACCESS_SECRET ?? 'khong-co');
      expect(new Date(p.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);
    });

    it('danh sách chỉ có file đã hoàn tất, lọc theo loại, người thường chỉ thấy file của mình', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const img = (await uploadMedia(app, teacher, PNG, 'image/png')).body;
      const vid = (await uploadMedia(app, teacher, MP4, 'video/mp4')).body;
      const pending = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;

      const all = (await teacher.get('/media').expect(200)).body as { id: string }[];
      expect(all.some((m) => m.id === img.id) && all.some((m) => m.id === vid.id)).toBe(true);
      expect(all.some((m) => m.id === pending.id)).toBe(false);

      const videos = (await teacher.get('/media?kind=VIDEO').expect(200)).body as { id: string; kind: string }[];
      expect(videos.every((m) => m.kind === 'VIDEO')).toBe(true);
      expect(videos.some((m) => m.id === vid.id)).toBe(true);
      expect(videos.some((m) => m.id === img.id)).toBe(false);
      await teacher.get('/media?kind=PDF').expect(400);

      const other = await loginAs(OTHER);
      expect(((await other.get('/media').expect(200)).body as { id: string }[]).some((m) => m.id === img.id)).toBe(false);
      expect(((await editor.get('/media').expect(200)).body as { id: string }[]).some((m) => m.id === img.id)).toBe(true);
    });
  });

  describe('từ chối file sai', () => {
    it('presign: sai loại, quá dung lượng theo từng loại, thiếu quyền, chưa đăng nhập', async () => {
      const teacher = await loginAs(TEACHER);
      await presign(teacher, 'image/svg+xml', 100).expect(400);
      await presign(teacher, 'application/x-php', 100).expect(400);
      await presign(teacher, 'video/quicktime', 100).expect(400);
      await presign(teacher, 'image/png', 0).expect(400);
      await presign(teacher, 'image/png', 10 * 1024 * 1024 + 1).expect(413);
      await presign(teacher, 'video/mp4', 100 * 1024 * 1024 + 1).expect(413);
      await presign(teacher, 'image/png', 10 * 1024 * 1024).expect(201); // đúng giới hạn thì được
      await presign(teacher, 'video/mp4', 100 * 1024 * 1024).expect(201);
      await teacher.post('/media/presign').send({}).expect(400);

      await http().post('/media/presign').send({ filename: 'a', mimeType: 'image/png', size: 1 }).expect(401);
      const nobody = await loginAs(NOBODY);
      await presign(nobody, 'image/png', PNG.length).expect(403);
      await nobody.get('/media').expect(403);
    });

    it.each([
      ['văn bản khai là PNG', Buffer.from('không phải ảnh, chỉ là văn bản'), 'image/png'],
      ['PNG khai là JPEG', PNG, 'image/jpeg'],
      ['PNG khai là WebP', PNG, 'image/webp'],
      ['MP4 khai là PNG', MP4, 'image/png'],
      ['PNG khai là MP4', PNG, 'video/mp4'],
      ['WebM khai là MP4', WEBM, 'video/mp4'],
      ['MP4 khai là WebM', MP4, 'video/webm'],
      ['SVG khai là PNG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'image/png'],
      ['PHP khai là JPEG', Buffer.from('<?php echo 1; ?>'), 'image/jpeg'],
      ['MOV (ftyp qt) khai là MP4', Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  ', 'latin1'), Buffer.alloc(32)]), 'video/mp4'],
      ['Matroska khai là WebM', Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88]), Buffer.from('matroska', 'latin1'), Buffer.alloc(32)]), 'video/webm'],
    ])('nội dung giả mạo (%s) bị từ chối ở complete và object bị xoá', async (_n, buffer, mime) => {
      const teacher = await loginAs(TEACHER);
      const p = (await presign(teacher, mime, buffer.length).expect(201)).body;
      await http().put(p.uploadUrl).set(p.headers).send(buffer).expect(204);
      const key = (await row(p.id))!.storageKey;
      expect(existsSync(storage.path(key))).toBe(true);

      await teacher.post(`/media/${p.id}/complete`).expect(400);
      expect(await row(p.id)).toBeNull();
      expect(existsSync(storage.path(key))).toBe(false);
      expect(await auditCount('media.reject', p.id)).toBe(1);
    });

    it('complete khi chưa tải lên báo lỗi nhưng giữ bản ghi chờ để thử lại', async () => {
      const teacher = await loginAs(TEACHER);
      const p = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;
      await teacher.post(`/media/${p.id}/complete`).expect(400);
      expect((await row(p.id))?.status).toBe('PENDING');
      await http().put(p.uploadUrl).set(p.headers).send(PNG).expect(204);
      await teacher.post(`/media/${p.id}/complete`).expect(200);
      expect((await row(p.id))?.status).toBe('READY');
    });

    it('PUT sai kích thước, sai Content-Type, token sai/hết hạn/của media khác đều bị từ chối', async () => {
      const teacher = await loginAs(TEACHER);
      const p = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;
      const key = (await row(p.id))!.storageKey;

      await http().put(p.uploadUrl).set(p.headers).send(Buffer.concat([PNG, Buffer.from('x')])).expect(413);
      await http().put(p.uploadUrl).set(p.headers).send(PNG.subarray(0, PNG.length - 1)).expect(400);
      await http().put(p.uploadUrl).set('Content-Type', 'image/jpeg').send(PNG).expect(400);
      expect(existsSync(storage.path(key))).toBe(false); // chưa file nào được ghi

      const [path, token] = p.uploadUrl.split('?token=');
      await http().put(`${path}?token=${token}x`).set(p.headers).send(PNG).expect(403);
      await http().put(path).set(p.headers).send(PNG).expect(403); // thiếu token
      const second = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;
      await http().put(`${path.replace(p.id, second.id)}?token=${token}`).set(p.headers).send(PNG).expect(403); // token của media khác
      const expired = storage.signToken({ id: p.id, key, mimeType: 'image/png', size: PNG.length, exp: Math.floor(Date.now() / 1000) - 5 });
      await http().put(`${path}?token=${expired}`).set(p.headers).send(PNG).expect(403);
      const widerKey = storage.signToken({ id: p.id, key: '../../etc/passwd', mimeType: 'image/png', size: PNG.length, exp: Math.floor(Date.now() / 1000) + 60 });
      await http().put(`${path}?token=${widerKey}`).set(p.headers).send(PNG).expect(403);
      expect(existsSync(storage.path(key))).toBe(false);

      await http().put(p.uploadUrl).set(p.headers).send(PNG).expect(204); // token đúng thì được
      await http().put(`/media/local-upload/999999999?token=${token}`).set(p.headers).send(PNG).expect(403);
    });

    it('file chưa hoàn tất không được phục vụ công khai; tên file lạ → 404', async () => {
      const teacher = await loginAs(TEACHER);
      const p = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;
      await http().put(p.uploadUrl).set(p.headers).send(PNG).expect(204);
      const key = (await row(p.id))!.storageKey;
      await http().get(`/media/files/${key}`).expect(404);
      await teacher.post(`/media/${p.id}/complete`).expect(200);
      await http().get(`/media/files/${key}`).expect(200);

      await http().get('/media/files/..%2F.env').expect(404);
      await http().get('/media/files/khong-co.png').expect(404);
      await http().get('/media/files/00000000-0000-0000-0000-000000000000.png').expect(404);
    });

    it('giới hạn số yêu cầu chờ dở của mỗi người', async () => {
      const other = await loginAs(OTHER);
      const me = await prisma.user.findUniqueOrThrow({ where: { email: OTHER } });
      await prisma.media.deleteMany({ where: { uploadedBy: me.id, status: 'PENDING' } });
      for (let i = 0; i < 20; i++) await presign(other, 'image/png', PNG.length).expect(201);
      await presign(other, 'image/png', PNG.length).expect(409);
      await prisma.media.deleteMany({ where: { uploadedBy: me.id, status: 'PENDING' } });
    });
  });

  describe('quyền sở hữu', () => {
    it('người khác không hoàn tất hay xoá được media của mình; người có post:approve thì được', async () => {
      const teacher = await loginAs(TEACHER);
      const other = await loginAs(OTHER);
      const editor = await loginAs(EDITOR);

      const p = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;
      await http().put(p.uploadUrl).set(p.headers).send(PNG).expect(204);
      await other.post(`/media/${p.id}/complete`).expect(404);
      expect((await row(p.id))?.status).toBe('PENDING');
      await other.delete(`/media/${p.id}`).expect(404);
      await http().post(`/media/${p.id}/complete`).expect(401);

      await editor.post(`/media/${p.id}/complete`).expect(200);
      const ready = (await uploadMedia(app, teacher, PNG, 'image/png')).body;
      await other.delete(`/media/${ready.id}`).expect(404);
      expect(await row(ready.id)).not.toBeNull();
      await editor.delete(`/media/${ready.id}`).expect(204);
      expect(await row(ready.id)).toBeNull();
      await teacher.post('/media/abc/complete').expect(400);
      await teacher.post('/media/999999999/complete').expect(404);
    });
  });

  describe('xoá', () => {
    it('xoá bản ghi và object; ghi audit', async () => {
      const teacher = await loginAs(TEACHER);
      const media = (await uploadMedia(app, teacher, MP4, 'video/mp4')).body;
      const key = (await row(media.id))!.storageKey;
      expect(existsSync(storage.path(key))).toBe(true);
      await teacher.delete(`/media/${media.id}`).expect(204);
      expect(await row(media.id)).toBeNull();
      expect(existsSync(storage.path(key))).toBe(false);
      expect(await auditCount('media.delete', media.id)).toBe(1);
      await teacher.delete(`/media/${media.id}`).expect(404);
    });

    it('không xoá file đang là ảnh đại diện hoặc chèn trong bài đã đăng (báo rõ bài nào); bài nháp không chặn', async () => {
      const editor = await loginAs(EDITOR);
      const img = (await uploadMedia(app, editor, PNG, 'image/png')).body;
      const vid = (await uploadMedia(app, editor, MP4, 'video/mp4')).body;
      const draftOnly = (await uploadMedia(app, editor, PNG, 'image/png')).body;

      await post(editor, 'ảnh đại diện', { thumbnailUrl: img.url }, 'PUBLISHED');
      const withVideo = await post(
        editor,
        'có video',
        { content: `<p>Xem video</p><video src="${vid.url}" controls></video>` },
        'PUBLISHED',
      );
      await post(editor, 'nháp', { thumbnailUrl: draftOnly.url }, 'DRAFT');

      const a = await editor.delete(`/media/${img.id}`).expect(409);
      expect(a.body.message).toContain(`${TAG} ảnh đại diện`);
      const b = await editor.delete(`/media/${vid.id}`).expect(409);
      expect(b.body.message).toContain(`${TAG} có video`);
      expect(await row(img.id)).not.toBeNull();
      expect(existsSync(storage.path((await row(vid.id))!.storageKey))).toBe(true);
      await editor.delete(`/media/${draftOnly.id}`).expect(204);

      // Gỡ bài ra khỏi trạng thái đã đăng thì xoá được.
      await editor.post(`/posts/${withVideo.id}/unpublish`).expect(200);
      await editor.delete(`/media/${vid.id}`).expect(204);
    });
  });

  describe('nội dung bài viết', () => {
    it('chỉ giữ ảnh/video của hệ thống; thẻ video có controls và preload=metadata; mã độc bị loại', async () => {
      const teacher = await loginAs(TEACHER);
      const img = (await uploadMedia(app, teacher, PNG, 'image/png')).body;
      const vid = (await uploadMedia(app, teacher, MP4, 'video/mp4')).body;
      const content =
        `<p>Ảnh</p><img src="${img.url}" alt="a"><img src="https://evil.example/x.png">` +
        `<video src="${vid.url}" autoplay onerror="alert(1)"></video>` +
        '<video src="https://evil.example/v.mp4"></video>' +
        `<video><source src="${vid.url}" type="video/mp4"><source src="javascript:alert(1)"></video>`;
      const created = (
        await teacher.post('/posts').send({ title: `${TAG} nội dung`, content }).expect(201)
      ).body as { id: string };
      const saved = (await teacher.get(`/posts/manage/${created.id}`).expect(200)).body.content as string;
      expect(saved).toContain(`<img src="${img.url}" alt="a" loading="lazy" decoding="async" />`);
      expect(saved).toContain(`src="${vid.url}"`);
      expect(saved).toContain('preload="metadata"');
      expect(saved).toContain('controls');
      expect(saved).not.toMatch(/evil\.example|autoplay|onerror|javascript:/);
      expect(saved.match(/<video/g)).toHaveLength(2);
    });

    it('URL tuyệt đối do web ghép (địa chỉ API + /api) được nhận, host lạ thì không', async () => {
      const teacher = await loginAs(TEACHER);
      const img = (await uploadMedia(app, teacher, PNG, 'image/png')).body;
      const apiBase = `http://localhost:${process.env.API_PORT ?? 4000}/api`;
      const content = `<p>x</p><img src="${apiBase}${img.url}"><img src="https://evil.example/api${img.url}">`;
      const created = (await teacher.post('/posts').send({ title: `${TAG} url tuyệt đối`, content }).expect(201)).body;
      const saved = (await teacher.get(`/posts/manage/${created.id}`).expect(200)).body.content as string;
      expect(saved).toContain(`src="${apiBase}${img.url}"`);
      expect(saved).not.toContain('evil.example');
    });
  });

  describe('dọn bản ghi chờ', () => {
    it('xoá bản ghi chờ quá 1 giờ cùng object mồ côi; giữ bản ghi chờ mới và file đã hoàn tất', async () => {
      const teacher = await loginAs(TEACHER);
      const media = app.get(MediaService);

      const stale = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;
      await http().put(stale.uploadUrl).set(stale.headers).send(PNG).expect(204); // đã PUT nhưng không complete
      const staleKey = (await row(stale.id))!.storageKey;
      const staleNoFile = (await presign(teacher, 'video/mp4', MP4.length).expect(201)).body; // chưa PUT
      const fresh = (await presign(teacher, 'image/png', PNG.length).expect(201)).body;
      const ready = (await uploadMedia(app, teacher, PNG, 'image/png')).body;

      const old = new Date(Date.now() - 2 * 3_600_000);
      await prisma.media.updateMany({
        where: { id: { in: [BigInt(stale.id), BigInt(staleNoFile.id), BigInt(ready.id)] } },
        data: { createdAt: old },
      });

      expect(await media.cleanupStale()).toBeGreaterThanOrEqual(2);
      expect(await row(stale.id)).toBeNull();
      expect(await row(staleNoFile.id)).toBeNull();
      expect(existsSync(storage.path(staleKey))).toBe(false);
      expect((await row(fresh.id))?.status).toBe('PENDING');
      expect((await row(ready.id))?.status).toBe('READY'); // READY không bị đụng dù cũ
      expect(existsSync(storage.path((await row(ready.id))!.storageKey))).toBe(true);
      expect(
        await prisma.auditLog.count({ where: { action: 'media.cleanup', targetId: BigInt(stale.id), channel: 'scheduler' } }),
      ).toBe(1);
    });
  });

  describe('tạo từ dữ liệu phía server (dùng cho bot Telegram)', () => {
    const asUser = async (email: string): Promise<AuthUser> => {
      const { UsersService } = await import('./../src/features/users/users.service.js');
      const user = await app.get(UsersService).findAuthUserByEmail(email);
      if (!user) throw new Error(`Không có ${email}`);
      return user;
    };

    it('nhận dạng loại bằng magic bytes, kiểm tra dung lượng, ghi audit theo kênh', async () => {
      const media = app.get(MediaService);
      const user = await asUser(TEACHER);

      const dto = await media.createFromBuffer(user, PNG, { channel: 'telegram' });
      expect(dto).toMatchObject({ kind: 'IMAGE', mimeType: 'image/png', size: PNG.length });
      expect((await row(dto.id))?.status).toBe('READY');
      expect(existsSync(storage.path((await row(dto.id))!.storageKey))).toBe(true);
      expect(
        await prisma.auditLog.count({ where: { action: 'media.upload', targetId: BigInt(dto.id), channel: 'telegram' } }),
      ).toBe(1);
      await http().get(dto.url).expect(200);

      expect((await media.createFromBuffer(user, MP4)).kind).toBe('VIDEO');
      await expect(media.createFromBuffer(user, Buffer.from('chỉ là văn bản'))).rejects.toThrow(/ảnh JPEG/);
      await expect(
        media.createFromBuffer(user, Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)])),
      ).rejects.toThrow(/vượt quá 10 MB/);
      const nobody = await asUser(NOBODY);
      await expect(media.createFromBuffer(nobody, PNG)).rejects.toThrow();
    });
  });
});
