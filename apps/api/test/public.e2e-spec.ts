// F01–F07 – API cho website công khai và liên hệ. Cần PostgreSQL đã migrate + seed.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const EDITOR = 'bientap@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';
const SECRET = 'bi-mat-revalidate-test-0123456789';

// Ảnh PNG 1×1 hợp lệ.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const TAG = `F01-${Date.now()}`;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('Website công khai & liên hệ (F01–F07, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  // Máy chủ giả đóng vai website Next.js nhận lời gọi revalidate.
  let web: Server;
  const revalidations: { secret: string | undefined; tags: string[] }[] = [];
  const KEYS = ['WEB_ORIGIN', 'REVALIDATE_SECRET', 'UPLOAD_DIR'] as const;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const uploadDir = mkdtempSync(join(tmpdir(), 'pvh-uploads-'));

  beforeAll(async () => {
    web = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        revalidations.push({
          secret: req.headers['x-revalidate-secret'] as string | undefined,
          tags: (JSON.parse(body || '{}') as { tags: string[] }).tags,
        });
        res.writeHead(200).end('{}');
      });
    });
    await new Promise<void>((ok) => web.listen(0, '127.0.0.1', ok));
    process.env.WEB_ORIGIN = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
    process.env.REVALIDATE_SECRET = SECRET;
    process.env.UPLOAD_DIR = uploadDir;
  });

  afterAll(async () => {
    await new Promise((ok) => web.close(ok));
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(uploadDir, { recursive: true, force: true });
    const { PrismaClient } = await import('./../src/generated/prisma/client.js');
    const { createPgAdapter } = await import(
      './../src/infrastructure/database/pg-adapter.js'
    );
    const db = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
    try {
      await db.post.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.category.deleteMany({ where: { name: { startsWith: TAG } } });
      await db.contact.deleteMany({ where: { subject: { startsWith: TAG } } });
      await db.systemSetting.deleteMany({ where: { key: `${TAG}.secret` } });
    } finally {
      await db.$disconnect();
    }
  });

  beforeEach(async () => {
    // Import sau khi đặt biến môi trường: ConfigModule đọc chúng ngay khi AppModule được nạp.
    const { AppModule } = await import('./../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await app.close();
  });

  async function loginAs(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }
  type Agent = Awaited<ReturnType<typeof loginAs>>;
  const http = () => request(app.getHttpServer());

  // Tạo bài và đưa tới trạng thái mong muốn (biên tập viên tự gửi duyệt và duyệt).
  async function createPost(
    editor: Agent,
    name: string,
    to: 'DRAFT' | 'PENDING_REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED',
    extra: object = {},
  ) {
    const post = (
      await editor
        .post('/posts')
        .send({
          title: `${TAG} ${name}`,
          content: '<p>Nội dung công khai của bài viết</p>',
          ...extra,
        })
        .expect(201)
    ).body as { id: string; slug: string };
    if (to === 'DRAFT') return post;
    await editor.post(`/posts/${post.id}/submit`).expect(200);
    if (to === 'PENDING_REVIEW') return post;
    if (to === 'SCHEDULED') {
      await editor.post(`/posts/${post.id}/approve`).send({ publishAt: inHours(24) }).expect(200);
      return post;
    }
    await editor.post(`/posts/${post.id}/approve`).send({}).expect(200);
    if (to === 'ARCHIVED') await editor.post(`/posts/${post.id}/unpublish`).expect(200);
    return post;
  }

  describe('bài viết công khai', () => {
    it('danh sách chỉ trả bài đã đăng và không lộ thông tin nội bộ/cá nhân', async () => {
      const res = await http().get('/public/posts').expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      const json = JSON.stringify(res.body);
      expect(json).not.toMatch(/@pvh\.edu\.vn|authorId|reviewerId|passwordHash|"status"|phone/);
      for (const item of res.body.items) {
        expect(item).toEqual(
          expect.objectContaining({ slug: expect.any(String), title: expect.any(String), excerpt: expect.any(String) }),
        );
      }
    });

    it('bài chưa PUBLISHED (nháp, chờ duyệt, hẹn giờ, đã gỡ) không truy cập được → 404', async () => {
      const editor = await loginAs(EDITOR);
      const draft = await createPost(editor, 'nháp', 'DRAFT');
      const pending = await createPost(editor, 'chờ duyệt', 'PENDING_REVIEW');
      const scheduled = await createPost(editor, 'hẹn giờ', 'SCHEDULED');
      const archived = await createPost(editor, 'đã gỡ', 'ARCHIVED');
      const live = await createPost(editor, 'đã đăng', 'PUBLISHED');

      for (const post of [draft, pending, scheduled, archived]) {
        await http().get(`/public/posts/${post.slug}`).expect(404);
      }
      await http().get('/public/posts/khong-co-bai-nay').expect(404);

      const detail = await http().get(`/public/posts/${live.slug}`).expect(200);
      expect(detail.body).toMatchObject({ slug: live.slug, title: `${TAG} đã đăng`, content: '<p>Nội dung công khai của bài viết</p>' });
      expect(detail.body.authorName).toBeTruthy();
      expect(JSON.stringify(detail.body)).not.toMatch(/authorId|@pvh\.edu\.vn/);

      // Cũng không xuất hiện trong danh sách công khai.
      const list = await http().get('/public/posts').query({ q: TAG, pageSize: 50 }).expect(200);
      expect(list.body.items.map((i: { slug: string }) => i.slug)).toEqual([live.slug]);
    });

    it('tìm kiếm, phân trang và lọc theo chuyên mục (gồm chuyên mục con)', async () => {
      const editor = await loginAs(EDITOR);
      const parent = (await editor.post('/categories').send({ name: `${TAG} Cha` }).expect(201)).body;
      const child = (
        await editor.post('/categories').send({ name: `${TAG} Con`, parentId: parent.id }).expect(201)
      ).body;
      await createPost(editor, 'tin con A', 'PUBLISHED', { categoryId: child.id });
      await createPost(editor, 'tin con B', 'PUBLISHED', { categoryId: child.id });
      await createPost(editor, 'tin cha', 'PUBLISHED', { categoryId: parent.id });

      const byParent = await http().get('/public/posts').query({ category: parent.slug }).expect(200);
      expect(byParent.body.total).toBe(3);
      const byChild = await http().get('/public/posts').query({ category: child.slug }).expect(200);
      expect(byChild.body.total).toBe(2);
      expect(byChild.body.items[0].categoryName).toBe(`${TAG} Con`);
      expect((await http().get('/public/posts').query({ category: 'khong-co' }).expect(200)).body.total).toBe(0);

      const page1 = await http().get('/public/posts').query({ category: parent.slug, pageSize: 2 }).expect(200);
      const page2 = await http().get('/public/posts').query({ category: parent.slug, pageSize: 2, page: 2 }).expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page2.body.items).toHaveLength(1);
      expect(page1.body.total).toBe(3);

      const search = await http().get('/public/posts').query({ q: `${TAG} TIN CON a` }).expect(200);
      expect(search.body.items.map((i: { title: string }) => i.title)).toEqual([`${TAG} tin con A`]);
      expect((await http().get('/public/posts').query({ q: `${TAG}-khong-ton-tai` }).expect(200)).body.total).toBe(0);

      await http().get('/public/posts').query({ pageSize: 1000 }).expect(400);
      await http().get('/public/posts').query({ category: 'Sai Định Dạng!' }).expect(400);
    });

    it('lượt xem: tăng một lần mỗi IP, không tăng với bài chưa đăng', async () => {
      const editor = await loginAs(EDITOR);
      const live = await createPost(editor, 'lượt xem', 'PUBLISHED');
      const draft = await createPost(editor, 'lượt xem nháp', 'DRAFT');

      const before = (await http().get(`/public/posts/${live.slug}`)).body.viewCount as number;
      await http().post(`/public/posts/${live.slug}/view`).expect(204);
      await http().post(`/public/posts/${live.slug}/view`).expect(204);
      const after = (await http().get(`/public/posts/${live.slug}`)).body.viewCount as number;
      expect(after).toBe(before + 1);

      await http().post(`/public/posts/${draft.slug}/view`).expect(204);
      expect(
        (await prisma.post.findUniqueOrThrow({ where: { slug: draft.slug } })).viewCount,
      ).toBe(0);
    });

    it('tuyển sinh, cấu hình công khai (chỉ khóa cho phép), thư viện ảnh của bài đã đăng', async () => {
      const admission = await http().get('/public/admission').expect(200);
      expect(admission.body[0]).toMatchObject({ schoolYear: '2026-2027', quota: 810, benchmarkNv1: 16 });

      await prisma.systemSetting.upsert({
        where: { key: `${TAG}.secret` },
        update: {},
        create: { key: `${TAG}.secret`, value: 'khong-duoc-lo' },
      });
      const settings = await http().get('/public/settings').expect(200);
      expect(settings.body['school.name']).toBe('Trường THPT Phan Văn Hớn');
      expect(JSON.stringify(settings.body)).not.toContain('khong-duoc-lo');

      const editor = await loginAs(EDITOR);
      const upload = async () =>
        (
          await editor
            .post('/media')
            .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
            .expect(201)
        ).body.url as string;
      const publicImage = await upload();
      const draftImage = await upload();
      const live = await createPost(editor, 'thư viện', 'PUBLISHED', { thumbnailUrl: publicImage });
      await createPost(editor, 'thư viện nháp', 'DRAFT', { thumbnailUrl: draftImage });

      const gallery = await http().get('/public/gallery').expect(200);
      const urls = gallery.body.map((g: { url: string }) => g.url);
      expect(urls).toContain(publicImage);
      expect(urls).not.toContain(draftImage);
      expect(gallery.body.find((g: { url: string }) => g.url === publicImage)).toMatchObject({
        postSlug: live.slug,
      });
    });
  });

  describe('revalidate cache của web', () => {
    it('đăng, gỡ bài và đổi chuyên mục thì API gọi web kèm bí mật chung', async () => {
      const editor = await loginAs(EDITOR);
      revalidations.length = 0;

      const post = await createPost(editor, 'revalidate', 'PUBLISHED');
      expect(revalidations).toEqual([{ secret: SECRET, tags: ['posts'] }]);

      await editor.post(`/posts/${post.id}/unpublish`).expect(200);
      expect(revalidations).toHaveLength(2);

      await editor.post('/categories').send({ name: `${TAG} Revalidate` }).expect(201);
      expect(revalidations.at(-1)).toEqual({ secret: SECRET, tags: ['categories', 'posts'] });
    });
  });

  describe('liên hệ (F07)', () => {
    const valid = (name: string) => ({
      fullName: 'Nguyễn Văn A',
      email: 'phu.huynh@example.com',
      phone: '0901234567',
      subject: `${TAG} ${name}`,
      message: 'Tôi muốn hỏi về thủ tục nhập học lớp 10.',
    });

    it('gửi form hợp lệ → 201 và có bản ghi trong contacts (nội dung được làm sạch)', async () => {
      const res = await http()
        .post('/contacts')
        .send({ ...valid('hợp lệ'), message: 'Xin chào <script>alert(1)</script><b>nhà trường</b> ạ' })
        .expect(201);
      expect(res.body.message).toMatch(/xin cảm ơn/);
      const row = await prisma.contact.findFirstOrThrow({ where: { subject: `${TAG} hợp lệ` } });
      expect(row).toMatchObject({ status: 'NEW', email: 'phu.huynh@example.com' });
      expect(row.message).not.toMatch(/<|alert/);
      expect(row.message).toContain('nhà trường');
    });

    it('dữ liệu sai bị từ chối (400)', async () => {
      await http().post('/contacts').send({ ...valid('thiếu'), fullName: '' }).expect(400);
      await http().post('/contacts').send({ ...valid('email sai'), email: 'khong-phai-email' }).expect(400);
      await http().post('/contacts').send({ ...valid('sdt sai'), phone: 'abc' }).expect(400);
      await http().post('/contacts').send({ ...valid('ngắn'), message: 'ngắn' }).expect(400);
      const noContact = await http()
        .post('/contacts')
        .send({ ...valid('không liên lạc'), email: '', phone: '' })
        .expect(400);
      expect(JSON.stringify(noContact.body)).toMatch(/email hoặc số điện thoại/);
    });

    it('ô ẩn chống bot được điền → bỏ qua, không lưu', async () => {
      await http()
        .post('/contacts')
        .send({ ...valid('bot'), website: 'http://spam.example' })
        .expect(201);
      expect(await prisma.contact.count({ where: { subject: `${TAG} bot` } })).toBe(0);
    });

    it('gửi dồn dập bị chặn (429) sau 3 lần/10 phút theo IP', async () => {
      for (let i = 1; i <= 3; i++) {
        await http().post('/contacts').send(valid(`dồn dập ${i}`)).expect(201);
      }
      const blocked = await http().post('/contacts').send(valid('dồn dập 4')).expect(429);
      expect(blocked.body.message).toMatch(/quá nhiều liên hệ/);
      expect(await prisma.contact.count({ where: { subject: `${TAG} dồn dập 4` } })).toBe(0);
      expect(await prisma.contact.count({ where: { subject: { startsWith: `${TAG} dồn dập` } } })).toBe(3);
    });

    it('quản trị: xem và đổi trạng thái cần quyền biên tập, có audit log', async () => {
      await http().post('/contacts').send(valid('quản trị')).expect(201);
      const row = await prisma.contact.findFirstOrThrow({ where: { subject: `${TAG} quản trị` } });

      await http().get('/contacts').expect(401);
      const teacher = await loginAs(TEACHER);
      await teacher.get('/contacts').expect(403);
      await teacher.patch(`/contacts/${row.id}/status`).send({ status: 'DONE' }).expect(403);

      const editor = await loginAs(EDITOR);
      const list = await editor.get('/contacts').query({ status: 'NEW', pageSize: 100 }).expect(200);
      const found = list.body.items.find((c: { id: string }) => c.id === row.id.toString());
      expect(found).toMatchObject({ email: 'phu.huynh@example.com', phone: '0901234567', status: 'NEW' });

      const updated = await editor
        .patch(`/contacts/${row.id}/status`)
        .send({ status: 'READ' })
        .expect(200);
      expect(updated.body.status).toBe('READ');
      expect(
        await prisma.auditLog.count({ where: { action: 'contact.update_status', targetId: row.id } }),
      ).toBe(1);

      await editor.patch(`/contacts/${row.id}/status`).send({ status: 'XONG' }).expect(400);
      await editor.patch('/contacts/999999999/status').send({ status: 'DONE' }).expect(404);
    });
  });
});
