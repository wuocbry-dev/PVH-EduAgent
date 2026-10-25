// F12, F13 – vòng đời bài viết, chuyên mục, media. Cần PostgreSQL đã migrate + seed.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn';

// Ảnh PNG 1×1 hợp lệ.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const uploadDir = mkdtempSync(join(tmpdir(), 'pvh-uploads-'));
process.env.UPLOAD_DIR = uploadDir;

const TAG = `F12-${Date.now()}`;
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('Bài viết, chuyên mục, media (F12, F13, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
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

  afterAll(async () => {
    rmSync(uploadDir, { recursive: true, force: true });
  });

  async function loginAs(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }

  type Agent = Awaited<ReturnType<typeof loginAs>>;

  const draft = async (agent: Agent, name: string, extra: object = {}) => {
    const res = await agent
      .post('/posts')
      .send({ title: `${TAG} ${name}`, content: '<p>Nội dung bài viết</p>', ...extra })
      .expect(201);
    return res.body as { id: string; status: string; actions: string[] };
  };

  // Đưa bài tới PENDING_REVIEW.
  const submitted = async (teacher: Agent, name: string) => {
    const post = await draft(teacher, name);
    await teacher.post(`/posts/${post.id}/submit`).expect(200);
    return post;
  };

  const auditCount = (action: string, id: string) =>
    prisma.auditLog.count({ where: { action, targetId: BigInt(id) } });

  afterAll(async () => {
    // Dọn dữ liệu test.
    const { PrismaClient } = await import('./../src/generated/prisma/client.js');
    const { createPgAdapter } = await import(
      './../src/infrastructure/database/pg-adapter.js'
    );
    const db = new PrismaClient({ adapter: createPgAdapter(process.env.DATABASE_URL) });
    try {
      await db.post.deleteMany({ where: { title: { startsWith: TAG } } });
      await db.category.deleteMany({ where: { name: { startsWith: TAG } } });
    } finally {
      await db.$disconnect();
    }
  });

  describe('vòng đời bài viết', () => {
    it('tác giả tạo nháp → gửi duyệt → biên tập viên duyệt hẹn giờ → dời lịch → đăng ngay → gỡ → khôi phục → xóa', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const admin = await loginAs(ADMIN);

      const post = await draft(teacher, 'vòng đời');
      expect(post.status).toBe('DRAFT');
      expect([...post.actions].sort()).toEqual(['delete', 'edit', 'submit']);

      const pending = await teacher.post(`/posts/${post.id}/submit`).expect(200);
      expect(pending.body.status).toBe('PENDING_REVIEW');
      expect(pending.body.actions).toEqual([]);

      const publishAt = inHours(24);
      const scheduled = await editor
        .post(`/posts/${post.id}/approve`)
        .send({ publishAt })
        .expect(200);
      expect(scheduled.body.status).toBe('SCHEDULED');
      expect(scheduled.body.publishAt).toBe(publishAt);
      expect(scheduled.body.reviewerId).not.toBeNull();
      expect(scheduled.body.publishedAt).toBeNull();

      const moved = inHours(48);
      const rescheduled = await editor
        .post(`/posts/${post.id}/reschedule`)
        .send({ publishAt: moved })
        .expect(200);
      expect(rescheduled.body.publishAt).toBe(moved);

      const published = await editor.post(`/posts/${post.id}/publish`).expect(200);
      expect(published.body.status).toBe('PUBLISHED');
      expect(published.body.publishedAt).not.toBeNull();
      expect(published.body.publishAt).toBeNull();
      expect(
        (await request(app.getHttpServer()).get('/posts').expect(200)).body.some(
          (p: { id: string }) => p.id === post.id,
        ),
      ).toBe(true);

      const archived = await editor.post(`/posts/${post.id}/unpublish`).expect(200);
      expect(archived.body.status).toBe('ARCHIVED');
      expect(
        (await request(app.getHttpServer()).get('/posts').expect(200)).body.some(
          (p: { id: string }) => p.id === post.id,
        ),
      ).toBe(false);

      const restored = await editor.post(`/posts/${post.id}/restore`).expect(200);
      expect(restored.body.status).toBe('DRAFT');

      // Gửi duyệt lại, duyệt đăng ngay, gỡ, rồi ADMIN xóa vĩnh viễn.
      await teacher.post(`/posts/${post.id}/submit`).expect(200);
      const live = await editor.post(`/posts/${post.id}/approve`).send({}).expect(200);
      expect(live.body.status).toBe('PUBLISHED');
      await editor.post(`/posts/${post.id}/unpublish`).expect(200);
      await editor.delete(`/posts/${post.id}`).expect(403);
      await admin.delete(`/posts/${post.id}`).expect(204);
      await admin.get(`/posts/manage/${post.id}`).expect(404);

      for (const action of [
        'post.create',
        'post.submit',
        'post.approve',
        'post.reschedule',
        'post.publish',
        'post.unpublish',
        'post.restore',
        'post.delete',
      ]) {
        expect(await auditCount(action, post.id), action).toBeGreaterThanOrEqual(1);
      }
    });

    it('từ chối kèm lý do → tác giả thấy lý do, sửa lại thì về nháp rồi gửi duyệt lại', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const post = await submitted(teacher, 'từ chối');

      await editor.post(`/posts/${post.id}/reject`).send({}).expect(400);
      await editor.post(`/posts/${post.id}/reject`).send({ reason: '  ' }).expect(400);
      const rejected = await editor
        .post(`/posts/${post.id}/reject`)
        .send({ reason: 'Thiếu nguồn ảnh' })
        .expect(200);
      expect(rejected.body.status).toBe('REJECTED');
      expect(rejected.body.reviewerId).not.toBeNull();

      const seen = await teacher.get(`/posts/manage/${post.id}`).expect(200);
      expect(seen.body.rejectReason).toBe('Thiếu nguồn ảnh');
      expect(seen.body.actions).toEqual(['edit']);

      const edited = await teacher
        .patch(`/posts/${post.id}`)
        .send({ content: '<p>Đã bổ sung nguồn ảnh</p>' })
        .expect(200);
      expect(edited.body.status).toBe('DRAFT');
      await teacher.post(`/posts/${post.id}/submit`).expect(200);
      expect(await auditCount('post.reject', post.id)).toBe(1);
    });

    it('hủy lịch đưa bài về nháp', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const post = await submitted(teacher, 'hủy lịch');
      await editor.post(`/posts/${post.id}/approve`).send({ publishAt: inHours(5) }).expect(200);
      const res = await editor.post(`/posts/${post.id}/cancel-schedule`).expect(200);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.publishAt).toBeNull();
    });

    it('chuyển trạng thái sai luật bị từ chối kèm thông báo rõ ràng', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const post = await draft(teacher, 'sai luật');

      const approve = await editor.post(`/posts/${post.id}/approve`).send({}).expect(400);
      expect(approve.body.message).toMatch(/Không thể duyệt bài viết đang ở trạng thái "Nháp"/);
      await editor.post(`/posts/${post.id}/publish`).expect(400);
      await editor.post(`/posts/${post.id}/unpublish`).expect(400);
      await editor.post(`/posts/${post.id}/restore`).expect(400);

      await teacher.post(`/posts/${post.id}/submit`).expect(200);
      // Đã gửi duyệt thì tác giả không sửa/gửi lại/xóa được.
      const edit = await teacher.patch(`/posts/${post.id}`).send({ title: 'Tiêu đề khác nữa' }).expect(400);
      expect(edit.body.message).toMatch(/Không thể sửa bài viết đang ở trạng thái "Chờ duyệt"/);
      await teacher.post(`/posts/${post.id}/submit`).expect(400);
      await teacher.delete(`/posts/${post.id}`).expect(400);

      // Hẹn giờ ở quá khứ bị từ chối; bài vẫn chờ duyệt.
      const past = await editor
        .post(`/posts/${post.id}/approve`)
        .send({ publishAt: inHours(-1) })
        .expect(400);
      expect(past.body.message).toBe('Thời điểm hẹn giờ phải ở tương lai');
      await editor.post(`/posts/${post.id}/reschedule`).send({ publishAt: inHours(3) }).expect(400);
      expect((await editor.get(`/posts/manage/${post.id}`)).body.status).toBe('PENDING_REVIEW');
    });

    it('phân quyền: giáo viên không duyệt/đăng/gỡ, người khác không sửa bài của tác giả, BGH không xóa vĩnh viễn', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const principal = await loginAs(PRINCIPAL);
      const post = await submitted(teacher, 'quyền');

      await teacher.post(`/posts/${post.id}/approve`).send({}).expect(403);
      await teacher.post(`/posts/${post.id}/reject`).send({ reason: 'x' }).expect(403);

      const mine = await draft(teacher, 'của giáo viên');
      await editor.patch(`/posts/${mine.id}`).send({ title: 'Biên tập viên sửa trộm' }).expect(403);
      await editor.post(`/posts/${mine.id}/submit`).expect(403);
      await editor.delete(`/posts/${mine.id}`).expect(403);

      await editor.post(`/posts/${post.id}/approve`).send({}).expect(200);
      await teacher.post(`/posts/${post.id}/unpublish`).expect(403);
      await editor.post(`/posts/${post.id}/unpublish`).expect(200);
      await principal.delete(`/posts/${post.id}`).expect(403);

      // Chưa đăng nhập.
      await request(app.getHttpServer()).post(`/posts/${post.id}/approve`).send({}).expect(401);
    });

    it('giáo viên chỉ thấy bài của mình trong danh sách quản lý; người duyệt thấy tất cả', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);
      const post = await draft(editor, 'bài của biên tập viên');

      const own = await teacher.get('/posts/manage').expect(200);
      expect(own.body.every((p: { authorName: string }) => p.authorName === 'Giáo viên Toán')).toBe(
        true,
      );
      await teacher.get(`/posts/manage/${post.id}`).expect(403);

      const all = await editor.get('/posts/manage').query({ status: 'DRAFT' }).expect(200);
      expect(all.body.some((p: { id: string }) => p.id === post.id)).toBe(true);
      await editor.get('/posts/manage').query({ status: 'KHONG-CO' }).expect(400);
    });
  });

  describe('chống XSS', () => {
    it('HTML độc hại bị loại khi lưu, HTML hợp lệ được giữ', async () => {
      const teacher = await loginAs(TEACHER);
      const evil = [
        '<p onclick="steal()">Xin chào <b>thế giới</b></p>',
        '<script>alert(1)</script>',
        '<img src="x" onerror="alert(2)">',
        '<img src="javascript:alert(3)">',
        '<a href="javascript:alert(4)">bấm vào</a>',
        '<iframe src="https://evil.example"></iframe>',
        '<style>body{display:none}</style>',
        '<a href="https://pvh.edu.vn" target="_blank">trường</a>',
      ].join('');
      const post = await draft(teacher, 'xss', { content: evil, summary: '<b>tóm tắt</b><script>x</script>' });

      const saved = await teacher.get(`/posts/manage/${post.id}`).expect(200);
      const html: string = saved.body.content;
      expect(html).not.toMatch(/<script|onclick|onerror|javascript:|<iframe|<style|alert\(/i);
      expect(html).toContain('<b>thế giới</b>');
      expect(html).toContain('href="https://pvh.edu.vn"');
      expect(html).toContain('rel="noopener noreferrer nofollow"');
      expect(saved.body.summary).toBe('tóm tắt');

      // Sửa nội dung cũng được lọc.
      const updated = await teacher
        .patch(`/posts/${post.id}`)
        .send({ content: '<p>ok</p><script>alert(5)</script>' })
        .expect(200);
      expect(updated.body.content).toBe('<p>ok</p>');
    });

    it('nội dung chỉ có mã độc (rỗng sau khi lọc) bị từ chối', async () => {
      const teacher = await loginAs(TEACHER);
      await teacher
        .post('/posts')
        .send({ title: `${TAG} rỗng`, content: '<script>alert(1)</script>' })
        .expect(400);
    });
  });

  describe('chuyên mục (F13)', () => {
    it('xem công khai; tạo/sửa/xóa chuyên mục cây cha–con chỉ cho người có quyền biên tập', async () => {
      const teacher = await loginAs(TEACHER);
      const editor = await loginAs(EDITOR);

      expect((await request(app.getHttpServer()).get('/categories').expect(200)).body.length).toBeGreaterThan(0);
      await teacher.post('/categories').send({ name: `${TAG} trái phép` }).expect(403);
      await request(app.getHttpServer()).post('/categories').send({ name: 'x' }).expect(401);

      const parent = (
        await editor.post('/categories').send({ name: `${TAG} Cha`, sortOrder: 5 }).expect(201)
      ).body;
      expect(parent.slug).toMatch(/^f12-\d+-cha$/);
      const child = (
        await editor.post('/categories').send({ name: `${TAG} Con`, parentId: parent.id }).expect(201)
      ).body;
      expect(child.parentId).toBe(parent.id);

      await editor.post('/categories').send({ name: `${TAG} Mồ côi`, parentId: '999999999' }).expect(400);

      // Không tạo vòng lặp cha–con.
      await editor.patch(`/categories/${parent.id}`).send({ parentId: child.id }).expect(400);
      await editor.patch(`/categories/${parent.id}`).send({ parentId: parent.id }).expect(400);

      const renamed = await editor
        .patch(`/categories/${child.id}`)
        .send({ name: `${TAG} Con đổi tên`, sortOrder: 2 })
        .expect(200);
      expect(renamed.body.name).toBe(`${TAG} Con đổi tên`);
      expect(renamed.body.sortOrder).toBe(2);
      expect(renamed.body.parentId).toBe(parent.id);

      // Không xóa chuyên mục còn con.
      await editor.delete(`/categories/${parent.id}`).expect(400);
      await editor.delete(`/categories/${child.id}`).expect(204);
      await editor.delete(`/categories/${parent.id}`).expect(204);
      await editor.delete(`/categories/${parent.id}`).expect(404);

      expect(await auditCount('category.create', parent.id)).toBe(1);
      expect(await auditCount('category.delete', parent.id)).toBe(1);
    });

    it('gán chuyên mục cho bài và lọc danh sách theo chuyên mục', async () => {
      const editor = await loginAs(EDITOR);
      const category = (await editor.post('/categories').send({ name: `${TAG} Lọc` }).expect(201)).body;
      const post = await draft(editor, 'có chuyên mục', { categoryId: category.id });

      const filtered = await editor.get('/posts/manage').query({ categoryId: category.id }).expect(200);
      expect(filtered.body.map((p: { id: string }) => p.id)).toEqual([post.id]);
      expect(filtered.body[0].categoryName).toBe(`${TAG} Lọc`);

      await editor
        .post('/posts')
        .send({ title: `${TAG} sai chuyên mục`, content: '<p>x</p>', categoryId: '999999999' })
        .expect(400);
    });
  });

  describe('media (F13)', () => {
    const upload = (agent: Agent, buffer: Buffer, filename: string, contentType: string) =>
      agent.post('/media').attach('file', buffer, { filename, contentType });

    it('ảnh đúng loại được nhận, lưu bảng media và phục vụ công khai', async () => {
      const teacher = await loginAs(TEACHER);
      const res = await upload(teacher, PNG, 'anh.png', 'image/png').expect(201);
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.size).toBe(PNG.length);
      expect(res.body.url).toMatch(/^\/media\/files\/[0-9a-f-]{36}\.png$/);
      expect(await prisma.media.count({ where: { id: BigInt(res.body.id) } })).toBe(1);
      expect(await auditCount('media.upload', res.body.id)).toBe(1);

      const file = await request(app.getHttpServer()).get(res.body.url).expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(file.body).equals(PNG)).toBe(true);

      const list = await teacher.get('/media').expect(200);
      expect(list.body.some((m: { id: string }) => m.id === res.body.id)).toBe(true);
    });

    it('chọn ảnh đại diện cho bài: chỉ nhận ảnh đã tải lên', async () => {
      const teacher = await loginAs(TEACHER);
      const media = (await upload(teacher, PNG, 'anh.png', 'image/png').expect(201)).body;
      const post = await draft(teacher, 'có ảnh', { thumbnailUrl: media.url });
      expect(post).toMatchObject({ status: 'DRAFT' });
      expect((await teacher.get(`/posts/manage/${post.id}`)).body.thumbnailUrl).toBe(media.url);

      await teacher.patch(`/posts/${post.id}`).send({ thumbnailUrl: 'https://evil.example/a.png' }).expect(400);
      await teacher.patch(`/posts/${post.id}`).send({ thumbnailUrl: 'javascript:alert(1)' }).expect(400);
      const cleared = await teacher.patch(`/posts/${post.id}`).send({ thumbnailUrl: null }).expect(200);
      expect(cleared.body.thumbnailUrl).toBeNull();
    });

    it('sai loại file bị từ chối (đuôi/Content-Type giả mạo, SVG, văn bản)', async () => {
      const teacher = await loginAs(TEACHER);
      const text = Buffer.from('không phải ảnh');
      await upload(teacher, text, 'anh.png', 'image/png').expect(400);
      await upload(teacher, PNG, 'anh.png', 'image/jpeg').expect(400); // khai sai loại
      await upload(teacher, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'a.svg', 'image/svg+xml').expect(400);
      await upload(teacher, Buffer.from('<?php echo 1;'), 'a.php', 'application/x-php').expect(400);
      await teacher.post('/media').expect(400); // không có file
    });

    it('ảnh quá dung lượng (5 MB) bị từ chối', async () => {
      const teacher = await loginAs(TEACHER);
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
      await upload(teacher, big, 'lon.png', 'image/png').expect(413);
    });

    it('không đăng nhập hoặc không có quyền thì không tải lên được; tên file lạ → 404', async () => {
      await request(app.getHttpServer())
        .post('/media')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .expect(401);
      await request(app.getHttpServer()).get('/media/files/..%2F.env').expect(404);
      await request(app.getHttpServer()).get('/media/files/khong-co.png').expect(404);
      await request(app.getHttpServer())
        .get('/media/files/00000000-0000-0000-0000-000000000000.png')
        .expect(404);
    });
  });
});
