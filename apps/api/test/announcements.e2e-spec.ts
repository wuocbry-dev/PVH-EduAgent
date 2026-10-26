// Bước 20 – thông báo theo đối tượng (toàn trường / khối / lớp / chỉ nhân sự), hộp thông báo và đếm chưa đọc,
// sự kiện theo lớp/khối, công cụ giáo viên chủ nhiệm. Cần PostgreSQL đã migrate + seed và Redis.
// Dữ liệu do test tạo mang hậu tố RUN và được dọn khi xong.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ANNOUNCEMENTS_PER_HOUR, type AnnouncementDto, type AudienceTargetsDto, type ClassStudentDto, type EventDto, type InboxDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/features/auth/password.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { RateLimitService } from './../src/infrastructure/rate-limit/rate-limit.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';

const RUN = String(Date.now()).slice(-7);
const tag = (s: string) => `${s}${RUN}`;

type Agent = ReturnType<typeof request.agent>;
type Person = { id: string; email: string; code: string };

describe('Thông báo theo đối tượng, sự kiện theo lớp, lớp chủ nhiệm (bước 20, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let limits: RateLimitService;
  let admin: Agent;
  let principal: Agent;
  let editor: Agent;
  let teacher1: Agent; // dạy lớp P (khối 11)
  let teacher2: Agent; // chủ nhiệm lớp Q (khối 11)
  let studentP: Agent;
  let studentQ: Agent;
  let studentR: Agent;
  let yearId: bigint;
  let subjectId: string;
  let clsP: { id: string; name: string };
  let clsQ: { id: string; name: string };
  let clsR: { id: string; name: string };
  let t1: Person;
  let t2: Person;
  let sP: Person;
  let sQ: Person;
  let sR: Person;
  let sQ2: Person; // chưa đăng nhập lần nào
  const userIds: bigint[] = [];
  const created: Record<string, AnnouncementDto> = {};

  async function loginAs(identifier: string): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password: PASSWORD }).expect(200);
    return agent;
  }

  async function makeUser(role: 'TEACHER' | 'STUDENT', code: string, classId?: string): Promise<Person> {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const email = `e20.${code.toLowerCase()}@pvh.edu.vn`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `${role === 'TEACHER' ? 'GV' : 'HS'} ${code}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: { roleId: r.id } },
        ...(role === 'TEACHER'
          ? { teacherProfile: { create: { teacherCode: code } } }
          : { studentProfile: { create: { studentCode: code } }, enrollments: { create: { classId: BigInt(classId!), schoolYearId: yearId } } }),
      },
    });
    userIds.push(user.id);
    return { id: user.id.toString(), email, code };
  }

  const post = (agent: Agent, key: string, body: Record<string, unknown>) =>
    agent.post('/announcements').send({ title: tag(`${key} `), content: `<p>Nội dung ${key}</p>`, ...body });
  const mine = async (agent: Agent) => {
    const inbox = (await agent.get('/announcements/inbox').expect(200)).body as InboxDto;
    return inbox.items.filter((i) => i.kind === 'ANNOUNCEMENT' && i.title.endsWith(RUN)).map((i) => i.title.replace(` ${RUN}`, '').replace(RUN, ''));
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    limits = app.get(RateLimitService);
    admin = await loginAs(ADMIN);
    principal = await loginAs(PRINCIPAL);
    editor = await loginAs(EDITOR);
    yearId = (await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id;

    subjectId = (await admin.post('/academic/subjects').send({ code: tag('TB'), name: `Môn TB ${RUN}` }).expect(201)).body.id;
    clsP = (await admin.post('/academic/classes').send({ name: tag('TP'), gradeLevel: 11 }).expect(201)).body;
    clsQ = (await admin.post('/academic/classes').send({ name: tag('TQ'), gradeLevel: 11 }).expect(201)).body;
    clsR = (await admin.post('/academic/classes').send({ name: tag('TR'), gradeLevel: 12 }).expect(201)).body;
    t1 = await makeUser('TEACHER', tag('E20A'));
    t2 = await makeUser('TEACHER', tag('E20B'));
    sP = await makeUser('STUDENT', tag('TP1H'), clsP.id);
    sQ = await makeUser('STUDENT', tag('TQ1H'), clsQ.id);
    sQ2 = await makeUser('STUDENT', tag('TQ2H'), clsQ.id);
    sR = await makeUser('STUDENT', tag('TR1H'), clsR.id);
    await prisma.teachingAssignment.create({
      data: { schoolYearId: yearId, classId: BigInt(clsP.id), subjectId: BigInt(subjectId), teacherId: BigInt(t1.id), periodsPerWeek: 2 },
    });
    await prisma.schoolClass.update({ where: { id: BigInt(clsQ.id) }, data: { homeroomTeacherId: BigInt(t2.id) } });

    teacher1 = await loginAs(t1.email);
    teacher2 = await loginAs(t2.email);
    studentP = await loginAs(sP.email);
    studentQ = await loginAs(sQ.email);
    studentR = await loginAs(sR.email);
    for (const id of [t1.id, t2.id, (await principal.get('/auth/me')).body.id]) await limits.reset('announcement-send', id);
  });

  afterAll(async () => {
    const classes = [BigInt(clsP.id), BigInt(clsQ.id), BigInt(clsR.id)];
    const anns = await prisma.announcement.findMany({ where: { title: { endsWith: RUN } }, select: { id: true } });
    const events = await prisma.event.findMany({ where: { title: { endsWith: RUN } }, select: { id: true } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { targetType: 'announcement', targetId: { in: anns.map((a) => a.id) } },
          { targetType: 'event', targetId: { in: events.map((e) => e.id) } },
          { targetType: 'user', targetId: { in: userIds } },
        ],
      },
    });
    await prisma.announcement.deleteMany({ where: { id: { in: anns.map((a) => a.id) } } });
    await prisma.event.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
    await prisma.teachingAssignment.deleteMany({ where: { classId: { in: classes } } });
    await prisma.classEnrollment.deleteMany({ where: { classId: { in: classes } } });
    await prisma.schoolClass.updateMany({ where: { id: { in: classes } }, data: { homeroomTeacherId: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classes } } });
    await prisma.subject.deleteMany({ where: { id: BigInt(subjectId) } });
    await app.close();
  });

  describe('quyền gửi và phạm vi', () => {
    it('ADMIN, biên tập viên, học sinh không gửi được; chưa đăng nhập 401', async () => {
      for (const who of [admin, editor, studentP]) {
        await post(who, 'X', { audience: 'SCHOOL' }).expect(403);
        await who.get('/announcements/targets').expect(403);
        await who.get('/announcements/sent').expect(403);
      }
      await request(app.getHttpServer()).get('/announcements/inbox').expect(401);
    });

    it('giáo viên chỉ chọn được lớp mình dạy/chủ nhiệm; BGH mọi lớp, mọi khối', async () => {
      const a = (await teacher1.get('/announcements/targets').expect(200)).body as AudienceTargetsDto;
      expect(a).toMatchObject({ manageAll: false, grades: [], classes: [{ id: clsP.id, homeroom: false }] });
      const b = (await teacher2.get('/announcements/targets').expect(200)).body as AudienceTargetsDto;
      expect(b.classes).toEqual([expect.objectContaining({ id: clsQ.id, homeroom: true })]);
      const c = (await principal.get('/announcements/targets').expect(200)).body as AudienceTargetsDto;
      expect(c.manageAll).toBe(true);
      expect(c.grades).toEqual([10, 11, 12]);
      expect(c.classes.map((x) => x.id)).toEqual(expect.arrayContaining([clsP.id, clsQ.id, clsR.id]));
    });

    it('giáo viên gửi cho lớp mình được; lớp khác, khối, toàn trường, chỉ nhân sự bị 403', async () => {
      created.LOP_P = (await post(teacher1, 'LOP_P', { audience: 'CLASS', classId: clsP.id }).expect(201)).body;
      expect(created.LOP_P).toMatchObject({ audience: 'CLASS', className: clsP.name, audienceLabel: `Lớp ${clsP.name}` });
      await post(teacher1, 'X', { audience: 'CLASS', classId: clsQ.id }).expect(403);
      await post(teacher1, 'X', { audience: 'GRADE', gradeLevel: 11 }).expect(403);
      await post(teacher1, 'X', { audience: 'SCHOOL' }).expect(403);
      await post(teacher1, 'X', { audience: 'TEACHERS' }).expect(403);
      created.LOP_Q = (await post(teacher2, 'LOP_Q', { audience: 'CLASS', classId: clsQ.id }).expect(201)).body;
    });

    it('BGH gửi toàn trường, khối, lớp, chỉ nhân sự; đối tượng thiếu thông tin bị 400', async () => {
      created.TRUONG = (await post(principal, 'TRUONG', { audience: 'SCHOOL', pinned: true }).expect(201)).body;
      created.KHOI11 = (await post(principal, 'KHOI11', { audience: 'GRADE', gradeLevel: 11 }).expect(201)).body;
      created.LOP_R = (await post(principal, 'LOP_R', { audience: 'CLASS', classId: clsR.id }).expect(201)).body;
      created.NHANSU = (await post(principal, 'NHANSU', { audience: 'TEACHERS' }).expect(201)).body;
      await post(principal, 'X', { audience: 'GRADE' }).expect(400);
      await post(principal, 'X', { audience: 'CLASS' }).expect(400);
      await post(principal, 'X', { audience: 'SCHOOL', expiresAt: '2020-01-01T00:00:00+07:00' }).expect(400);
    });

    it('nội dung được làm sạch: không còn script, on*, javascript:', async () => {
      const res = await principal
        .post('/announcements')
        .send({
          title: tag('<b>XSS</b> '),
          content: '<p>Chào<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bấm</a></p>',
          audience: 'TEACHERS',
        })
        .expect(201);
      const a = res.body as AnnouncementDto;
      expect(a.title).toBe(tag('XSS '));
      expect(a.content).not.toMatch(/script|onerror|javascript:/i);
      expect(a.content).toContain('Chào');
      await principal.post('/announcements').send({ title: tag('Rỗng '), content: '<script>x</script>', audience: 'SCHOOL' }).expect(400);
    });
  });

  describe('hộp thông báo theo đối tượng', () => {
    it('học sinh lớp P: toàn trường, khối 11, lớp P; không thấy lớp Q, lớp R, chỉ nhân sự', async () => {
      expect((await mine(studentP)).sort()).toEqual(['KHOI11', 'LOP_P', 'TRUONG']);
      expect((await mine(studentQ)).sort()).toEqual(['KHOI11', 'LOP_Q', 'TRUONG']);
      expect((await mine(studentR)).sort()).toEqual(['LOP_R', 'TRUONG']);
    });

    it('nhân sự: toàn trường, chỉ nhân sự, lớp/khối mình dạy hoặc chủ nhiệm, thông báo mình gửi; BGH thấy tất cả', async () => {
      expect((await mine(teacher1)).sort()).toEqual(['KHOI11', 'LOP_P', 'NHANSU', 'TRUONG', 'XSS']);
      expect((await mine(teacher2)).sort()).toEqual(['KHOI11', 'LOP_Q', 'NHANSU', 'TRUONG', 'XSS']);
      expect((await mine(editor)).sort()).toEqual(['NHANSU', 'TRUONG', 'XSS']);
      expect((await mine(principal)).sort()).toEqual(['KHOI11', 'LOP_P', 'LOP_Q', 'LOP_R', 'NHANSU', 'TRUONG', 'XSS']);
    });

    it('thông báo ghim lên đầu; thông báo hết hạn không hiện', async () => {
      const inbox = (await studentP.get('/announcements/inbox').expect(200)).body as InboxDto;
      expect(inbox.items[0]).toMatchObject({ title: tag('TRUONG '), pinned: true, senderName: expect.any(String), audienceLabel: 'Toàn trường' });
      await prisma.announcement.create({
        data: { title: tag('HETHAN '), content: '<p>cũ</p>', audience: 'SCHOOL', expiresAt: new Date(Date.now() - 60_000), createdBy: BigInt(t1.id) },
      });
      expect(await mine(studentP)).not.toContain('HETHAN');
    });

    it('đếm chưa đọc; chỉ đánh dấu được mục mình thấy; thông báo hệ thống của chính mình cũng hiện và đánh dấu được', async () => {
      const unread0 = (await studentP.get('/announcements/unread-count').expect(200)).body.unread as number;
      expect(unread0).toBeGreaterThanOrEqual(3);
      const note = await prisma.notification.create({ data: { userId: BigInt(sP.id), channel: 'web', title: 'Có điểm mới môn Toán', body: 'Đợt KT đã công bố' } });
      const other = await prisma.notification.create({ data: { userId: BigInt(sQ.id), channel: 'web', title: 'Riêng của bạn Q', body: 'x' } });

      const inbox = (await studentP.get('/announcements/inbox').expect(200)).body as InboxDto;
      expect(inbox.unread).toBe(unread0 + 1);
      expect(inbox.items).toContainEqual(expect.objectContaining({ kind: 'NOTIFICATION', id: note.id.toString(), read: false }));
      expect(JSON.stringify(inbox)).not.toContain('Riêng của bạn Q');

      // Đánh dấu một thông báo của lớp Q (không thấy) và thông báo hệ thống của bạn Q: không có tác dụng.
      let res = await studentP
        .post('/announcements/inbox/read')
        .send({ announcementIds: [created.LOP_P!.id, created.LOP_Q!.id], notificationIds: [note.id.toString(), other.id.toString()] })
        .expect(200);
      expect(res.body.unread).toBe(unread0 - 1);
      expect(await prisma.announcementRead.count({ where: { userId: BigInt(sP.id), announcementId: BigInt(created.LOP_Q!.id) } })).toBe(0);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: other.id } })).readAt).toBeNull();
      // Đánh dấu lại không lỗi; đánh dấu tất cả.
      await studentP.post('/announcements/inbox/read').send({ announcementIds: [created.LOP_P!.id] }).expect(200);
      res = await studentP.post('/announcements/inbox/read').send({ all: true }).expect(200);
      expect(res.body.unread).toBe(0);
      expect((await studentP.get('/announcements/inbox').expect(200)).body.items.every((i: { read: boolean }) => i.read)).toBe(true);
    });
  });

  describe('thông báo đã gửi, xoá, giới hạn tần suất', () => {
    it('giáo viên chỉ thấy thông báo mình gửi (kèm số người đã đọc); BGH thấy tất cả', async () => {
      const sent = (await teacher1.get('/announcements/sent').expect(200)).body as AnnouncementDto[];
      expect(sent.every((a) => a.createdById === t1.id)).toBe(true);
      expect(sent.find((a) => a.id === created.LOP_P!.id)!.readCount).toBe(1); // học sinh P đã đọc
      const all = (await principal.get('/announcements/sent').expect(200)).body as AnnouncementDto[];
      expect(all.map((a) => a.id)).toEqual(expect.arrayContaining([created.LOP_P!.id, created.LOP_Q!.id]));
    });

    it('chỉ người gửi hoặc BGH xoá được', async () => {
      await teacher1.delete(`/announcements/${created.LOP_Q!.id}`).expect(403);
      await teacher2.delete(`/announcements/${created.LOP_Q!.id}`).expect(204);
      await principal.delete(`/announcements/${created.LOP_P!.id}`).expect(204);
      await principal.delete(`/announcements/${created.LOP_P!.id}`).expect(404);
      expect(await mine(studentP)).not.toContain('LOP_P');
    });

    it(`gửi quá ${ANNOUNCEMENTS_PER_HOUR} thông báo/giờ bị 429`, async () => {
      for (let i = 0; i < ANNOUNCEMENTS_PER_HOUR; i++) await limits.increment('announcement-send', t1.id, 3600);
      await post(teacher1, 'NHIEU', { audience: 'CLASS', classId: clsP.id }).expect(429);
      await limits.reset('announcement-send', t1.id);
    });
  });

  describe('sự kiện theo đối tượng', () => {
    const ev = (title: string, extra: Record<string, unknown>) => ({
      title: tag(`${title} `),
      startAt: new Date(Date.now() + 86_400_000).toISOString(),
      endAt: new Date(Date.now() + 90_000_000).toISOString(),
      ...extra,
    });
    const titles = (list: EventDto[]) => list.filter((e) => e.title.endsWith(RUN)).map((e) => e.title.replace(` ${RUN}`, '')).sort();

    it('biên tập viên tạo sự kiện cho lớp/khối/nhân sự; giáo viên không tạo được; thiếu thông tin bị 400', async () => {
      await editor.post('/events').send(ev('EV_TRUONG', {})).expect(201);
      const e = (await editor.post('/events').send(ev('EV_LOP_P', { audience: 'CLASS', classId: clsP.id })).expect(201)).body as EventDto;
      expect(e).toMatchObject({ audience: 'CLASS', classId: clsP.id, className: clsP.name });
      await editor.post('/events').send(ev('EV_KHOI12', { audience: 'GRADE', gradeLevel: 12 })).expect(201);
      await editor.post('/events').send(ev('EV_NHANSU', { audience: 'TEACHERS' })).expect(201);
      await editor.post('/events').send(ev('X', { audience: 'GRADE' })).expect(400);
      await teacher1.post('/events').send(ev('X', {})).expect(403);
      await teacher1.get('/events/targets').expect(403);
      expect(((await editor.get('/events/targets').expect(200)).body as AudienceTargetsDto).manageAll).toBe(true);
    });

    it('trang công khai chỉ có sự kiện toàn trường; lịch trong cổng đúng đối tượng', async () => {
      expect(titles((await request(app.getHttpServer()).get('/events').expect(200)).body)).toEqual(['EV_TRUONG']);
      expect(titles((await studentP.get('/events/mine').expect(200)).body)).toEqual(['EV_LOP_P', 'EV_TRUONG']);
      expect(titles((await studentR.get('/events/mine').expect(200)).body)).toEqual(['EV_KHOI12', 'EV_TRUONG']);
      expect(titles((await teacher1.get('/events/mine').expect(200)).body)).toEqual(['EV_LOP_P', 'EV_NHANSU', 'EV_TRUONG']);
      expect(titles((await editor.get('/events/mine').expect(200)).body)).toEqual(['EV_KHOI12', 'EV_LOP_P', 'EV_NHANSU', 'EV_TRUONG']);
    });
  });

  describe('công cụ giáo viên chủ nhiệm', () => {
    it('danh sách lớp chủ nhiệm có trạng thái tài khoản và lần đăng nhập gần nhất; lớp khác bị 403', async () => {
      const list = (await teacher2.get(`/academic/classes/${clsQ.id}/students`).expect(200)).body as ClassStudentDto[];
      const byCode = new Map(list.map((s) => [s.studentCode, s]));
      expect(byCode.get(sQ.code)!.lastLoginAt).not.toBeNull(); // đã đăng nhập trong beforeAll
      expect(byCode.get(sQ2.code)!.lastLoginAt).toBeNull();
      await teacher2.get(`/academic/classes/${clsP.id}/students`).expect(403);
      await teacher1.get(`/academic/classes/${clsQ.id}/students`).expect(403);
    });

    it('cấp lại mã kích hoạt cho học sinh lớp mình; lớp khác bị 403', async () => {
      const slip = (await teacher2.post(`/roster/users/${sQ2.id}/activation-code`).expect(200)).body;
      expect(slip).toMatchObject({ loginId: sQ2.code, className: clsQ.name, activationCode: expect.any(String) });
      await teacher2.post(`/roster/users/${sP.id}/activation-code`).expect(403);
    });
  });
});
