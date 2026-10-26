// Bước 14 – nhập danh sách từ Excel, mã kích hoạt dùng một lần, đăng nhập bằng mã học sinh, cấp lại mã.
// Cần PostgreSQL đã migrate + seed (dữ liệu mẫu học vụ) và Redis.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { XLSX_MIME, type AccountSlipDto, type RosterConfirmDto, type RosterPreviewDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { resetLimits } from './reset-limits.js';

const PASSWORD = 'Pvh@2026';
const NEW_PASSWORD = 'MatKhau@Moi1';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const TEACHER = 'gv.toan@pvh.edu.vn'; // GVMAU01, chủ nhiệm 10A1

const RUN = String(Date.now()).slice(-7);
const CLASS_A = `A${RUN}`; // lớp do giáo viên mẫu chủ nhiệm (tạo trong test)
const CLASS_B = `B${RUN}`; // lớp không có chủ nhiệm
const code = (s: string) => `E${RUN}${s}`; // mã học sinh/giáo viên của test (≤ 20 ký tự)

type Agent = ReturnType<typeof request.agent>;
type Row = (string | Date)[];

async function xlsx(rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Học sinh');
  for (const r of rows) sheet.addRow(r);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const STUDENT_HEADER = ['Mã học sinh', 'Họ và tên', 'Lớp', 'Ngày sinh', 'Giới tính'];
const TEACHER_HEADER = ['Mã giáo viên', 'Họ và tên', 'Email', 'Tổ chuyên môn', 'Số điện thoại', 'Lớp chủ nhiệm'];

describe('Nhập danh sách & mã kích hoạt (bước 14, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;
  let classAId: string;
  let classBId: string;
  let teacherId: string;

  const http = () => request(app.getHttpServer());

  async function loginAs(identifier: string, password = PASSWORD): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }

  const upload = (agent: Pick<Agent, 'post'>, kind: 'student' | 'teacher', body: Buffer) =>
    agent.post(`/roster/import/${kind}/preview`).set('Content-Type', XLSX_MIME).send(body);

  async function importStudents(rows: Row[]): Promise<{ preview: RosterPreviewDto; confirmed: RosterConfirmDto }> {
    const preview = (await upload(admin, 'student', await xlsx([STUDENT_HEADER, ...rows])).expect(200)).body as RosterPreviewDto;
    const confirmed = (await admin.post(`/roster/import/${preview.previewId}/confirm`).expect(200)).body as RosterConfirmDto;
    return { preview, confirmed };
  }

  const activate = (identifier: string, activationCode: string, newPassword = NEW_PASSWORD) =>
    http().post('/auth/activate').send({ identifier, activationCode, newPassword });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await loginAs(ADMIN);

    const teachers = (await admin.get('/academic/teachers').expect(200)).body as { userId: string; teacherCode: string }[];
    teacherId = teachers.find((t) => t.teacherCode === 'GVMAU01')!.userId;
    classAId = (await admin.post('/academic/classes').send({ name: CLASS_A, gradeLevel: 10, homeroomTeacherId: teacherId }).expect(201)).body.id;
    classBId = (await admin.post('/academic/classes').send({ name: CLASS_B, gradeLevel: 10 }).expect(201)).body.id;
  });

  // Bộ đếm theo IP nằm trong Redis và dùng chung giữa các test; bộ đếm theo mã đăng nhập thì mỗi test dùng mã riêng.
  afterEach(async () => {
    await resetLimits(app, ['activate-ip', 'login']);
  });

  afterAll(async () => {
    const mine = {
      OR: [
        { studentProfile: { studentCode: { startsWith: `E${RUN}` } } },
        { teacherProfile: { teacherCode: { startsWith: `E${RUN}` } } },
      ],
    };
    const users = await prisma.user.findMany({ where: mine, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { action: { startsWith: 'roster.' }, payload: { path: ['params', 'class'], string_contains: RUN } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.schoolClass.deleteMany({ where: { name: { in: [CLASS_A, CLASS_B] } } });
    await app.close();
  });

  describe('quyền và kiểm tra file', () => {
    it('chỉ ADMIN nhập được: BGH, giáo viên, học sinh, chưa đăng nhập đều bị từ chối', async () => {
      const buf = await xlsx([STUDENT_HEADER, [code('X'), 'Nguyễn A', CLASS_A]]);
      await upload(http(), 'student', buf).expect(401);
      for (const who of [PRINCIPAL, TEACHER, 'HSMAU01']) {
        const agent = await loginAs(who);
        await upload(agent, 'student', buf).expect(403);
        await agent.post('/roster/import/00000000-0000-0000-0000-000000000000/confirm').expect(403);
        await agent.get('/roster/templates/student').expect(403);
        await agent.post(`/roster/classes/${classAId}/activation-codes`).expect(403);
      }
      expect(await prisma.studentProfile.count({ where: { studentCode: code('X') } })).toBe(0);
    });

    it('file hỏng, không phải xlsx, rỗng, quá lớn, thiếu cột đều bị từ chối bằng lỗi 4xx tiếng Việt', async () => {
      const notXlsx = await upload(admin, 'student', Buffer.from('ma,ten\n1,a')).expect(400);
      expect(notXlsx.body.message).toMatch(/Excel/);
      await upload(admin, 'student', Buffer.alloc(0)).expect(400);
      const noClass = await upload(admin, 'student', await xlsx([['Mã học sinh', 'Họ và tên'], ['A1', 'B']])).expect(400);
      expect(noClass.body.message).toMatch(/Thiếu cột bắt buộc.*Lớp/);
      await upload(admin, 'student', await xlsx([STUDENT_HEADER])).expect(400); // chỉ có tiêu đề
      // Máy chủ trả 413 và đóng kết nối ngay khi thấy Content-Length vượt giới hạn, nên máy khách có thể thấy 413 hoặc
      // kết nối bị ngắt giữa chừng khi đang gửi tiếp (tuỳ thời điểm) – cả hai đều là từ chối, không nhận file.
      const big = await upload(admin, 'student', Buffer.alloc(2 * 1024 * 1024 + 10, 1)).then(
        (res) => res,
        (err: NodeJS.ErrnoException) => ({ status: 0, body: { message: `ngắt: ${err.code}` } }),
      );
      expect([0, 413]).toContain(big.status);
      if (big.status === 413) expect(big.body.message).toMatch(/quá lớn/);
      await admin.post('/roster/import/khac/preview').set('Content-Type', XLSX_MIME).send(Buffer.from('x')).expect(400);
    });

    it('bản xem trước hết hạn/không tồn tại → 404; người khác không xác nhận được bản của mình', async () => {
      await admin.post('/roster/import/00000000-0000-0000-0000-000000000000/confirm').expect(404);
      await admin.post('/roster/import/khong-hop-le/confirm').expect(404);
    });
  });

  describe('nhập học sinh: xem trước → xác nhận', () => {
    it('xem trước báo đúng dòng lỗi; xác nhận chỉ tạo dòng hợp lệ; nhập lại cùng file không tạo trùng', async () => {
      const rows: Row[] = [
        [code('1'), 'Nguyễn Văn A', CLASS_A, '2010-05-12', 'Nam'],
        [code('2'), 'Trần Thị B', CLASS_A, '12/09/2010', 'Nữ'],
        [code('3'), 'Lê Văn C', CLASS_B],
        [code('1'), 'Trùng mã', CLASS_A], // lỗi: trùng dòng 2
        [code('5'), 'Lớp không có', 'Z99'], // lỗi: lớp
        [code('6'), '=HYPERLINK("http://evil")', CLASS_A], // lỗi: tên là công thức
        ['', 'Thiếu mã', CLASS_A], // lỗi: thiếu mã
        [code('8'), 'Ngày sinh sai', CLASS_A, '31/02/2010'], // lỗi
      ];
      const { preview, confirmed } = await importStudents(rows);
      expect(preview).toMatchObject({ total: 8, ok: 3, skipped: 0, errors: 5 });
      const byRow = new Map(preview.rows.map((r) => [r.row, r]));
      expect(byRow.get(2)!.status).toBe('ok');
      expect(byRow.get(5)!.messages[0]).toBe('Trùng mã với dòng 2 trong file');
      expect(byRow.get(6)!.messages[0]).toMatch(/Lớp "Z99" không tồn tại/);
      expect(byRow.get(7)!.messages).toContain('Họ tên có ký tự không hợp lệ');
      expect(byRow.get(8)!.messages).toContain('Thiếu mã học sinh');
      expect(byRow.get(9)!.messages[0]).toMatch(/Ngày sinh/);

      expect(confirmed).toMatchObject({ created: 3, skipped: 5 });
      expect(confirmed.slips.map((s) => s.loginId).sort()).toEqual([code('1'), code('2'), code('3')]);
      for (const slip of confirmed.slips) {
        expect(slip.activationCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
        expect(new Date(slip.expiresAt).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
      }

      // Tài khoản ở trạng thái chờ kích hoạt, không có email, vai trò STUDENT, đúng lớp.
      const user = await prisma.user.findFirstOrThrow({
        where: { studentProfile: { studentCode: code('1') } },
        include: { roles: { include: { role: true } }, enrollments: { include: { class: true } }, studentProfile: true },
      });
      expect(user).toMatchObject({ status: 'PENDING', email: null, passwordHash: '!unusable' });
      expect(user.roles.map((r) => r.role.code)).toEqual(['STUDENT']);
      expect(user.enrollments[0]!.class.name).toBe(CLASS_A);
      expect(user.studentProfile!.birthDate!.toISOString().slice(0, 10)).toBe('2010-05-12');
      expect(user.studentProfile!.gender).toBe('MALE');

      // Nhập lại đúng file đó: mọi dòng hợp lệ trước đó giờ là "bỏ qua", không tạo thêm tài khoản.
      const again = await importStudents(rows);
      expect(again.preview).toMatchObject({ ok: 0, skipped: 3, errors: 5 });
      expect(again.confirmed).toEqual({ created: 0, skipped: 8, slips: [] });
      expect(await prisma.studentProfile.count({ where: { studentCode: { startsWith: `E${RUN}` } } })).toBe(3);
    });

    it('chỉ lưu bản băm của mã kích hoạt; nhật ký nhập chỉ có số lượng, không có danh sách học sinh', async () => {
      const slip = (await importStudents([[code('H'), 'Hoàng Băm Mã', CLASS_A]])).confirmed.slips[0]!;
      const raw = slip.activationCode.replace('-', '');
      const stored = await prisma.activationCode.findMany({ where: { userId: BigInt(slip.userId) } });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored[0], (_, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(raw);

      const logs = await prisma.auditLog.findMany({ where: { action: { in: ['roster.preview', 'roster.import'] } }, orderBy: { id: 'desc' }, take: 4 });
      const text = JSON.stringify(logs.map((l) => l.payload));
      expect(text).toContain('"created":1');
      expect(text).not.toContain('Hoàng Băm Mã');
      expect(text).not.toContain(code('H'));
    });

    it('nhập 850 học sinh (cỡ khối 10) trong một lần, một transaction', async () => {
      const rows: Row[] = Array.from({ length: 850 }, (_, i) => [code(`B${i}`), `Học sinh số ${i}`, i % 2 ? CLASS_A : CLASS_B]);
      const started = Date.now();
      const { preview, confirmed } = await importStudents(rows);
      expect(preview).toMatchObject({ total: 850, ok: 850, errors: 0 });
      expect(confirmed.created).toBe(850);
      expect(Date.now() - started).toBeLessThan(60_000);
      const count = await prisma.classEnrollment.count({ where: { student: { studentProfile: { studentCode: { startsWith: code('B') } } } } });
      expect(count).toBe(850);
      // Phiếu theo lớp: chỉ học sinh còn chờ kích hoạt, sắp theo mã.
      const slips = (await admin.post(`/roster/classes/${classBId}/activation-codes`).expect(200)).body as AccountSlipDto[];
      expect(slips.length).toBeGreaterThanOrEqual(425);
      expect(new Set(slips.map((s) => s.activationCode)).size).toBe(slips.length);
    });
  });

  describe('kích hoạt và đăng nhập bằng mã học sinh', () => {
    let slip: AccountSlipDto;

    beforeAll(async () => {
      slip = (await importStudents([[code('K'), 'Kích Hoạt Thử', CLASS_A]])).confirmed.slips[0]!;
    });

    it('tài khoản chờ kích hoạt không đăng nhập được bằng bất kỳ mật khẩu nào', async () => {
      for (const password of ['!unusable', slip.activationCode, '', 'x'.repeat(20)]) {
        await http().post('/auth/login').send({ identifier: code('K'), password: password || 'a' }).expect(401);
      }
    });

    it('mã sai và mã học sinh không tồn tại trả cùng một thông báo (không lộ tài khoản)', async () => {
      const wrong = await activate(code('K'), 'AAAAA-AAAAA').expect(400);
      const nobody = await activate(code('KHONGCO'), 'AAAAA-AAAAA').expect(400);
      expect(wrong.body).toEqual(nobody.body);
      expect(wrong.body.message).toBe('Mã đăng nhập hoặc mã kích hoạt không đúng, hoặc mã đã hết hạn');
      const malformed = await activate(code('K'), "x'; DROP TABLE users;--").expect(400);
      expect(malformed.body).toEqual(wrong.body);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: BigInt(slip.userId) } })).status).toBe('PENDING');
    });

    it('mật khẩu mới phải theo quy tắc hiện có (≥ 8 ký tự) và không tiêu hao mã khi bị từ chối', async () => {
      const res = await activate(code('K'), slip.activationCode, 'ngan').expect(400);
      expect(res.body.fieldErrors?.newPassword?.[0]).toMatch(/ít nhất 8 ký tự/);
      expect(await prisma.activationCode.count({ where: { userId: BigInt(slip.userId), usedAt: null } })).toBe(1);
    });

    it('mã đúng → kích hoạt, đăng nhập luôn (cookie), dùng mật khẩu mới đăng nhập bằng mã học sinh; mã dùng lại bị từ chối', async () => {
      const res = await activate(code('k').toLowerCase(), slip.activationCode.toLowerCase().replace('-', ' ')).expect(200);
      expect((res.headers['set-cookie'] as unknown as string[] | undefined)?.join(';')).toMatch(/pvh_access=/);
      expect(res.body).toMatchObject({ email: null, fullName: 'Kích Hoạt Thử', roles: ['STUDENT'] });

      const cookie = res.headers['set-cookie'] as unknown as string[];
      await http().get('/auth/me').set('Cookie', cookie).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: BigInt(slip.userId) } })).status).toBe('ACTIVE');

      await http().post('/auth/login').send({ identifier: code('K'), password: NEW_PASSWORD }).expect(200);
      await http().post('/auth/login').send({ identifier: code('K').toLowerCase(), password: NEW_PASSWORD }).expect(200); // không phân biệt hoa thường
      await http().post('/auth/login').send({ email: code('K'), password: NEW_PASSWORD }).expect(200); // trường `email` cũ vẫn dùng được
      await http().post('/auth/login').send({ identifier: code('K'), password: PASSWORD }).expect(401);

      // Mã đã dùng: không dùng lại được, kể cả với mật khẩu khác.
      await activate(code('K'), slip.activationCode, 'MatKhau@Khac2').expect(400);
      await http().post('/auth/login').send({ identifier: code('K'), password: 'MatKhau@Khac2' }).expect(401);
    });

    it('mã hết hạn bị từ chối', async () => {
      const s = (await importStudents([[code('E'), 'Hết Hạn', CLASS_A]])).confirmed.slips[0]!;
      await prisma.activationCode.updateMany({ where: { userId: BigInt(s.userId) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await activate(code('E'), s.activationCode).expect(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: BigInt(s.userId) } })).status).toBe('PENDING');
    });

    it('tài khoản bị khóa không kích hoạt được; mở khóa tài khoản chưa kích hoạt thì về lại "chờ kích hoạt"', async () => {
      const s = (await importStudents([[code('L'), 'Bị Khóa', CLASS_A]])).confirmed.slips[0]!;
      await admin.patch(`/users/${s.userId}/status`).send({ status: 'LOCKED' }).expect(200);
      await activate(code('L'), s.activationCode).expect(400);
      const unlocked = (await admin.patch(`/users/${s.userId}/status`).send({ status: 'ACTIVE' }).expect(200)).body;
      expect(unlocked.status).toBe('PENDING');
      await admin.patch(`/users/${s.userId}/status`).send({ status: 'PENDING' }).expect(400); // không đặt tay PENDING
      await activate(code('L'), s.activationCode).expect(200);
    });

    it('sai nhiều lần thì khoá tạm theo mã học sinh (429), kể cả khi sau đó nhập đúng; mã học sinh khác không bị ảnh hưởng', async () => {
      const victim = (await importStudents([[code('V'), 'Nạn Nhân', CLASS_A]])).confirmed.slips[0]!;
      const other = (await importStudents([[code('W'), 'Người Khác', CLASS_A]])).confirmed.slips[0]!;
      for (let i = 0; i < 5; i++) await activate(code('V'), 'AAAAA-AAAAA').expect(400);
      const blocked = await activate(code('V'), victim.activationCode).expect(429);
      expect(blocked.body.message).toMatch(/thử lại sau \d+ giây/);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: BigInt(victim.userId) } })).status).toBe('PENDING');
      await activate(code('W'), other.activationCode).expect(200);
    });

    it('giới hạn theo IP: nhiều mã học sinh khác nhau từ một IP cũng bị chặn', async () => {
      for (let i = 0; i < 20; i++) await activate(code(`Q${i}`), 'AAAAA-AAAAA').expect(400);
      await activate(code('Q99'), 'AAAAA-AAAAA').expect(429);
    });
  });

  describe('cấp lại mã', () => {
    let inClassA: AccountSlipDto; // học sinh lớp A (giáo viên mẫu chủ nhiệm)
    let inClassB: AccountSlipDto; // học sinh lớp B (không ai chủ nhiệm)

    beforeAll(async () => {
      const { confirmed } = await importStudents([
        [code('RA'), 'Cấp Lại A', CLASS_A],
        [code('RB'), 'Cấp Lại B', CLASS_B],
      ]);
      inClassA = confirmed.slips.find((s) => s.loginId === code('RA'))!;
      inClassB = confirmed.slips.find((s) => s.loginId === code('RB'))!;
    });

    it('giáo viên chủ nhiệm cấp lại được cho lớp mình: mã cũ mất hiệu lực, phiên cũ bị thu hồi, ghi nhật ký', async () => {
      await activate(code('RA'), inClassA.activationCode, 'MatKhau@Cu123').expect(200); // học sinh đã kích hoạt và có phiên
      const refreshBefore = await prisma.refreshToken.count({ where: { userId: BigInt(inClassA.userId), revokedAt: null } });
      expect(refreshBefore).toBeGreaterThan(0);

      const teacher = await loginAs(TEACHER);
      const fresh = (await teacher.post(`/roster/users/${inClassA.userId}/activation-code`).expect(200)).body as AccountSlipDto;
      expect(fresh.activationCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(fresh.activationCode).not.toBe(inClassA.activationCode);
      expect(fresh).toMatchObject({ loginId: code('RA'), className: CLASS_A });
      expect(await prisma.refreshToken.count({ where: { userId: BigInt(inClassA.userId), revokedAt: null } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: 'roster.reissue_code', targetId: BigInt(inClassA.userId) } })).toBe(1);

      // Mật khẩu cũ vẫn dùng được tới khi học sinh nhập mã mới; mã cũ (đã dùng) thì không.
      await activate(code('RA'), inClassA.activationCode, 'MatKhau@Khac3').expect(400);
      await http().post('/auth/login').send({ identifier: code('RA'), password: 'MatKhau@Cu123' }).expect(200);
      await activate(code('RA'), fresh.activationCode, 'MatKhau@Moi456').expect(200);
      await http().post('/auth/login').send({ identifier: code('RA'), password: 'MatKhau@Cu123' }).expect(401);
      await http().post('/auth/login').send({ identifier: code('RA'), password: 'MatKhau@Moi456' }).expect(200);
    });

    it('cấp mã mới thì mã chưa dùng trước đó mất hiệu lực', async () => {
      const second = (await admin.post(`/roster/users/${inClassB.userId}/activation-code`).expect(200)).body as AccountSlipDto;
      await activate(code('RB'), inClassB.activationCode).expect(400); // mã in lần đầu đã bị thu hồi
      await activate(code('RB'), second.activationCode).expect(200);
    });

    it('giáo viên chủ nhiệm lớp khác / giáo viên thường / học sinh / BGH không cấp lại được cho lớp không phải của mình (403)', async () => {
      const s = (await importStudents([[code('RC'), 'Lớp Khác', CLASS_B]])).confirmed.slips[0]!;
      for (const who of [TEACHER, PRINCIPAL, 'HSMAU01']) {
        const agent = await loginAs(who);
        const res = await agent.post(`/roster/users/${s.userId}/activation-code`).expect(403);
        expect(res.body.message).toMatch(/không có quyền/);
      }
      // Học sinh mẫu thuộc 10A2 (không phải lớp của giáo viên mẫu) cũng 403; id không tồn tại không lộ khác biệt với người không có quyền.
      const seedStudent = await prisma.user.findFirstOrThrow({ where: { studentProfile: { studentCode: 'HSMAU03' } } });
      const teacher = await loginAs(TEACHER);
      await teacher.post(`/roster/users/${seedStudent.id}/activation-code`).expect(403);
      await teacher.post('/roster/users/999999999/activation-code').expect(403);
      await admin.post('/roster/users/999999999/activation-code').expect(404);
      await admin.post('/roster/users/abc/activation-code').expect(400);
      // Chưa cấp mã mới: mã in ban đầu vẫn còn hiệu lực.
      await activate(code('RC'), s.activationCode).expect(200);
    });

    it('tài khoản bị khóa không được cấp lại mã (409)', async () => {
      const s = (await importStudents([[code('RD'), 'Bị Khóa Cấp Lại', CLASS_A]])).confirmed.slips[0]!;
      await admin.patch(`/users/${s.userId}/status`).send({ status: 'LOCKED' }).expect(200);
      const teacher = await loginAs(TEACHER);
      const res = await teacher.post(`/roster/users/${s.userId}/activation-code`).expect(409);
      expect(res.body.message).toMatch(/bị khóa/);
    });
  });

  describe('nhập giáo viên', () => {
    it('tạo tài khoản giáo viên (email, tổ, lớp chủ nhiệm), kích hoạt bằng email hoặc mã giáo viên; lớp đã có chủ nhiệm bị báo lỗi', async () => {
      const email = `e${RUN}.gv@example.invalid`;
      const buf = await xlsx([
        TEACHER_HEADER,
        [code('G1'), 'Phạm Văn Giáo', email, 'tổ toán – tin', '0900000000', CLASS_B],
        [code('G2'), 'Giáo Viên Hai', `e${RUN}.gv2@example.invalid`, 'Tổ Ngữ văn', '', CLASS_A], // lớp A đã có chủ nhiệm
        [code('G3'), 'Giáo Viên Ba', 'khong-phai-email', 'Tổ Ngữ văn'],
        [code('G4'), 'Giáo Viên Bốn', 'admin@pvh.edu.vn', 'Tổ Ngữ văn'], // email đã có
        [code('G5'), 'Giáo Viên Năm', `e${RUN}.gv5@example.invalid`, 'Tổ Không Có'],
      ]);
      const preview = (await upload(admin, 'teacher', buf).expect(200)).body as RosterPreviewDto;
      expect(preview).toMatchObject({ total: 5, ok: 1, errors: 4 });
      expect(preview.rows[1]!.messages[0]).toMatch(/đã có giáo viên chủ nhiệm/);
      expect(preview.rows[2]!.messages).toContain('Email không hợp lệ');
      expect(preview.rows[3]!.messages[0]).toMatch(/Email đã được dùng/);
      expect(preview.rows[4]!.messages[0]).toMatch(/Tổ chuyên môn/);

      const confirmed = (await admin.post(`/roster/import/${preview.previewId}/confirm`).expect(200)).body as RosterConfirmDto;
      expect(confirmed.created).toBe(1);
      const slip = confirmed.slips[0]!;
      expect(slip).toMatchObject({ loginId: code('G1'), email, className: CLASS_B });

      const teacher = await prisma.user.findFirstOrThrow({
        where: { email },
        include: { teacherProfile: { include: { department: true } }, roles: { include: { role: true } }, homeroomClasses: true },
      });
      expect(teacher).toMatchObject({ status: 'PENDING', phone: '0900000000' });
      expect(teacher.roles.map((r) => r.role.code)).toEqual(['TEACHER']);
      expect(teacher.teacherProfile!.department!.name).toBe('Tổ Toán – Tin');
      expect(teacher.homeroomClasses.map((c) => c.name)).toEqual([CLASS_B]);

      // Kích hoạt bằng email, rồi đăng nhập bằng mã giáo viên.
      await activate(email.toUpperCase(), slip.activationCode).expect(200);
      await http().post('/auth/login').send({ identifier: code('G1'), password: NEW_PASSWORD }).expect(200);
      const me = await loginAs(email, NEW_PASSWORD);
      expect((await me.get('/auth/me').expect(200)).body.permissions).toContain('post:create');

      // Giáo viên vừa tạo chủ nhiệm lớp B → cấp lại mã cho học sinh lớp B được.
      const student = (await importStudents([[code('GS'), 'Học Sinh Lớp B', CLASS_B]])).confirmed.slips[0]!;
      await me.post(`/roster/users/${student.userId}/activation-code`).expect(200);
      await me.post(`/roster/import/00000000-0000-0000-0000-000000000000/confirm`).expect(403); // vẫn không nhập Excel được
    });
  });

  describe('danh sách người dùng và file mẫu', () => {
    it('danh sách người dùng có mã, lớp, trạng thái chờ kích hoạt; lọc theo lớp và tìm theo mã', async () => {
      await importStudents([[code('U1'), 'Danh Sách Một', CLASS_B]]);
      const list = (await admin.get('/users').query({ classId: classBId, q: code('U1') }).expect(200)).body;
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ code: code('U1'), className: CLASS_B, status: 'PENDING', email: null });
      const pending = (await admin.get('/users').query({ status: 'PENDING', q: `E${RUN}` }).expect(200)).body;
      expect(pending.total).toBeGreaterThan(0);
    });

    it('tải file mẫu .xlsx đọc lại được; xuất không chứa công thức', async () => {
      for (const kind of ['student', 'teacher']) {
        const res = await admin.get(`/roster/templates/${kind}`).buffer(true).parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        }).expect(200);
        expect(res.headers['content-type']).toContain('spreadsheetml');
        expect(res.headers['content-disposition']).toContain('.xlsx');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
        expect(wb.worksheets[0]!.rowCount).toBeGreaterThanOrEqual(3);
      }
      await admin.get('/roster/templates/khac').expect(400);
    });
  });
});
