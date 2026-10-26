// Bước 15 – cổng theo vai trò: claim roles trong access token, thu hồi phiên khi đổi vai trò,
// học sinh/giáo viên không gọi được API nhân sự, thông tin học vụ của chính mình, số liệu toàn trường.
// Cần PostgreSQL đã migrate + seed và Redis.
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
const STUDENT = 'HSMAU01'; // lớp 10A1, chủ nhiệm GVMAU01 (seed)

const RUN = String(Date.now()).slice(-7);
const TEMP_EMAIL = `e15.${RUN}@pvh.edu.vn`;

type Agent = ReturnType<typeof request.agent>;

// Đọc payload của JWT (không kiểm chữ ký): chỉ để xem claim.
const claims = (cookies: string[] | string | undefined) => {
  const list = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  const token = /pvh_access=([^;]+)/.exec(list.join(';'))?.[1] ?? '';
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { sub: string; roles?: string[] };
};

describe('Cổng theo vai trò (bước 15, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;

  const http = () => request(app.getHttpServer());

  async function loginAs(identifier: string, password = PASSWORD): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await loginAs(ADMIN);
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: TEMP_EMAIL } });
    if (user) {
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: user.id }, { targetType: 'user', targetId: user.id }] },
      });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  describe('claim roles trong access token (chỉ để web chọn cổng)', () => {
    it('đăng nhập: access token mang đúng vai trò của từng tài khoản', async () => {
      const expected: [string, string[]][] = [
        [ADMIN, ['ADMIN']],
        [PRINCIPAL, ['PRINCIPAL']],
        [EDITOR, ['EDITOR']],
        [TEACHER, ['TEACHER']],
        [STUDENT, ['STUDENT']],
      ];
      for (const [who, roles] of expected) {
        const res = await http().post('/auth/login').send({ identifier: who, password: PASSWORD }).expect(200);
        expect(claims(res.headers['set-cookie']).roles).toEqual(roles);
        expect(res.body.roles).toEqual(roles);
      }
    });

    it('refresh cấp token mới vẫn mang claim roles', async () => {
      const login = await http().post('/auth/login').send({ identifier: PRINCIPAL, password: PASSWORD }).expect(200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      const refreshed = await http().post('/auth/refresh').set('Cookie', cookies).expect(200);
      expect(claims(refreshed.headers['set-cookie']).roles).toEqual(['PRINCIPAL']);
    });

    it('claim chỉ để định tuyến: API vẫn đọc quyền từ CSDL (token có roles ADMIN giả mạo không cấp thêm quyền)', async () => {
      // Token hợp lệ của giáo viên không thể "nâng" thành ADMIN bằng cách sửa payload (chữ ký sẽ sai → 401).
      const login = await http().post('/auth/login').send({ identifier: TEACHER, password: PASSWORD }).expect(200);
      const token = /pvh_access=([^;]+)/.exec((login.headers['set-cookie'] as unknown as string[]).join(';'))![1]!;
      const [h, p, s] = token.split('.');
      const payload = JSON.parse(Buffer.from(p!, 'base64url').toString()) as Record<string, unknown>;
      payload.roles = ['ADMIN'];
      const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
      await http().get('/users').set('Cookie', `pvh_access=${forged}`).expect(401);
      // Token thật của giáo viên: không có quyền quản lý người dùng dù claim nói gì.
      await http().get('/users').set('Cookie', `pvh_access=${token}`).expect(403);
    });
  });

  describe('đổi vai trò thì thu hồi phiên đăng nhập', () => {
    it('đổi vai trò → refresh token cũ không dùng được; chỉ sửa tên thì phiên giữ nguyên', async () => {
      const created = (
        await admin
          .post('/users')
          .send({ email: TEMP_EMAIL, fullName: 'Người thử cổng', password: PASSWORD, roles: ['TEACHER'] })
          .expect(201)
      ).body as { id: string };

      const login = await http().post('/auth/login').send({ identifier: TEMP_EMAIL, password: PASSWORD }).expect(200);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      expect(claims(cookies).roles).toEqual(['TEACHER']);

      // Sửa tên (không đổi vai trò): phiên còn.
      await admin.patch(`/users/${created.id}`).send({ fullName: 'Người thử cổng 2' }).expect(200);
      // Gửi lại đúng vai trò hiện có (thứ tự khác) cũng không phải là thay đổi.
      await admin.patch(`/users/${created.id}`).send({ roles: ['TEACHER'] }).expect(200);
      const stillOk = await http().post('/auth/refresh').set('Cookie', cookies).expect(200);
      const newCookies = stillOk.headers['set-cookie'] as unknown as string[];

      // Đổi vai trò: mọi refresh token bị thu hồi.
      await admin.patch(`/users/${created.id}`).send({ roles: ['EDITOR', 'TEACHER'] }).expect(200);
      await http().post('/auth/refresh').set('Cookie', newCookies).expect(401);
      expect(await prisma.refreshToken.count({ where: { userId: BigInt(created.id), revokedAt: null } })).toBe(0);

      // Đăng nhập lại: claim phản ánh vai trò mới.
      const again = await http().post('/auth/login').send({ identifier: TEMP_EMAIL, password: PASSWORD }).expect(200);
      expect(claims(again.headers['set-cookie']).roles?.sort()).toEqual(['EDITOR', 'TEACHER']);
    });
  });

  describe('học sinh và giáo viên không gọi được API nhân sự', () => {
    // Body hợp lệ để kiểm tra quyền chạy trước khi dữ liệu bị từ chối vì sai định dạng.
    const BODY = {
      name: 'X15',
      gradeLevel: 10,
      title: 'Tiêu đề thử cổng',
      content: 'Nội dung',
      assigneeId: '1',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const STAFF_ONLY: [string, string][] = [
      ['get', '/users'],
      ['get', '/roles'],
      ['get', '/audit-logs'],
      ['get', '/settings'],
      ['get', '/system/status'],
      ['get', '/system/overview'],
      ['get', '/academic/classes'],
      ['get', '/academic/subjects'],
      ['get', '/academic/school-years'],
      ['post', '/academic/classes'],
      ['get', '/roster/templates/student'],
      ['post', '/roster/classes/1/activation-codes'],
      ['get', '/contacts'],
    ];

    it('học sinh: mọi API nhân sự trả 403 (và không có quyền soạn bài, xem việc)', async () => {
      const student = await loginAs(STUDENT);
      for (const [method, path] of [...STAFF_ONLY, ['post', '/posts'], ['get', '/posts/manage'], ['get', '/tasks'], ['post', '/tasks']]) {
        const res = await (student as unknown as Record<string, (p: string) => request.Test>)[method!]!(path!).send(BODY);
        expect(res.status, `${method} ${path}`).toBe(403);
      }
      expect((await student.get('/auth/me').expect(200)).body.permissions).toEqual([]);
    });

    it('giáo viên: API của BGH/quản trị trả 403', async () => {
      const teacher = await loginAs(TEACHER);
      for (const [method, path] of STAFF_ONLY) {
        const res = await (teacher as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send(BODY);
        expect(res.status, `${method} ${path}`).toBe(403);
      }
    });
  });

  describe('GET /academic/me – học vụ của chính mình', () => {
    it('học sinh: mã, lớp, năm học, giáo viên chủ nhiệm; không có lớp chủ nhiệm', async () => {
      const me = (await (await loginAs(STUDENT)).get('/academic/me').expect(200)).body;
      expect(me).toMatchObject({
        studentCode: 'HSMAU01',
        teacherCode: null,
        schoolYearName: '2026-2027',
        className: '10A1',
        homeroomClasses: [],
      });
      expect(me.homeroomTeacherName).toBeTruthy();
    });

    it('giáo viên chủ nhiệm: mã giáo viên và lớp chủ nhiệm kèm sĩ số', async () => {
      const me = (await (await loginAs(TEACHER)).get('/academic/me').expect(200)).body;
      expect(me.teacherCode).toBe('GVMAU01');
      expect(me.studentCode).toBeNull();
      expect(me.className).toBeNull();
      const own = me.homeroomClasses.find((c: { name: string }) => c.name === '10A1');
      expect(own.studentCount).toBeGreaterThanOrEqual(2);
    });

    it('tài khoản không có hồ sơ (ADMIN): các trường rỗng, không lỗi; chưa đăng nhập thì 401', async () => {
      const me = (await admin.get('/academic/me').expect(200)).body;
      expect(me).toMatchObject({ studentCode: null, teacherCode: null, className: null, homeroomClasses: [] });
      await http().get('/academic/me').expect(401);
    });
  });

  describe('GET /system/overview – số liệu toàn trường', () => {
    it('BGH và ADMIN xem được; số liệu khớp CSDL', async () => {
      const year = await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } });
      const expected = {
        schoolYearName: year.name,
        classes: await prisma.schoolClass.count({ where: { schoolYearId: year.id } }),
        students: await prisma.classEnrollment.count({ where: { schoolYearId: year.id, student: { status: { not: 'LOCKED' } } } }),
        teachers: await prisma.teacherProfile.count({ where: { user: { status: { not: 'LOCKED' } } } }),
      };
      expect((await (await loginAs(PRINCIPAL)).get('/system/overview').expect(200)).body).toEqual(expected);
      expect((await admin.get('/system/overview').expect(200)).body).toEqual(expected);
    });

    it('biên tập viên, giáo viên, học sinh bị 403', async () => {
      for (const who of [EDITOR, TEACHER, STUDENT]) {
        await (await loginAs(who)).get('/system/overview').expect(403);
      }
    });
  });
});
