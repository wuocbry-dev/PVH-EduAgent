// Bước 21 – thư viện số: kho riêng tư (driver local, URL đọc hết hạn ngắn, Range), nguồn/giấy phép bắt buộc, nhận dạng
// file, luồng gửi duyệt → duyệt/từ chối, đối tượng xem (toàn trường/khối/lớp/chỉ giáo viên), tìm không dấu, yêu thích,
// đọc tiếp, thống kê lượt, tool Agent. Cần PostgreSQL đã migrate + seed và Redis. Dữ liệu test mang hậu tố RUN và được dọn.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LIBRARY_ACCESS_PER_MINUTE, type LibraryAccessDto, type LibraryItemDto, type LibraryListDto, type LibraryStatsDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/features/auth/password.js';
import { LibraryAgentTools } from './../src/features/library/library.agent-tools.js';
import { UsersService } from './../src/features/users/users.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { RateLimitService } from './../src/infrastructure/rate-limit/rate-limit.service.js';
import { LocalPrivateStorageService } from './../src/infrastructure/storage/local-private-storage.service.js';
import { PrivateStorageService } from './../src/infrastructure/storage/private-storage.service.js';
import { StorageService } from './../src/infrastructure/storage/storage.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const LIBRARIAN = 'thuthu@pvh.edu.vn';

