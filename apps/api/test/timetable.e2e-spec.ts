// Bước 17 – thời khoá biểu: chặn trùng ở CSDL, khung tiết, tiết cố định, tiết bận, công bố theo ngày hiệu lực, xem theo tuần,
// quyền, đồng bộ khi đổi giáo viên, xuất Excel, tool Agent. Cần PostgreSQL đã migrate + seed và Redis.
// Dùng một năm học tạm (2095-2096) với học kỳ bao trùm hôm nay để không đụng dữ liệu thật; dọn sạch khi xong.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { TimetableSlotDto, TimetableVersionDto, WeekViewDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/features/auth/password.js';
import { addDays, vnToday, weekStart } from './../src/features/timetable/timetable-dates.js';
import { TimetableAgentTools } from './../src/features/timetable/timetable.agent-tools.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const SEED_STUDENT = 'HSMAU01';
const YEAR = '2095-2096';
const RUN = String(Date.now()).slice(-7);
const tag = (s: string) => `${s}${RUN}`;
const TODAY = vnToday();

type Agent = ReturnType<typeof request.agent>;
type Tool = { name: string; handler: (args: unknown, extra: unknown) => Promise<{ content: { text?: string }[]; isError?: boolean }> };

describe('Thời khoá biểu (bước 17, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;
  let principal: Agent;
  let yearId: string;
  let sem1: string;
  let clsA: { id: string; name: string };
  let clsB: { id: string; name: string };
  let subjS1: { id: string; name: string };
  let subjS2: { id: string; name: string };
  let room: { id: string; name: string };
  let t1: { id: string; email: string; name: string };
  let t2: { id: string; email: string; name: string };
  let t3: { id: string; email: string; name: string };
  let studentA: { id: string; email: string };
  const asg: Record<'A1' | 'B1' | 'A2' | 'B2', string> = { A1: '', B1: '', A2: '', B2: '' };
  const userIds: bigint[] = [];
  const versionIds: string[] = [];

  const http = () => request(app.getHttpServer());

  async function loginAs(identifier: string, password = PASSWORD): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }

  async function makeUser(code: string, role: 'TEACHER' | 'STUDENT') {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const email = `e17.${code.toLowerCase()}@pvh.edu.vn`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `Người ${code}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: { roleId: r.id } },
        ...(role === 'TEACHER'
          ? { teacherProfile: { create: { teacherCode: code } } }
          : { studentProfile: { create: { studentCode: code } } }),
      },
    });
    userIds.push(user.id);
    return { id: user.id.toString(), email, name: user.fullName };
  }

  async function newVersion(name: string, semesterId = sem1, copyFromId?: string): Promise<TimetableVersionDto> {
    const v = (await principal.post('/timetable/versions').send({ semesterId, name: tag(name), copyFromId }).expect(201)).body as TimetableVersionDto;
    versionIds.push(v.id);
    return v;
  }

  const place = (versionId: string, assignmentId: string, day: number, period: number, extra: Record<string, unknown> = {}) =>
    principal.post(`/timetable/versions/${versionId}/slots`).send({ assignmentId, day, period, ...extra });

  const fillAll = async (versionId: string) => {
    for (const [a, d, p] of [
      [asg.A1, 1, 2],
      [asg.A1, 2, 2],
      [asg.B1, 1, 3],
      [asg.B1, 2, 3],
      [asg.A2, 1, 4],
      [asg.A2, 2, 4],
      [asg.B2, 1, 5],
    ] as const) {
      await place(versionId, a, d, p).expect(201);
    }
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await loginAs(ADMIN);
    principal = await loginAs(PRINCIPAL);

    // Học kỳ 1 của năm tạm bao trùm hôm nay và tương lai gần; học kỳ 2 ở xa (để kiểm tra phân công không thuộc học kỳ).
    const year = (await admin.post('/academic/school-years').send({ name: YEAR, startDate: '2026-01-01', endDate: '2100-12-31' }).expect(201)).body;
    yearId = year.id;
    sem1 = (await admin.post('/academic/semesters').send({ schoolYearId: yearId, number: 1, startDate: '2026-01-01', endDate: '2099-12-30' }).expect(201)).body.id;
    await admin.post('/academic/semesters').send({ schoolYearId: yearId, number: 2, startDate: '2099-12-31', endDate: '2100-12-31' }).expect(201);
    clsA = (await admin.post('/academic/classes').send({ name: tag('TA'), gradeLevel: 10, schoolYearId: yearId }).expect(201)).body;
    clsB = (await admin.post('/academic/classes').send({ name: tag('TB'), gradeLevel: 10, schoolYearId: yearId }).expect(201)).body;
    subjS1 = (await admin.post('/academic/subjects').send({ code: tag('TS1'), name: `Môn T1 ${RUN}` }).expect(201)).body;
    // Tên môn bắt đầu bằng "=" để kiểm tra chống Excel injection khi xuất.
    subjS2 = (await admin.post('/academic/subjects').send({ code: tag('TS2'), name: '=HYPERLINK("http://evil")' }).expect(201)).body;
    room = (await admin.post('/academic/rooms').send({ name: tag('Phòng TKB ') }).expect(201)).body;
    t1 = await makeUser(tag('E17A'), 'TEACHER');
    t2 = await makeUser(tag('E17B'), 'TEACHER');
    t3 = await makeUser(tag('E17C'), 'TEACHER');
    studentA = await makeUser(tag('E17S'), 'STUDENT');
    await prisma.classEnrollment.create({ data: { studentId: BigInt(studentA.id), classId: BigInt(clsA.id), schoolYearId: BigInt(yearId) } });

    const assign = async (cls: string, subject: string, teacher: string, periodsPerWeek: number) =>
      ((await principal.post('/teaching/assignments').send({ classId: cls, subjectId: subject, teacherId: teacher, periodsPerWeek }).expect(201)).body as { id: string }).id;
    asg.A1 = await assign(clsA.id, subjS1.id, t1.id, 2);
    asg.B1 = await assign(clsB.id, subjS1.id, t1.id, 2);
    asg.A2 = await assign(clsA.id, subjS2.id, t2.id, 2);
    asg.B2 = await assign(clsB.id, subjS2.id, t2.id, 1);
  });

  afterAll(async () => {
    const classIds = [BigInt(clsA.id), BigInt(clsB.id)];
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.timetableSlot.deleteMany({ where: { OR: [{ classId: { in: classIds } }, { teacherId: { in: userIds } }] } });
    await prisma.timetable.deleteMany({ where: { semester: { schoolYear: { name: YEAR } } } });
    await prisma.teachingAssignment.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.fixedPeriod.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.classEnrollment.deleteMany({ where: { classId: { in: classIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classIds } } });
    await prisma.schoolYear.deleteMany({ where: { name: YEAR } });
    await prisma.subject.deleteMany({ where: { code: { endsWith: RUN } } });
    await prisma.room.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { targetType: 'user', targetId: { in: userIds } }] } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('quyền', () => {
    it('BGH xếp và công bố; ADMIN chỉ xem; biên tập viên, giáo viên, học sinh không vào được API quản lý', async () => {
      const v = await newVersion('Quyền');
      await principal.get('/timetable/versions').expect(200);
      await admin.get('/timetable/versions').expect(200);
      await admin.get(`/timetable/versions/${v.id}/slots`).expect(200);
      await admin.post('/timetable/versions').send({ semesterId: sem1, name: 'x' }).expect(403);
      await admin.post(`/timetable/versions/${v.id}/slots`).send({ assignmentId: asg.A1, day: 1, period: 2 }).expect(403);
      await admin.post(`/timetable/versions/${v.id}/publish`).send({ effectiveDate: TODAY }).expect(403);
      await admin.post('/timetable/fixed').send({ name: 'x', kind: 'SCHOOL', day: 5, period: 9 }).expect(403);
      const me = (await admin.get('/auth/me').expect(200)).body;
      expect(me.permissions).toContain('timetable:read');
      expect(me.permissions).not.toContain('timetable:manage');

      for (const who of [EDITOR, t1.email, SEED_STUDENT]) {
        const a = await loginAs(who);
        await a.get('/timetable/versions').expect(403);
        await a.get(`/timetable/versions/${v.id}/slots`).expect(403);
        await a.get(`/timetable/versions/${v.id}/options`).query({ assignmentId: asg.A1 }).expect(403);
        await a.get('/timetable/export').query({ scope: 'school' }).expect(403);
        await a.get('/timetable/unavailability').expect(403);
        await a.post('/timetable/versions').send({ semesterId: sem1, name: 'x' }).expect(403);
        await a.post(`/timetable/versions/${v.id}/slots`).send({ assignmentId: asg.A1, day: 1, period: 2 }).expect(403);
        await a.patch('/timetable/slots/1').send({ day: 1, period: 2 }).expect(403);
        await a.delete('/timetable/slots/1').expect(403);
        await a.post(`/timetable/versions/${v.id}/publish`).send({ effectiveDate: TODAY }).expect(403);
        await a.delete(`/timetable/versions/${v.id}`).expect(403);
        await a.put('/timetable/frame').send({ days: [1], periods: [{ no: 1, session: 'MORNING', start: '07:00', end: '07:45' }] }).expect(403);
        await a.get('/timetable/frame').expect(200); // khung tiết ai cũng xem được
      }
      await http().get('/timetable/versions').expect(401);
      await principal.delete(`/timetable/versions/${v.id}`).expect(204);
    });
  });

  describe('khung tiết và buổi học của lớp', () => {
    it('mặc định 9 tiết; sửa được (BGH và ADMIN), khung sai bị từ chối, giáo viên không sửa được', async () => {
      const frame = (await principal.get('/timetable/frame').expect(200)).body;
      expect(frame.days).toEqual([1, 2, 3, 4, 5, 6]);
      expect(frame.periods).toHaveLength(9);
      expect(frame.periods[0]).toMatchObject({ session: 'MORNING', start: '07:00', end: '07:45' });
      expect(frame.periods[5]).toMatchObject({ session: 'AFTERNOON', start: '13:00' });

      const changed = structuredClone(frame);
      changed.periods[0].start = '06:55';
      expect((await principal.put('/timetable/frame').send(changed).expect(200)).body.periods[0].start).toBe('06:55');
      expect((await admin.put('/timetable/frame').send(frame).expect(200)).body.periods[0].start).toBe('07:00'); // ADMIN (setting:manage) cũng sửa được
      const bad = structuredClone(frame);
      bad.periods[1].no = 7;
      await principal.put('/timetable/frame').send(bad).expect(400);
      await principal.put('/timetable/frame').send({ days: [], periods: frame.periods }).expect(400);
      // Cấu hình hệ thống cũng kiểm tra khung (khoá timetable.frame).
      await admin.patch('/settings').send({ 'timetable.frame': 'không phải json' }).expect(400);
      expect(await prisma.auditLog.count({ where: { action: 'timetable.frame.update' } })).toBeGreaterThanOrEqual(2);
    });

    it('chỉnh buổi học hàng loạt theo khối hoặc danh sách lớp; mặc định cả sáng lẫn chiều', async () => {
      const classes = (await admin.get('/academic/classes').query({ schoolYearId: yearId }).expect(200)).body as { id: string; sessions: string }[];
      expect(classes.every((c) => c.sessions === 'BOTH')).toBe(true);
      const res = (await principal.patch('/academic/classes/sessions').send({ schoolYearId: yearId, classIds: [clsB.id], sessions: 'MORNING' }).expect(200)).body;
      expect(res.updated).toBe(1);
      let after = (await admin.get('/academic/classes').query({ schoolYearId: yearId }).expect(200)).body as { id: string; sessions: string }[];
      expect(after.find((c) => c.id === clsB.id)!.sessions).toBe('MORNING');
      expect(after.find((c) => c.id === clsA.id)!.sessions).toBe('BOTH');
      await principal.patch('/academic/classes/sessions').send({ schoolYearId: yearId, gradeLevel: 10, sessions: 'BOTH' }).expect(200);
      after = (await admin.get('/academic/classes').query({ schoolYearId: yearId }).expect(200)).body;
      expect(after.every((c) => c.sessions === 'BOTH')).toBe(true);
      await principal.patch('/academic/classes/sessions').send({ sessions: 'BOTH' }).expect(400); // thiếu khối/danh sách lớp
      await (await loginAs(t1.email)).patch('/academic/classes/sessions').send({ gradeLevel: 10, sessions: 'BOTH' }).expect(403);
      await principal.patch(`/academic/classes/${clsB.id}`).send({ sessions: 'MORNING' }).expect(200);
    });
  });

  describe('xếp tiết và chặn trùng', () => {
    let v: TimetableVersionDto;

    beforeAll(async () => {
      v = await newVersion('Xếp tay');
    });

    it('cùng giáo viên hai lớp cùng tiết, cùng lớp hai môn cùng tiết, cùng phòng hai lớp cùng tiết đều bị chặn kèm lý do', async () => {
      const first = (await place(v.id, asg.A1, 1, 2, { roomId: room.id }).expect(201)).body as TimetableSlotDto;
      expect(first).toMatchObject({ className: clsA.name, teacherId: t1.id, roomName: room.name, day: 1, period: 2 });

      const teacher = await place(v.id, asg.B1, 1, 2).expect(409);
      expect(teacher.body.message).toMatch(/đang dạy lớp .* \(Môn T1/);
      const sameClass = await place(v.id, asg.A2, 1, 2).expect(409);
      expect(sameClass.body.message).toMatch(/Lớp .* đã có tiết/);
      const sameRoom = await place(v.id, asg.B2, 1, 2, { roomId: room.id }).expect(409);
      expect(sameRoom.body.message).toMatch(/Phòng .* đang được lớp .* dùng/);
      expect(await prisma.timetableSlot.count({ where: { timetableId: BigInt(v.id) } })).toBe(1);

      // Ràng buộc nằm ở CSDL, không chỉ ở service: chèn thẳng cũng bị chặn.
      const row = (a: string, over: Record<string, unknown>) => ({
        timetableId: BigInt(v.id), day: 1, period: 2, classId: BigInt(clsB.id), assignmentId: BigInt(a), teacherId: BigInt(t2.id), roomId: null as bigint | null, ...over,
      });
      await expect(prisma.timetableSlot.create({ data: row(asg.B1, { teacherId: BigInt(t1.id) }) })).rejects.toThrow(); // giáo viên
      await expect(prisma.timetableSlot.create({ data: row(asg.A2, { classId: BigInt(clsA.id) }) })).rejects.toThrow(); // lớp
      await expect(prisma.timetableSlot.create({ data: row(asg.B2, { roomId: BigInt(room.id) }) })).rejects.toThrow(); // phòng
      await expect(prisma.timetableSlot.create({ data: row(asg.B2, { day: 7 }) })).rejects.toThrow(); // thứ ngoài 1–6
      expect(await prisma.timetableSlot.count({ where: { timetableId: BigInt(v.id) } })).toBe(1);

      // Chuyển phân công sang giáo viên khác có tiết trùng: CSDL chặn cả khi sửa.
      await place(v.id, asg.B1, 1, 3).expect(201);
      await expect(prisma.timetableSlot.updateMany({ where: { classId: BigInt(clsB.id), day: 1, period: 3 }, data: { period: 2, teacherId: BigInt(t1.id) } })).rejects.toThrow();
      await principal.delete(`/timetable/slots/${(await prisma.timetableSlot.findFirstOrThrow({ where: { classId: BigInt(clsB.id), timetableId: BigInt(v.id) } })).id}`).expect(204);
    });

    it('hai người BGH xếp cùng lúc vào cùng ô: đúng một người thành công, người kia nhận 409 tiếng Việt (không 500)', async () => {
      const fresh = await newVersion('Đồng thời');
      for (const [day, period] of [[3, 1], [3, 2], [3, 3]] as const) {
        const [x, y] = await Promise.all([place(fresh.id, asg.A1, day, period), place(fresh.id, asg.B1, day, period)]); // cùng giáo viên T1
        expect([x.status, y.status].sort((a, b) => a - b)).toEqual([201, 409]);
        const loser = x.status === 409 ? x : y;
        expect(loser.body.message).toMatch(/đang dạy|xếp trùng|Lớp/);
        // gỡ để ô tiếp theo vẫn còn đủ tiết
        await prisma.timetableSlot.deleteMany({ where: { timetableId: BigInt(fresh.id) } });
      }
      // Cùng phòng, hai lớp, hai giáo viên khác nhau.
      const [r1, r2] = await Promise.all([place(fresh.id, asg.A1, 4, 1, { roomId: room.id }), place(fresh.id, asg.B2, 4, 1, { roomId: room.id })]);
      expect([r1.status, r2.status].sort((a, b) => a - b)).toEqual([201, 409]);
      await principal.delete(`/timetable/versions/${fresh.id}`).expect(204);
    });

    it('tiết cố định chặn xếp môn; không đặt tiết cố định lên ô đã xếp; xoá thì xếp lại được', async () => {
      const chaoCo = await place(v.id, asg.B1, 1, 1).expect(409); // seed: Chào cờ thứ Hai tiết 1 (cả trường)
      expect(chaoCo.body.message).toMatch(/Tiết cố định "Chào cờ"/);

      const fixed = (await principal.post('/timetable/fixed').send({ name: tag('Tiết thử '), kind: 'SCHOOL', day: 5, period: 9, gradeLevel: 10 }).expect(201)).body;
      expect(fixed).toMatchObject({ day: 5, period: 9, gradeLevel: 10 });
      await place(v.id, asg.B1, 5, 9).expect(409).expect((r) => expect(r.body.message).toMatch(/khối 10/));
      await principal.post('/timetable/fixed').send({ name: 'Trùng', kind: 'SCHOOL', day: 5, period: 9, gradeLevel: 10 }).expect(409);
      await principal.post('/timetable/fixed').send({ name: 'Ngoài khung', kind: 'SCHOOL', day: 5, period: 10 }).expect(400);
      // Ô đã có môn thì không thể đặt tiết cố định lên.
      await principal.post('/timetable/fixed').send({ name: tag('Đè '), kind: 'SCHOOL', day: 1, period: 2 }).expect(409);
      await principal.delete(`/timetable/fixed/${fixed.id}`).expect(204);
      const placed = (await place(v.id, asg.A1, 5, 9).expect(201)).body as TimetableSlotDto; // xoá tiết cố định thì xếp lại được (lớp A học cả chiều)
      await principal.delete(`/timetable/slots/${placed.id}`).expect(204);
      expect((await admin.get('/timetable/fixed').expect(200)).body.some((f: { name: string }) => f.name === 'Chào cờ')).toBe(true);
    });

    it('lớp chỉ học buổi sáng không xếp được tiết chiều; số tiết không vượt phân công; ngoài khung bị chặn', async () => {
      const afternoon = await place(v.id, asg.B1, 4, 7).expect(409); // lớp B chỉ học sáng
      expect(afternoon.body.message).toMatch(/chỉ học buổi sáng/);
      const afternoonOk = (await place(v.id, asg.A1, 4, 7).expect(201)).body as TimetableSlotDto; // lớp A học cả hai buổi
      await principal.delete(`/timetable/slots/${afternoonOk.id}`).expect(204);
      await place(v.id, asg.A1, 2, 2).expect(201); // A1 có 2 tiết/tuần: đã có (1,2) và (2,2)
      const full = await place(v.id, asg.A1, 3, 2).expect(409);
      expect(full.body.message).toMatch(/đã đủ 2 tiết\/tuần/);
      expect((await place(v.id, asg.A1, 1, 10).expect(409)).body.message).toMatch(/không nằm trong khung/); // tiết 10 ngoài khung 9 tiết
      await place(v.id, asg.A1, 1, 11).expect(400); // ngoài khoảng cho phép
      const outside = await place(v.id, asg.B2, 6, 9).expect(409); // lớp B chỉ học sáng nên tiết 9 (chiều) bị chặn
      expect(outside.body.message).toMatch(/chỉ học buổi sáng/);
    });

    it('giáo viên đăng ký bận chỉ là cảnh báo: cần xác nhận mới xếp, xếp đè được ghi audit_logs', async () => {
      const teacher2 = await loginAs(t2.email);
      const saved = (await teacher2.put('/timetable/unavailability/mine').send({ slots: [{ day: 3, period: 3, note: 'họp tổ' }, { day: 3, period: 4 }] }).expect(200)).body;
      expect(saved).toHaveLength(2);
      await teacher2.put('/timetable/unavailability/mine').send({ slots: [{ day: 3, period: 3 }, { day: 3, period: 3 }] }).expect(400); // trùng
      await teacher2.put('/timetable/unavailability/mine').send({ slots: [{ day: 7, period: 3 }] }).expect(400);
      expect((await teacher2.get('/timetable/unavailability/mine').expect(200)).body).toHaveLength(2);
      await (await loginAs(SEED_STUDENT)).put('/timetable/unavailability/mine').send({ slots: [] }).expect(403); // chỉ giáo viên
      expect((await principal.get('/timetable/unavailability').query({ teacherId: t2.id }).expect(200)).body).toHaveLength(2);

      const refuse = await place(v.id, asg.A2, 3, 3).expect(409);
      expect(refuse.body.message).toMatch(/đăng ký bận Thứ Tư tiết 3 \(họp tổ\).*confirmUnavailable/);
      expect(await prisma.timetableSlot.count({ where: { timetableId: BigInt(v.id), day: 3, period: 3 } })).toBe(0);
      const before = await prisma.auditLog.count({ where: { action: 'timetable.override_unavailable' } });
      const ok = (await place(v.id, asg.A2, 3, 3, { confirmUnavailable: true }).expect(201)).body as TimetableSlotDto;
      expect(await prisma.auditLog.count({ where: { action: 'timetable.override_unavailable' } })).toBe(before + 1);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'timetable.override_unavailable' }, orderBy: { id: 'desc' } });
      expect(JSON.stringify(log.payload)).toContain('đăng ký bận');

      // Dời sang ô không bận: không cảnh báo, không ghi thêm.
      const moved = (await principal.patch(`/timetable/slots/${ok.id}`).send({ day: 3, period: 5 }).expect(200)).body as TimetableSlotDto;
      expect(moved).toMatchObject({ day: 3, period: 5 });
      expect(await prisma.auditLog.count({ where: { action: 'timetable.override_unavailable' } })).toBe(before + 1);
      // Dời vào ô trùng lớp: bị chặn; dời vào ô bận mà không xác nhận: bị chặn.
      await principal.patch(`/timetable/slots/${moved.id}`).send({ day: 1, period: 2 }).expect(409);
      await principal.patch(`/timetable/slots/${moved.id}`).send({ day: 3, period: 4 }).expect(409);
      await principal.delete(`/timetable/slots/${moved.id}`).expect(204);
      await principal.delete(`/timetable/slots/${moved.id}`).expect(404);
    });

    it('bảng ô đặt được: mỗi ô kèm lý do; thống kê lớp thiếu tiết và giáo viên dồn/trống tiết', async () => {
      const options = (await principal.get(`/timetable/versions/${v.id}/options`).query({ assignmentId: asg.B1 }).expect(200)).body as { day: number; period: number; ok: boolean; blocking: string[] }[];
      expect(options).toHaveLength(6 * 9);
      const at = (d: number, p: number) => options.find((o) => o.day === d && o.period === p)!;
      expect(at(1, 1)).toMatchObject({ ok: false });
      expect(at(1, 1).blocking[0]).toContain('Chào cờ');
      expect(at(1, 2)).toMatchObject({ ok: false }); // T1 đang dạy lớp A
      expect(at(1, 2).blocking[0]).toMatch(/đang dạy lớp/);
      expect(at(4, 7).blocking[0]).toMatch(/chỉ học buổi sáng/);
      expect(at(4, 3)).toMatchObject({ ok: true, blocking: [] });

      const stats = (await principal.get(`/timetable/versions/${v.id}/stats`).expect(200)).body;
      const missingA = stats.classes.find((c: { className: string }) => c.className === clsA.name).missing;
      expect(missingA).toEqual([expect.objectContaining({ assignmentId: asg.A2, missing: 2 })]); // A1 đủ 2 tiết, A2 chưa xếp
      const t1Stats = stats.teachers.find((t: { teacherId: string }) => t.teacherId === t1.id);
      expect(t1Stats.total).toBe(2);
      expect(t1Stats.days.find((d: { day: number }) => d.day === 1)).toMatchObject({ periods: 1, gaps: 0 });
    });
  });

  describe('công bố và ngày hiệu lực', () => {
    it('còn thiếu tiết thì không công bố được; ngày hiệu lực phải hợp lệ; bản nháp trống bị từ chối', async () => {
      const empty = await newVersion('Trống');
      expect((await principal.post(`/timetable/versions/${empty.id}/publish`).send({ effectiveDate: TODAY }).expect(409)).body.message).toMatch(/Chưa xếp tiết nào/);

      const v = await newVersion('Thiếu');
      await place(v.id, asg.A1, 1, 2).expect(201);
      const res = await principal.post(`/timetable/versions/${v.id}/publish`).send({ effectiveDate: TODAY }).expect(409);
      expect(res.body.message).toMatch(/Chưa thể công bố, còn \d+ vấn đề/);
      expect(res.body.message).toContain('thiếu');
      await fillAllRest(v.id);
      await principal.post(`/timetable/versions/${v.id}/publish`).send({ effectiveDate: addDays(TODAY, -1) }).expect(400);
      await principal.post(`/timetable/versions/${v.id}/publish`).send({ effectiveDate: '2100-01-01' }).expect(400); // sau khi kết thúc học kỳ 1
      await principal.post(`/timetable/versions/${v.id}/publish`).send({ effectiveDate: 'hôm nay' }).expect(400);
      expect((await prisma.timetable.findUniqueOrThrow({ where: { id: BigInt(v.id) } })).status).toBe('DRAFT');
      await principal.delete(`/timetable/versions/${v.id}`).expect(204);
      await principal.delete(`/timetable/versions/${empty.id}`).expect(204);
    });

    // Xếp nốt các tiết còn thiếu của một bản đã có (1,2) cho A1.
    async function fillAllRest(versionId: string) {
      for (const [a, d, p] of [
        [asg.A1, 2, 2],
        [asg.B1, 1, 3],
        [asg.B1, 2, 3],
        [asg.A2, 1, 4],
        [asg.A2, 2, 4],
        [asg.B2, 1, 5],
      ] as const) {
        await place(versionId, a, d, p).expect(201);
      }
    }

    it('công bố trước ngày hiệu lực: bản cũ vẫn dùng đến ngày đó; tuần sau thấy lịch mới; bản cũ chỉ ARCHIVED khi bản mới bắt đầu có hiệu lực', async () => {
      // Bản 1: công bố rồi lùi ngày hiệu lực về một tháng trước (mô phỏng đã công bố từ lâu).
      const v1 = await newVersion('Bản 1');
      await fillAll(v1.id);
      await principal.post(`/timetable/versions/${v1.id}/publish`).send({ effectiveDate: TODAY }).expect(200);
      await principal.post(`/timetable/versions/${v1.id}/publish`).send({ effectiveDate: TODAY }).expect(409); // đã công bố
      await prisma.timetable.update({ where: { id: BigInt(v1.id) }, data: { effectiveDate: new Date(`${addDays(TODAY, -30)}T00:00:00Z`) } });

      // Bản 2 (sao chép từ bản 1, đổi một tiết): công bố với ngày hiệu lực 7 ngày nữa.
      const v2 = await newVersion('Bản 2', sem1, v1.id);
      expect(v2.slotCount).toBe(7);
      const toMove = (await prisma.timetableSlot.findFirstOrThrow({ where: { timetableId: BigInt(v2.id), classId: BigInt(clsB.id), day: 1, period: 5 } })).id;
      await principal.patch(`/timetable/slots/${toMove}`).send({ day: 3, period: 2 }).expect(200);
      // Thứ Hai tuần sau: cả tuần sau dùng lịch mới, không phụ thuộc hôm nay là thứ mấy.
      const nextWeek = weekStart(addDays(TODAY, 7));
      const published = (await principal.post(`/timetable/versions/${v2.id}/publish`).send({ effectiveDate: nextWeek }).expect(200)).body as TimetableVersionDto;
      expect(published).toMatchObject({ status: 'PUBLISHED', effectiveDate: nextWeek, publishedByName: expect.any(String) });
      await principal.post(`/timetable/versions/${v2.id}/slots`).send({ assignmentId: asg.A1, day: 4, period: 2 }).expect(409); // đã công bố thì không sửa trực tiếp

      // Bản 1 vẫn PUBLISHED (bản 2 chưa tới ngày hiệu lực).
      let versions = (await principal.get('/timetable/versions').query({ semesterId: sem1 }).expect(200)).body as TimetableVersionDto[];
      expect(versions.find((x) => x.id === v1.id)!.status).toBe('PUBLISHED');
      expect(versions.find((x) => x.id === v2.id)!.status).toBe('PUBLISHED');

      // Tuần này (hôm nay) lịch cũ, tuần sau lịch mới — học sinh xem lịch lớp mình.
      const student = await loginAs(studentA.email);
      const thisWeek = (await student.get(`/timetable/view/class/${clsA.id}`).query({ date: TODAY }).expect(200)).body as WeekViewDto;
      const later = (await student.get(`/timetable/view/class/${clsB.id}`).query({ date: nextWeek }).expect(403)).body; // lớp khác: không xem được
      expect(later.message).toMatch(/lớp mình/);
      const bThis = (await principal.get(`/timetable/view/class/${clsB.id}`).query({ date: TODAY }).expect(200)).body as WeekViewDto;
      const bNext = (await principal.get(`/timetable/view/class/${clsB.id}`).query({ date: nextWeek }).expect(200)).body as WeekViewDto;
      const periodsOf = (w: WeekViewDto, day: number) => w.days.find((d) => d.day === day)!.slots.filter((s) => s.subjectName).map((s) => s.period);
      expect(periodsOf(bThis, 1)).toContain(5); // lịch cũ: B2 ở thứ Hai tiết 5
      expect(periodsOf(bNext, 1)).not.toContain(5); // lịch mới: đã dời sang thứ Tư tiết 2
      expect(periodsOf(bNext, 3)).toContain(2);
      expect(bThis.days.find((d) => d.day === 1)!.versionName).toBe(tag('Bản 1'));
      expect(bNext.days.find((d) => d.day === 1)!.versionName).toBe(tag('Bản 2'));
      expect(thisWeek.title).toBe(`Thời khoá biểu lớp ${clsA.name}`);
      expect(thisWeek.days.find((d) => d.day === 1)!.slots.some((s) => s.fixedName === 'Chào cờ')).toBe(true); // tiết cố định hiện cùng lịch
      expect(bThis.frame.periods).toHaveLength(9);

      // Hai bản không được cùng ngày hiệu lực.
      const v3 = await newVersion('Bản 3', sem1, v2.id);
      expect((await principal.post(`/timetable/versions/${v3.id}/publish`).send({ effectiveDate: nextWeek }).expect(409)).body.message).toMatch(/Đã có phiên bản/);
      await expect(prisma.timetable.update({ where: { id: BigInt(v3.id) }, data: { status: 'PUBLISHED', effectiveDate: new Date(`${nextWeek}T00:00:00Z`) } })).rejects.toThrow(); // CSDL cũng chặn
      await expect(prisma.timetable.update({ where: { id: BigInt(v3.id) }, data: { status: 'PUBLISHED', effectiveDate: null } })).rejects.toThrow(); // đã công bố phải có ngày hiệu lực
      await principal.delete(`/timetable/versions/${v3.id}`).expect(204);
      await principal.delete(`/timetable/versions/${v2.id}`).expect(409); // bản đã công bố giữ làm lịch sử

      // Đến ngày hiệu lực của bản 2 (mô phỏng bằng cách đưa ngày hiệu lực về hôm nay): bản 1 chuyển ARCHIVED khi truy vấn.
      await prisma.timetable.update({ where: { id: BigInt(v2.id) }, data: { effectiveDate: new Date(`${TODAY}T00:00:00Z`) } });
      versions = (await principal.get('/timetable/versions').query({ semesterId: sem1 }).expect(200)).body;
      expect(versions.find((x) => x.id === v1.id)!.status).toBe('ARCHIVED');
      expect(versions.find((x) => x.id === v2.id)!.status).toBe('PUBLISHED');
      // Lịch sử vẫn xem được: ngày trước ngày hiệu lực của bản 2 dùng bản 1 (đã lưu trữ).
      const past = (await principal.get(`/timetable/view/class/${clsB.id}`).query({ date: addDays(TODAY, -10) }).expect(200)).body as WeekViewDto;
      expect(past.days.find((d) => d.day === 1)!.versionName).toBe(tag('Bản 1'));
      expect(periodsOf(past, 1)).toContain(5);

      // Giáo viên được báo khi công bố (cả giáo viên có tiết ở bản trước).
      const notified = await prisma.notification.findMany({ where: { userId: { in: [BigInt(t1.id), BigInt(t2.id)] }, title: 'Thời khoá biểu mới' } });
      expect(new Set(notified.map((n) => n.userId.toString()))).toEqual(new Set([t1.id, t2.id]));
      expect(notified[0]!.body).toContain('áp dụng từ');
      expect(await prisma.notification.count({ where: { userId: BigInt(t3.id) } })).toBe(0); // giáo viên không có tiết thì không bị báo
      expect(await prisma.auditLog.count({ where: { action: 'timetable.publish' } })).toBeGreaterThanOrEqual(2);
    });
  });

  describe('xem lịch trong phạm vi quyền', () => {
    it('giáo viên xem lịch của mình và các lớp mình dạy; học sinh chỉ lớp mình; ADMIN và BGH xem hết', async () => {
      const teacher1 = await loginAs(t1.email);
      const mine = (await teacher1.get('/timetable/view/mine').query({ date: TODAY }).expect(200)).body as WeekViewDto;
      expect(mine.title).toContain(t1.name);
      const slots = mine.days.flatMap((d) => d.slots).filter((s) => s.subjectName);
      expect(slots.length).toBe(4); // T1 dạy 4 tiết
      expect(slots.every((s) => s.teacherName === t1.name)).toBe(true);
      expect(mine.days.flatMap((d) => d.slots).some((s) => s.className === 'Cả trường' && s.fixedName === 'Chào cờ')).toBe(true);

      expect((await teacher1.get(`/timetable/view/teacher/${t1.id}`).query({ date: TODAY }).expect(200)).body.title).toContain(t1.name);
      await teacher1.get(`/timetable/view/teacher/${t2.id}`).expect(403); // lịch của giáo viên khác
      await teacher1.get(`/timetable/view/class/${clsA.id}`).expect(200); // lớp mình dạy
      const teacher3 = await loginAs(t3.email);
      await teacher3.get(`/timetable/view/class/${clsA.id}`).expect(403); // không dạy lớp này
      expect((await teacher3.get('/timetable/view/mine').expect(200)).body.days.flatMap((d: { slots: { subjectName: string | null }[] }) => d.slots).filter((s: { subjectName: string | null }) => s.subjectName)).toHaveLength(0);

      const student = await loginAs(studentA.email);
      await student.get(`/timetable/view/class/${clsA.id}`).expect(200);
      await student.get(`/timetable/view/class/${clsB.id}`).expect(403);
      await student.get(`/timetable/view/teacher/${t1.id}`).expect(403);
      const seedStudent = await loginAs(SEED_STUDENT);
      await seedStudent.get(`/timetable/view/class/${clsA.id}`).expect(403);
      const seedMine = (await seedStudent.get('/timetable/view/mine').expect(200)).body as WeekViewDto;
      expect(seedMine.title).toBe('Thời khoá biểu lớp 10A1'); // học sinh thấy lịch lớp của mình (năm học hiện hành)
      expect(seedMine.days.flatMap((d) => d.slots).every((s) => s.className === '10A1')).toBe(true);

      await admin.get(`/timetable/view/class/${clsB.id}`).expect(200);
      await admin.get(`/timetable/view/teacher/${t2.id}`).expect(200);
      await principal.get(`/timetable/view/teacher/${t2.id}`).query({ date: TODAY }).expect(200);
      await principal.get(`/timetable/view/class/999999999`).expect(404);
      await principal.get(`/timetable/view/class/${clsA.id}`).query({ date: 'x' }).expect(400);
    });
  });

  describe('đổi phân công sau khi đã xếp lịch', () => {
    it('đổi giáo viên của phân công: tiết bản nháp và bản đã công bố đồng bộ, bản lưu trữ giữ nguyên, báo giáo viên cũ và mới; trùng giờ thì từ chối', async () => {
      const published = (await prisma.timetable.findMany({ where: { semester: { schoolYear: { name: YEAR } }, status: 'PUBLISHED' } }))[0]!;
      const archived = await prisma.timetable.findFirstOrThrow({ where: { semester: { schoolYear: { name: YEAR } }, status: 'ARCHIVED' } });
      const draft = await newVersion('Nháp đồng bộ', sem1, published.id.toString());
      const before = await prisma.notification.count({ where: { userId: { in: [BigInt(t2.id), BigInt(t3.id)] }, title: 'Thay đổi thời khoá biểu' } });

      // T3 chưa có tiết: đổi B2 (T2 → T3) thành công, slot ở bản nháp và bản đã công bố đổi theo, bản lưu trữ giữ T2.
      await principal.patch(`/teaching/assignments/${asg.B2}`).send({ teacherId: t3.id }).expect(200);
      const teacherOf = async (timetableId: bigint) => (await prisma.timetableSlot.findFirstOrThrow({ where: { timetableId, assignmentId: BigInt(asg.B2) } })).teacherId.toString();
      expect(await teacherOf(BigInt(draft.id))).toBe(t3.id);
      expect(await teacherOf(published.id)).toBe(t3.id);
      expect(await teacherOf(archived.id)).toBe(t2.id);
      expect(await prisma.notification.count({ where: { userId: { in: [BigInt(t2.id), BigInt(t3.id)] }, title: 'Thay đổi thời khoá biểu' } })).toBe(before + 2);
      expect(JSON.stringify((await prisma.auditLog.findFirstOrThrow({ where: { action: 'teaching.update', targetId: BigInt(clsB.id) }, orderBy: { id: 'desc' } })).payload)).toContain('timetableSlotsSynced');

      // Đổi A2 sang T3 nhưng T3 đã có B2 ở tiết (1,5) thì không trùng; tạo trùng: A1 (T1) có (1,2); gán B2→T1 trong khi T1 có tiết ở (1,5)? Không có.
      // Dùng chắc chắn: A2 (1,4) sang T3 khi T3 có B2 ở (1,5) thì ổn; còn B1 (1,3) sang T3 trùng? T3 không có (1,3). Tạo trùng thật bằng cách đưa slot B2 về (1,4) của bản nháp.
      const clash = await prisma.timetableSlot.findFirstOrThrow({ where: { timetableId: BigInt(draft.id), assignmentId: BigInt(asg.B2) } });
      await prisma.timetableSlot.update({ where: { id: clash.id }, data: { day: 2, period: 4 } }); // T3 ở (2,4); A2 của T2 cũng ở (2,4) trong bản nháp
      const refuse = await principal.patch(`/teaching/assignments/${asg.A2}`).send({ teacherId: t3.id }).expect(409);
      expect(refuse.body.message).toMatch(/trùng giờ trong thời khoá biểu/);
      expect((await prisma.teachingAssignment.findUniqueOrThrow({ where: { id: BigInt(asg.A2) } })).teacherId.toString()).toBe(t2.id); // không đổi gì

      // Giảm số tiết dưới số đã xếp bị chặn; xoá phân công đang nằm trong bản đã công bố bị chặn.
      await principal.patch(`/teaching/assignments/${asg.A1}`).send({ periodsPerWeek: 1 }).expect(409).expect((r) => expect(r.body.message).toMatch(/đang được xếp 2 tiết/));
      await principal.delete(`/teaching/assignments/${asg.A1}`).expect(409).expect((r) => expect(r.body.message).toMatch(/đã công bố/));
      await principal.delete(`/timetable/versions/${draft.id}`).expect(204); // bỏ bản nháp đã bị sửa tay trước khi trả giáo viên
      await principal.patch(`/teaching/assignments/${asg.B2}`).send({ teacherId: t2.id }).expect(200); // trả lại
    });
  });

  describe('xuất Excel và tool Agent', () => {
    it('xuất theo lớp, giáo viên, toàn trường; ô bắt đầu bằng "=" được thêm dấu nháy', async () => {
      const download = async (query: Record<string, string>) => {
        const res = await principal
          .get('/timetable/export')
          .query(query)
          .buffer(true)
          .parse((r, cb) => {
            const chunks: Buffer[] = [];
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => cb(null, Buffer.concat(chunks)));
          })
          .expect(200);
        expect(res.headers['content-type']).toContain('spreadsheetml');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
        const cells: string[] = [];
        wb.worksheets.forEach((w) => w.eachRow((row) => row.eachCell((c) => typeof c.value === 'string' && cells.push(c.value))));
        return { wb, cells };
      };
      const cls = await download({ scope: 'class', id: clsA.id });
      expect(cls.wb.worksheets).toHaveLength(1);
      expect(cls.cells.some((c) => c.includes(`Môn T1 ${RUN}`))).toBe(true);
      expect(cls.cells.some((c) => c.includes('Tiết 1 (07:00–07:45)'))).toBe(true);
      const teacher = await download({ scope: 'teacher', id: t2.id });
      expect(teacher.cells.some((c) => c.includes(clsA.name))).toBe(true);
      const school = await download({ scope: 'school' });
      expect(school.wb.worksheets.map((w) => w.name)).toContain('Toàn trường');
      expect(school.wb.worksheets.length).toBeGreaterThanOrEqual(3); // toàn trường + mỗi lớp một sheet
      for (const { cells } of [cls, teacher, school]) expect(cells.filter((c) => /^[=+\-@]/.test(c))).toEqual([]);
      expect(school.cells).toContain(`'=HYPERLINK("http://evil")`);
      await principal.get('/timetable/export').query({ scope: 'class' }).expect(400); // thiếu id lớp
      await principal.get('/timetable/export').query({ scope: 'khac' }).expect(400);
    });

    it('tool get_timetable chỉ đọc, trả đúng lịch và tôn trọng phạm vi quyền', async () => {
      const tools = app.get(TimetableAgentTools);
      const run = async (email: string, args: Record<string, unknown>) => {
        const login = await prisma.user.findUniqueOrThrow({ where: { email } });
        const user = { id: login.id.toString(), email, fullName: login.fullName, roles: [] as never[], permissions: [] as never[] };
        // Quyền thật của người dùng (đọc như JwtAuthGuard).
        const perms = await prisma.rolePermission.findMany({ where: { role: { users: { some: { userId: login.id } } } }, include: { permission: true } });
        user.permissions = perms.map((p) => p.permission.code) as never[];
        const [tool] = tools.buildTools({ user, channel: 'web' }) as unknown as Tool[];
        expect(tool!.name).toBe('get_timetable');
        return tool!.handler(args, {});
      };
      const monday = addDays(TODAY, 1 - (new Date(`${TODAY}T00:00:00Z`).getUTCDay() || 7)); // thứ Hai của tuần này

      // BGH tra giáo viên theo tên: thấy tiết ngày thứ Hai (Chào cờ + tiết của T1).
      const principalRes = await run(PRINCIPAL, { teacherName: t1.name, date: monday });
      const data = JSON.parse(principalRes.content[0]!.text!);
      expect(data.title).toContain(t1.name);
      expect(data.weekday).toBe('Thứ Hai');
      expect(data.periods.some((p: { subject: string }) => p.subject === `Môn T1 ${RUN}`)).toBe(true);
      expect(data.periods.some((p: { subject: string; time: string }) => p.subject === 'Chào cờ' && p.time === '07:00–07:45')).toBe(true);
      // Tra theo lớp.
      expect(JSON.parse((await run(PRINCIPAL, { className: clsA.name, date: monday })).content[0]!.text!).periods.length).toBeGreaterThan(0);
      // Giáo viên tra lịch của chính mình (không truyền gì) và lớp mình dạy; không tra được giáo viên khác.
      expect(JSON.parse((await run(t1.email, { date: monday })).content[0]!.text!).title).toContain(t1.name);
      expect(JSON.parse((await run(t1.email, { className: clsA.name, date: monday })).content[0]!.text!).periods.length).toBeGreaterThan(0);
      await expect(run(t1.email, { teacherName: t2.name, date: monday })).rejects.toThrow(/chỉ xem được lịch dạy của chính mình/);
      await expect(run(t3.email, { className: clsA.name, date: monday })).rejects.toThrow(/lớp mình/);
      // Học sinh chỉ lớp mình.
      await expect(run(studentA.email, { className: clsB.name, date: monday })).rejects.toThrow();
      expect(JSON.parse((await run(studentA.email, { className: clsA.name, date: monday })).content[0]!.text!).periods.length).toBeGreaterThan(0);
      await expect(run(PRINCIPAL, { teacherName: 'không có ai tên này', date: monday })).rejects.toThrow(/Không tìm thấy giáo viên/);
      // Chủ nhật không có tiết học; ngày sai định dạng bị schema của tool từ chối ở tầng SDK (ở đây: ngày hợp lệ).
      expect(JSON.parse((await run(PRINCIPAL, { className: clsA.name, date: addDays(monday, 6) })).content[0]!.text!).periods).toEqual([]);
    });
  });
});