const RUN = String(Date.now()).slice(-7);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n', 'latin1'), Buffer.alloc(2048, 0x20), Buffer.from('\n%%EOF', 'latin1')]);
const MP3 = Buffer.concat([Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000', 'latin1'), Buffer.alloc(4096, 0x55)]);
const FAKE_PDF = Buffer.concat([Buffer.from('MZ\u0090\u0000', 'latin1'), Buffer.alloc(1024, 0x41)]); // .exe đổi đuôi .pdf
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Agent = ReturnType<typeof request.agent>;
type Tool = { name: string; handler: (args: unknown, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };

describe('Thư viện số (bước 21, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let files: LocalPrivateStorageService;
  let limits: RateLimitService;
  let admin: Agent;
  let principal: Agent;
  let editor: Agent;
  let librarian: Agent;
  let teacher: Agent;
  let hs10: Agent;
  let hs11: Agent;
  let categoryId: string;
  let yearId: bigint;
  const classes: bigint[] = [];
  const userIds: bigint[] = [];
  const emails: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  async function loginAs(identifier: string): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password: PASSWORD }).expect(200);
    return agent;
  }

  async function makeUser(role: 'TEACHER' | 'STUDENT', key: string, classId?: bigint): Promise<string> {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const email = `e21.${key}${RUN}@pvh.edu.vn`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `${role} ${key}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: { roleId: r.id } },
        ...(classId ? { enrollments: { create: { classId, schoolYearId: yearId } } } : {}),
      },
    });
    userIds.push(user.id);
    emails[key] = email;
    return email;
  }

  const base = (title: string, over: Record<string, unknown> = {}) => ({
    title: `${title} ${RUN}`,
    kind: 'PDF',
    categoryId,
    source: 'SELF_AUTHORED',
    license: 'Tài liệu do tổ chuyên môn biên soạn, dùng nội bộ',
    ...over,
  });

  async function upload(agent: Agent, id: string, body: Buffer, mimeType: string) {
    const p = (await agent.post(`/library/items/${id}/upload`).send({ target: 'file', mimeType, size: body.length }).expect(200)).body;
    expect(p.uploadUrl).toMatch(/^\/library\/local-upload\/\d+\?token=/);
    await http().put(p.uploadUrl).set(p.headers).send(body).expect(204);
    return agent.post(`/library/items/${id}/upload/complete`).send({ target: 'file' });
  }

  async function publish(owner: Agent, title: string, over: Record<string, unknown> = {}, content = PDF, mime = 'application/pdf') {
    const item = (await owner.post('/library/items').send(base(title, over)).expect(201)).body as LibraryItemDto;
    expect((await upload(owner, item.id, content, mime)).status).toBe(200);
    await owner.post(`/library/items/${item.id}/submit`).expect(200);
    return (await librarian.post(`/library/items/${item.id}/review`).send({ action: 'approve' }).expect(200)).body as LibraryItemDto;
  }

  const access = (agent: Agent, id: string, download = false) => agent.post(`/library/items/${id}/access`).send({ download });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    limits = app.get(RateLimitService);
    files = app.get(PrivateStorageService) as LocalPrivateStorageService;
    expect(files).toBeInstanceOf(LocalPrivateStorageService); // e2e luôn dùng driver local

    yearId = (await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id;
    categoryId = (await prisma.libraryCategory.findUniqueOrThrow({ where: { slug: 'sach-tham-khao' } })).id.toString();
    for (const [name, level] of [[`L10${RUN}`, 10], [`L11${RUN}`, 11]] as const) {
      const grade = await prisma.grade.findUniqueOrThrow({ where: { level } });
      classes.push((await prisma.schoolClass.create({ data: { name, gradeId: grade.id, schoolYearId: yearId } })).id);
    }
    await makeUser('TEACHER', 'gv');
    await makeUser('STUDENT', 'hs10', classes[0]);
    await makeUser('STUDENT', 'hs11', classes[1]);

    admin = await loginAs(ADMIN);
    principal = await loginAs(PRINCIPAL);
    editor = await loginAs(EDITOR);
    librarian = await loginAs(LIBRARIAN);
    teacher = await loginAs(emails.gv);
    hs10 = await loginAs(emails.hs10);
    hs11 = await loginAs(emails.hs11);
  });

  afterAll(async () => {
    const items = await prisma.libraryItem.findMany({ where: { title: { endsWith: RUN } } });
    for (const i of items) for (const key of [i.fileKey, i.pendingKey]) if (key) await files.delete(key);
    const media = await prisma.media.findMany({ where: { url: { in: items.map((i) => i.coverUrl).filter((u): u is string => !!u) } } });
    for (const m of media) await app.get(StorageService).delete(m.storageKey);
    const librarianId = (await prisma.user.findUniqueOrThrow({ where: { email: LIBRARIAN } })).id;
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { targetType: 'library_item', targetId: { in: items.map((i) => i.id) } },
          { action: { startsWith: 'library.category' }, payload: { path: ['params', 'name'], string_ends_with: RUN } },
          { userId: librarianId, action: 'media.upload', targetId: { in: media.map((m) => m.id) } },
        ],
      },
    });
    await prisma.libraryItem.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
    await prisma.media.deleteMany({ where: { OR: [{ id: { in: media.map((m) => m.id) } }, { uploadedBy: { in: userIds } }] } });
    await prisma.libraryCategory.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classes } } });
    await app.close();
  });

  describe('quyền', () => {
    it('học sinh, ADMIN, biên tập không gửi/duyệt/thống kê được; giáo viên không duyệt được', async () => {
      for (const agent of [hs10, admin, editor]) {
        await agent.post('/library/items').send(base('Không được')).expect(403);
        await agent.get('/library/form-options').expect(403);
        await agent.get('/library/stats').expect(403);
        await agent.get('/library/submissions?scope=all').expect(403);
      }
      await teacher.get('/library/submissions?scope=all').expect(403);
      await teacher.get('/library/stats').expect(403);
      await teacher.post('/library/categories').send({ name: `X ${RUN}` }).expect(403);
      await principal.get('/library/stats').expect(200);
      expect((await librarian.get('/library/form-options').expect(200)).body.canManage).toBe(true);
    });

    it('thủ thư đăng nhập vào cổng /thu-thu (vai trò LIBRARIAN, quyền library:*)', async () => {
      const me = (await librarian.get('/auth/me').expect(200)).body;
      expect(me.roles).toEqual(['LIBRARIAN']);
      expect([...me.permissions].sort((a: string, b: string) => a.localeCompare(b))).toEqual(['library:manage', 'library:submit']);
    });
  });

  describe('gửi tài liệu và duyệt', () => {
    it('thiếu nguồn hoặc giấy phép bị từ chối, kể cả khi chèn thẳng vào CSDL', async () => {
      const { source: _s, ...noSource } = base('Thiếu nguồn');
      await teacher.post('/library/items').send(noSource).expect(400);
      const { license: _l, ...noLicense } = base('Thiếu giấy phép');
      expect(JSON.stringify((await teacher.post('/library/items').send(noLicense).expect(400)).body)).toMatch(/giấy phép/i);
      await teacher.post('/library/items').send(base('Giấy phép ngắn', { license: '  ab ' })).expect(400);
      await expect(
        prisma.libraryItem.create({
          data: {
            title: `CSDL ${RUN}`,
            slug: `csdl-${RUN}`,
            kind: 'PDF',
            categoryId: BigInt(categoryId),
            source: 'LICENSED',
            license: ' ',
            submittedBy: userIds[0],
          },
        }),
      ).rejects.toThrow();
    });

    it('file giả mạo (đuôi .pdf nhưng nội dung khác) bị từ chối và bị xoá khỏi kho', async () => {
      const item = (await teacher.post('/library/items').send(base('Giả mạo')).expect(201)).body as LibraryItemDto;
      // Khai báo loại không hợp với loại tài liệu bị chặn ngay.
      await teacher.post(`/library/items/${item.id}/upload`).send({ target: 'file', mimeType: 'audio/mpeg', size: 10 }).expect(400);
      await teacher.post(`/library/items/${item.id}/upload`).send({ target: 'file', mimeType: 'application/pdf', size: 51 * 1024 * 1024 }).expect(400);
      const res = await upload(teacher, item.id, FAKE_PDF, 'application/pdf');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/không đúng loại/);
      const row = await prisma.libraryItem.findUniqueOrThrow({ where: { id: BigInt(item.id) } });
      expect(row.pendingKey).toBeNull();
      expect(row.fileKey).toBeNull();
      const rejected = await prisma.auditLog.findFirstOrThrow({ where: { action: 'library.file_reject', targetId: BigInt(item.id) } });
      expect(rejected.payload).toMatchObject({ ok: false, params: { reason: 'content_mismatch' } });
      // Chưa có file thì chưa gửi duyệt được.
      await teacher.post(`/library/items/${item.id}/submit`).expect(400);
    });

    it('gửi duyệt → từ chối có lý do → sửa, gửi lại → duyệt đăng; người gửi không sửa được khi đang chờ duyệt', async () => {
      const item = (await teacher.post('/library/items').send(base('Chuyên đề hàm số')).expect(201)).body as LibraryItemDto;
      expect(item.status).toBe('DRAFT');
      expect((await upload(teacher, item.id, PDF, 'application/pdf').then((r) => r.body)).hasFile).toBe(true);
      // Học sinh và người khác không thấy bản nháp.
      await hs10.get(`/library/items/by-slug/${item.slug}`).expect(404);
      await access(hs10, item.id).expect(404);
      await access(teacher, item.id).expect(200); // người gửi xem lại được

      expect((await teacher.post(`/library/items/${item.id}/submit`).expect(200)).body.status).toBe('PENDING_REVIEW');
      await teacher.patch(`/library/items/${item.id}`).send(base('Đổi tên')).expect(409);
      const queue = (await librarian.get('/library/submissions?scope=all&status=PENDING_REVIEW').expect(200)).body as LibraryItemDto[];
      expect(queue.map((q) => q.id)).toContain(item.id);

      await librarian.post(`/library/items/${item.id}/review`).send({ action: 'reject' }).expect(400);
      const rejected = (await librarian.post(`/library/items/${item.id}/review`).send({ action: 'reject', reason: 'Thiếu trang bìa' }).expect(200))
        .body as LibraryItemDto;
      expect(rejected).toMatchObject({ status: 'REJECTED', rejectReason: 'Thiếu trang bìa' });
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: userIds[0], title: 'Tài liệu bị từ chối' } });
      expect(note.body).toContain('Thiếu trang bìa');

      await teacher.patch(`/library/items/${item.id}`).send(base('Chuyên đề hàm số', { description: 'Đã bổ sung' })).expect(200);
      await teacher.post(`/library/items/${item.id}/submit`).expect(200);
      await teacher.post(`/library/items/${item.id}/review`).send({ action: 'approve' }).expect(403);
      const approved = (await principal.post(`/library/items/${item.id}/review`).send({ action: 'approve' }).expect(200)).body as LibraryItemDto;
      expect(approved).toMatchObject({ status: 'PUBLISHED', reviewedByName: 'Nguyễn Duy Bình', rejectReason: null });
      expect(approved.publishedAt).not.toBeNull();
      await librarian.post(`/library/items/${item.id}/review`).send({ action: 'approve' }).expect(409); // duyệt lần hai
      const actions = await prisma.auditLog.findMany({ where: { targetType: 'library_item', targetId: BigInt(item.id) }, select: { action: true } });
      expect(actions.map((a) => a.action)).toEqual(
        expect.arrayContaining(['library.create', 'library.file_upload', 'library.submit', 'library.reject', 'library.approve']),
      );

      // Ẩn thì biến khỏi danh mục; hiện lại thì có lại.
      await librarian.post(`/library/items/${item.id}/review`).send({ action: 'archive' }).expect(200);
      await http().get(`/public/library/items/${item.slug}`).expect(404);
      await access(hs10, item.id).expect(404);
      await librarian.post(`/library/items/${item.id}/review`).send({ action: 'restore' }).expect(200);
      await http().get(`/public/library/items/${item.slug}`).expect(200);
    });

    it('thủ thư (không có quyền bài viết) tải ảnh bìa qua kho công khai', async () => {
      const item = (await librarian.post('/library/items').send(base('Có bìa')).expect(201)).body as LibraryItemDto;
      await librarian.post(`/library/items/${item.id}/upload`).send({ target: 'cover', mimeType: 'application/pdf', size: 10 }).expect(400);
      const p = (await librarian.post(`/library/items/${item.id}/upload`).send({ target: 'cover', mimeType: 'image/png', size: PNG.length }).expect(200))
        .body;
      await http().put(p.uploadUrl).set(p.headers).send(PNG).expect(204);
      const done = (await librarian.post(`/library/items/${item.id}/upload/complete`).send({ target: 'cover', uploadId: p.uploadId }).expect(200))
        .body as LibraryItemDto;
      expect(done.coverUrl).toMatch(/^\/media\/files\//);
    });
  });

  describe('đối tượng xem và URL đọc', () => {
    let all: LibraryItemDto;
    let grade10: LibraryItemDto;
    let class11: LibraryItemDto;
    let teachersOnly: LibraryItemDto;
    let audio: LibraryItemDto;

    beforeAll(async () => {
      all = await publish(teacher, 'Toán hình học không gian', { allowDownload: true, gradeLevel: 11 });
      grade10 = await publish(teacher, 'Ôn tập khối mười', { audience: 'GRADE', gradeLevels: [10] });
      class11 = await publish(librarian, 'Riêng lớp mười một', { audience: 'CLASS', classIds: [classes[1].toString()] });
      teachersOnly = await publish(teacher, 'Đề kiểm tra giữa kỳ', { audience: 'TEACHERS_ONLY' });
      audio = await publish(librarian, 'Sách nói Dế Mèn', { kind: 'AUDIO' }, MP3, 'audio/mpeg');
    });

    it('khách xem được danh mục và thẻ toàn trường, không thấy tài liệu theo khối/lớp/chỉ giáo viên, không lấy được URL đọc', async () => {
      const list = (await http().get('/public/library/items').query({ q: RUN, pageSize: 48 }).expect(200)).body as LibraryListDto;
      const titles = list.items.map((i) => i.title);
      expect(titles).toContain(all.title);
      for (const hidden of [grade10, class11, teachersOnly]) {
        expect(titles).not.toContain(hidden.title);
        await http().get(`/public/library/items/${hidden.slug}`).expect(404);
      }
      const detail = (await http().get(`/public/library/items/${all.slug}`).expect(200)).body as LibraryItemDto;
      expect(JSON.stringify(detail)).not.toMatch(/lib-[0-9a-f-]{36}|token=|submittedByName":"[^"]/);
      await http().post(`/library/items/${all.id}/access`).send({}).expect(401);
      const home = (await http().get('/public/library/home').expect(200)).body;
      expect(home.categories.length).toBeGreaterThanOrEqual(7);
    });

    it('học sinh khối 11 không đọc được tài liệu khối 10 và "chỉ giáo viên"; học sinh khối 10 đọc được tài liệu khối mình', async () => {
      await access(hs11, grade10.id).expect(404);
      await hs11.get(`/library/items/by-slug/${grade10.slug}`).expect(404);
      await access(hs11, teachersOnly.id).expect(404);
      await access(hs10, teachersOnly.id).expect(404);
      await access(hs10, class11.id).expect(404);
      await access(hs11, class11.id).expect(200);
      await access(hs10, grade10.id).expect(200);
      const seen11 = ((await hs11.get('/library/items').query({ q: RUN, pageSize: 48 }).expect(200)).body as LibraryListDto).items.map((i) => i.id);
      expect(seen11).toEqual(expect.arrayContaining([all.id, class11.id, audio.id]));
      expect(seen11).not.toContain(grade10.id);
      expect(seen11).not.toContain(teachersOnly.id);
      // Giáo viên (nhân sự) thấy cả "chỉ giáo viên".
      await access(teacher, teachersOnly.id).expect(200);
      // Đoán id không tồn tại: cùng 404.
      await access(hs10, '999999999').expect(404);
    });

    it('URL đọc hết hạn ngắn, hỗ trợ Range; hết hạn / sai tài liệu thì bị từ chối', async () => {
      const res = (await access(hs10, all.id).expect(200)).body as LibraryAccessDto;
      expect(res.mimeType).toBe('application/pdf');
      expect(new Date(res.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 1000);
      const range = await http().get(res.url).set('Range', 'bytes=0-4').buffer(true).expect(206);
      expect(range.body.toString('latin1')).toBe('%PDF-');
      expect(range.headers['content-range']).toBe(`bytes 0-4/${PDF.length}`);
      expect(range.headers['cache-control']).toBe('private, no-store');
      expect(range.headers['content-disposition']).toBe('inline');

      const key = (await prisma.libraryItem.findUniqueOrThrow({ where: { id: BigInt(all.id) } })).fileKey!;
      const expired = files.signToken({ op: 'get', id: all.id, key, mimeType: 'application/pdf', exp: Math.floor(Date.now() / 1000) - 1 });
      await http().get(`/library/files/${all.id}?token=${expired}`).expect(403);
      const token = new URL(res.url, 'http://x').searchParams.get('token')!;
      await http().get(`/library/files/${grade10.id}?token=${token}`).expect(403); // token của tài liệu khác
      await http().get(`/library/files/${all.id}`).expect(403);

      // MP3 tua được.
      const mp3 = (await access(hs11, audio.id).expect(200)).body as LibraryAccessDto;
      const part = await http().get(mp3.url).set('Range', 'bytes=100-199').buffer(true).expect(206);
      expect(part.body.length).toBe(100);
      expect(part.headers['content-type']).toBe('audio/mpeg');
    });

    it('tải về chỉ khi tài liệu cho phép; URL tải có Content-Disposition attachment và ghi audit (không ghi URL)', async () => {
      await access(hs10, grade10.id, true).expect(403);
      const dl = (await access(hs11, all.id, true).expect(200)).body as LibraryAccessDto;
      const res = await http().get(dl.url).buffer(true).expect(200);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename=".*"; filename\*=UTF-8''/);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'library.download', targetId: BigInt(all.id) } });
      expect(JSON.stringify(log.payload)).not.toMatch(/token|files\//);
    });

    it('tìm không dấu: "toan hinh" ra "Toán hình học"', async () => {
      const found = (await http().get('/public/library/items').query({ q: `toan hinh ${RUN}` }).expect(200)).body as LibraryListDto;
      expect(found.items.map((i) => i.title)).toEqual([all.title]);
      const upper = (await hs11.get('/library/items').query({ q: `TOÁN HÌNH ${RUN}` }).expect(200)).body as LibraryListDto;
      expect(upper.total).toBe(1);
      expect(((await http().get('/public/library/items').query({ q: `vat ly ${RUN}` }).expect(200)).body as LibraryListDto).total).toBe(0);
    });

    it('yêu thích, đọc tiếp và tủ sách; không yêu thích được tài liệu ngoài đối tượng', async () => {
      await hs10.put(`/library/items/${all.id}/favorite`).expect(204);
      await hs10.put(`/library/items/${all.id}/progress`).send({ position: 12 }).expect(204);
      await hs10.put(`/library/items/${grade10.id}/progress`).send({ position: -1 }).expect(400);
      await hs11.put(`/library/items/${grade10.id}/favorite`).expect(404);
      const mine = (await hs10.get('/library/me').expect(200)).body;
      expect(mine.favorites.map((f: { id: string }) => f.id)).toContain(all.id);
      expect(mine.history.find((h: { id: string }) => h.id === all.id)).toMatchObject({ position: 12, favorite: true });
      expect(((await access(hs10, all.id).expect(200)).body as LibraryAccessDto).position).toBe(12);
      expect(((await hs10.get(`/library/items/by-slug/${all.slug}`).expect(200)).body as LibraryItemDto).favorite).toBe(true);
      await hs10.delete(`/library/items/${all.id}/favorite`).expect(204);
      expect((await hs10.get('/library/me').expect(200)).body.favorites).toHaveLength(0);
    });

    it('thống kê lượt: mở lại trong 30 phút chỉ tính một lượt; tài liệu đọc nhiều nhất', async () => {
      const before = (await librarian.get('/library/stats').expect(200)).body as LibraryStatsDto;
      const viewsBefore = (await prisma.libraryItem.findUniqueOrThrow({ where: { id: BigInt(audio.id) } })).viewCount;
      await access(teacher, audio.id).expect(200);
      await access(teacher, audio.id).expect(200);
      await access(hs10, audio.id).expect(200);
      const after = (await librarian.get('/library/stats').expect(200)).body as LibraryStatsDto;
      expect(after.views.today - before.views.today).toBe(2);
      expect(after.views.total - before.views.total).toBe(2);
      expect(after.views.thisMonth - before.views.thisMonth).toBe(2);
      expect((await prisma.libraryItem.findUniqueOrThrow({ where: { id: BigInt(audio.id) } })).viewCount).toBe(viewsBefore + 2);
      expect(after.items.published).toBeGreaterThanOrEqual(5);
      expect(after.top.length).toBeGreaterThan(0);
    });

    it('tool search_library: chỉ nhân sự, tôn trọng đối tượng xem, không trả URL kho', async () => {
      const tools = app.get(LibraryAgentTools);
      const run = async (email: string, args: Record<string, unknown>) => {
        const user = (await app.get(UsersService).findAuthUserByEmail(email))!;
        const [tool] = tools.buildTools({ user, channel: 'telegram' }) as unknown as Tool[];
        expect(tool.name).toBe('search_library');
        return tool.handler(args, {});
      };
      const denied = await run(emails.hs10, { q: RUN });
      expect(denied.isError).toBe(true);
      const ok = await run(emails.gv, { q: `toan ${RUN}` });
      expect(ok.isError).toBeFalsy();
      const data = JSON.parse(ok.content[0].text);
      expect(data.items).toEqual([expect.objectContaining({ title: all.title, path: `/thu-vien/tai-lieu/${all.slug}` })]);
      const everything = (await run(emails.gv, { q: RUN })).content[0].text;
      expect(everything).toContain(teachersOnly.title);
      expect(everything).not.toMatch(/lib-[0-9a-f-]{36}|token|\/library\/files|r2\.cloudflarestorage/);
    });

    it('vượt giới hạn mở tài liệu trả 429', async () => {
      const user = (await prisma.user.findUniqueOrThrow({ where: { email: emails.hs11 } })).id.toString();
      await limits.reset('library-access', user);
      for (let i = 0; i < LIBRARY_ACCESS_PER_MINUTE; i++) await access(hs11, all.id).expect(200);
      await access(hs11, all.id).expect(429);
      await limits.reset('library-access', user);
    });
  });

  describe('danh mục', () => {
    it('thủ thư tạo/sửa danh mục; danh mục còn tài liệu không xoá được; tối đa hai cấp', async () => {
      await librarian.post('/library/categories').send({ name: `Lịch sử ${RUN}`, slug: `lich-su-${RUN}` }).expect(204);
      const parent = await prisma.libraryCategory.findUniqueOrThrow({ where: { slug: `lich-su-${RUN}` } });
      await librarian.post('/library/categories').send({ name: `Lịch sử ${RUN}`, slug: `lich-su-${RUN}` }).expect(409);
      await librarian.post('/library/categories').send({ name: `Con ${RUN}`, slug: `con-${RUN}`, parentId: parent.id.toString() }).expect(204);
      const child = await prisma.libraryCategory.findUniqueOrThrow({ where: { slug: `con-${RUN}` } });
      await librarian.post('/library/categories').send({ name: `Cháu ${RUN}`, parentId: child.id.toString() }).expect(400);
      await librarian.delete(`/library/categories/${parent.id}`).expect(409); // còn danh mục con
      await librarian.delete(`/library/categories/${categoryId}`).expect(409); // còn tài liệu
      await librarian.patch(`/library/categories/${child.id}`).send({ name: `Con đổi ${RUN}`, slug: `con-${RUN}`, parentId: null }).expect(204);
      await librarian.delete(`/library/categories/${child.id}`).expect(204);
      await librarian.delete(`/library/categories/${parent.id}`).expect(204);
    });
  });
});
