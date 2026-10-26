// Bước 19 – xem điểm theo vai trò, điểm trung bình, thống kê, hạn nhập/khoá sổ, đề nghị điều chỉnh sau hạn, xuất Excel.
// Cần PostgreSQL đã migrate + seed và Redis. Dữ liệu do test tạo mang hậu tố RUN và được dọn khi xong; hạn nhập và khoá sổ
// của học kỳ được trả về đúng như trước khi chạy.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  AssessmentDto,
  ClassSummaryDto,
  GradebookDto,
  ScoreAdjustmentDto,
  ScoreStatsDto,
  StudentReportDto,
} from '@pvh/shared';
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
const PAST = '2020-01-01T23:59:59+07:00';
const startedAt = new Date();

type Agent = ReturnType<typeof request.agent>;
type Person = { id: string; email: string; code: string };

describe('Xem điểm, thống kê, khoá sổ, điều chỉnh điểm (bước 19, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;
  let principal: Agent;
  let teacher: Agent; // dạy môn A lớp P cả năm
  let homeroom: Agent; // chủ nhiệm lớp P, không dạy môn A
  let student1: Agent;
  let principalId: string;
  let yearId: bigint;
  let sem1: { id: bigint; start: string };
  let subjectA: string;
  let clsP: { id: string; name: string };
  let clsQ: { id: string; name: string };
  let t1: Person;
  let t2: Person;
  const studentsP: Person[] = [];
  let studentQ: Person;
  const userIds: bigint[] = [];
  let tx1: AssessmentDto;
  let tx2: AssessmentDto;
  let gk: AssessmentDto;
  let ck: AssessmentDto;
  // Trạng thái hạn nhập/khoá sổ của học kỳ trước khi chạy (để trả lại).
  let savedDeadlines: { type: 'THUONG_XUYEN' | 'GIUA_KY' | 'CUOI_KY'; deadline: Date; updatedBy: bigint }[] = [];
  let savedLock: { reason: string | null; lockedBy: bigint; lockedAt: Date } | null = null;
  let savedFormula: { value: string; updatedBy: bigint | null } | null = null;

  async function loginAs(identifier: string): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password: PASSWORD }).expect(200);
    return agent;
  }

  async function makeUser(role: 'TEACHER' | 'STUDENT', code: string, classId?: string): Promise<Person> {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const email = `e19.${code.toLowerCase()}@pvh.edu.vn`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: role === 'TEACHER' ? `GV ${code}` : `Học Sinh ${code}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: { roleId: r.id } },
        ...(role === 'TEACHER'
          ? { teacherProfile: { create: { teacherCode: code } } }
          : {
              studentProfile: { create: { studentCode: code } },
              enrollments: { create: { classId: BigInt(classId!), schoolYearId: yearId } },
            }),
      },
    });
    userIds.push(user.id);
    return { id: user.id.toString(), email, code };
  }

  const sheetPath = (a: AssessmentDto, classId: string) => `/scores/assessments/${a.id}/classes/${classId}`;
  const save = (a: AssessmentDto, entries: { studentId: string; value: string | number | null }[]) =>
    teacher.put(sheetPath(a, clsP.id)).send({ entries });
  const gradebookQs = () => `classId=${clsP.id}&subjectId=${subjectA}&semesterId=${sem1.id}`;
  const scoreOf = (a: AssessmentDto, studentId: string) =>
    prisma.score.findUnique({ where: { assessmentId_studentId: { assessmentId: BigInt(a.id), studentId: BigInt(studentId) } } });
  const adjust = (agent: Agent, a: AssessmentDto, studentId: string, value: string | null, reason = 'Chấm sót câu 3, đã có biên bản') =>
    agent.post('/scores/adjustments').send({ assessmentId: a.id, classId: clsP.id, studentId, value, reason });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await loginAs(ADMIN);
    principal = await loginAs(PRINCIPAL);
    principalId = (await principal.get('/auth/me').expect(200)).body.id;

    const year = await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true }, include: { semesters: { orderBy: { number: 'asc' } } } });
    yearId = year.id;
    sem1 = { id: year.semesters[0]!.id, start: year.semesters[0]!.startDate.toISOString().slice(0, 10) };
    savedDeadlines = await prisma.scoreDeadline.findMany({ where: { semesterId: sem1.id }, select: { type: true, deadline: true, updatedBy: true } });
    savedLock = await prisma.scoreLock.findUnique({ where: { semesterId: sem1.id }, select: { reason: true, lockedBy: true, lockedAt: true } });
    savedFormula = await prisma.systemSetting.findUnique({ where: { key: 'scores.formula' }, select: { value: true, updatedBy: true } });
    // Bắt đầu từ trạng thái chưa có hạn chung, chưa khoá sổ, công thức mặc định.
    await prisma.scoreDeadline.deleteMany({ where: { semesterId: sem1.id } });
    await prisma.scoreLock.deleteMany({ where: { semesterId: sem1.id } });
    await prisma.systemSetting.deleteMany({ where: { key: 'scores.formula' } });

    subjectA = (await admin.post('/academic/subjects').send({ code: tag('DV'), name: `Môn xem điểm ${RUN}` }).expect(201)).body.id;
    clsP = (await admin.post('/academic/classes').send({ name: tag('VP'), gradeLevel: 12 }).expect(201)).body;
    clsQ = (await admin.post('/academic/classes').send({ name: tag('VQ'), gradeLevel: 12 }).expect(201)).body;

    t1 = await makeUser('TEACHER', tag('E19A'));
    t2 = await makeUser('TEACHER', tag('E19B'));
    for (let i = 1; i <= 3; i++) studentsP.push(await makeUser('STUDENT', tag(`VP${i}H`), clsP.id));
    studentQ = await makeUser('STUDENT', tag('VQ1H'), clsQ.id);
    await prisma.schoolClass.update({ where: { id: BigInt(clsP.id) }, data: { homeroomTeacherId: BigInt(t2.id) } });
    // 1 tiết/tuần → cần tối thiểu 2 điểm thường xuyên.
    await prisma.teachingAssignment.create({
      data: { schoolYearId: yearId, classId: BigInt(clsP.id), subjectId: BigInt(subjectA), teacherId: BigInt(t1.id), periodsPerWeek: 1 },
    });

    teacher = await loginAs(t1.email);
    homeroom = await loginAs(t2.email);
    student1 = await loginAs(studentsP[0]!.email);
    const limits = app.get(RateLimitService);
    for (const id of [t1.id, t2.id, principalId, studentsP[0]!.id]) {
      for (const name of ['score-write', 'score-read', 'score-export']) await limits.reset(name, id);
    }

    // Hai đợt thường xuyên (giáo viên), giữa kỳ và cuối kỳ (BGH, chỉ lớp P).
    const createTx = () =>
      teacher.post('/scores/assessments').send({ type: 'THUONG_XUYEN', semesterId: sem1.id.toString(), subjectId: subjectA, classId: clsP.id, testDate: sem1.start });
    tx1 = (await createTx().expect(201)).body;
    tx2 = (await createTx().expect(201)).body;
    const createShared = (type: 'GIUA_KY' | 'CUOI_KY') =>
      principal
        .post('/scores/assessments')
        .send({ type, semesterId: sem1.id.toString(), subjectId: subjectA, gradeLevel: 12, classIds: [clsP.id], testDate: sem1.start, code: tag(`${type === 'GIUA_KY' ? 'GKV' : 'CKV'}-`) });
    gk = (await createShared('GIUA_KY').expect(201)).body;
    ck = (await createShared('CUOI_KY').expect(201)).body;

    // Điểm: HS1 8 | 6 | 7 | 9 ; HS2 4 | – | 3 | 4 ; HS3 10 | – | 9 | 10. Công bố TX1, GK, CK; TX2 còn nháp.
    const [s1, s2, s3] = studentsP.map((s) => s.id);
    await save(tx1, [{ studentId: s1!, value: 8 }, { studentId: s2!, value: 4 }, { studentId: s3!, value: 10 }]).expect(200);
    await save(tx2, [{ studentId: s1!, value: 6 }]).expect(200);
    await save(gk, [{ studentId: s1!, value: 7 }, { studentId: s2!, value: 3 }, { studentId: s3!, value: 9 }]).expect(200);
    await save(ck, [{ studentId: s1!, value: 9 }, { studentId: s2!, value: 4 }, { studentId: s3!, value: 10 }]).expect(200);
    for (const a of [tx1, gk, ck]) await teacher.post(`${sheetPath(a, clsP.id)}/publish`).expect(200);
  });

  afterAll(async () => {
    const classes = [BigInt(clsP.id), BigInt(clsQ.id)];
    const aIds = (await prisma.assessment.findMany({ where: { subjectId: BigInt(subjectA) }, select: { id: true } })).map((a) => a.id);
    const adjIds = (await prisma.scoreAdjustment.findMany({ where: { assessmentId: { in: aIds } }, select: { id: true } })).map((a) => a.id);
    await prisma.scoreAdjustment.deleteMany({ where: { id: { in: adjIds } } });
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL pvh.allow_score_history_purge = 'on'`),
      prisma.scoreHistory.deleteMany({ where: { assessmentId: { in: aIds } } }),
    ]);
    await prisma.score.deleteMany({ where: { assessmentId: { in: aIds } } });
    await prisma.assessment.deleteMany({ where: { id: { in: aIds } } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { targetType: 'assessment', targetId: { in: aIds } },
          { targetType: 'score_adjustment', targetId: { in: adjIds } },
          { targetType: 'user', targetId: { in: userIds } },
          // Hạn nhập, khoá sổ, công thức do BGH đặt trong lúc chạy test.
          {
            userId: BigInt(principalId),
            action: { in: ['score.deadline.set', 'score.lock', 'score.unlock', 'score.formula.update'] },
            createdAt: { gte: startedAt },
          },
        ],
      },
    });
    // Tin "có đề nghị điều chỉnh" gửi cho mọi tài khoản BGH (kể cả tài khoản seed) trong lúc chạy.
    await prisma.notification.deleteMany({ where: { channel: 'web', body: { contains: clsP.name } } });
    // Trả lại hạn nhập, khoá sổ, công thức như trước khi chạy.
    await prisma.scoreDeadline.deleteMany({ where: { semesterId: sem1.id } });
    if (savedDeadlines.length) await prisma.scoreDeadline.createMany({ data: savedDeadlines.map((d) => ({ ...d, semesterId: sem1.id })) });
    await prisma.scoreLock.deleteMany({ where: { semesterId: sem1.id } });
    if (savedLock) await prisma.scoreLock.create({ data: { ...savedLock, semesterId: sem1.id } });
    await prisma.systemSetting.deleteMany({ where: { key: 'scores.formula' } });
    if (savedFormula) await prisma.systemSetting.create({ data: { key: 'scores.formula', ...savedFormula } });

    await prisma.teachingAssignment.deleteMany({ where: { classId: { in: classes } } });
    await prisma.classEnrollment.deleteMany({ where: { classId: { in: classes } } });
    await prisma.schoolClass.updateMany({ where: { id: { in: classes } }, data: { homeroomTeacherId: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classes } } });
    await prisma.subject.deleteMany({ where: { id: BigInt(subjectA) } });
    await app.close();
  });

  describe('quyền và phạm vi xem', () => {
    it('ADMIN, biên tập viên bị 403 mọi API xem điểm; học sinh chỉ có trang điểm của mình', async () => {
      const editor = await loginAs(EDITOR);
      for (const who of [admin, editor, student1]) {
        await who.get(`/scores/gradebook?${gradebookQs()}`).expect(403);
        await who.get(`/scores/gradebook/export?${gradebookQs()}`).expect(403);
        await who.get(`/scores/classes/${clsP.id}/summary`).expect(403);
        await who.get(`/scores/classes/${clsP.id}/summary/export`).expect(403);
        await who.get(`/scores/students/${studentsP[1]!.id}/report`).expect(403);
        await who.get('/scores/stats').expect(403);
        await who.get('/scores/locks').expect(403);
        await who.put('/scores/deadlines').send({ semesterId: sem1.id.toString(), type: 'GIUA_KY', deadline: PAST }).expect(403);
        await who.put(`/scores/locks/${sem1.id}`).send({ locked: true }).expect(403);
        await who.get('/scores/adjustments').expect(403);
        await adjust(who, tx1, studentsP[1]!.id, '5').expect(403);
      }
      await admin.get('/scores/me').expect(403);
      await editor.get('/scores/me').expect(403);
      await teacher.get('/scores/me').expect(403);
      await request(app.getHttpServer()).get('/scores/me').expect(401);
    });

    it('học sinh: chỉ điểm của chính mình, chỉ điểm đã công bố, ĐTB tạm tính khi thiếu cột', async () => {
      const report = (await student1.get('/scores/me').expect(200)).body as StudentReportDto;
      expect(report.studentId).toBe(studentsP[0]!.id);
      expect(report.publishedOnly).toBe(true);
      expect(report.className).toBe(clsP.name);
      const sem = report.semesters.find((s) => s.semesterId === sem1.id.toString())!;
      const sub = sem.subjects.find((s) => s.subjectId === subjectA)!;
      // TX2 còn nháp nên không hiện; mỗi điểm kèm mã đợt thi.
      expect(sub.entries.map((e) => [e.code, e.value])).toEqual([
        [tx1.code, '8'],
        [gk.code, '7'],
        [ck.code, '9'],
      ]);
      expect(sub.entries.every((e) => e.published)).toBe(true);
      // (8 + 2×7 + 3×9) / 6 = 8,17 → 8,2; mới có 1/2 điểm thường xuyên → tạm tính.
      expect(sub.average).toEqual({ value: 8.2, provisional: true, missing: ['Thiếu 1 điểm thường xuyên (cần tối thiểu 2)'] });
      // Không có dữ liệu của học sinh khác trong phản hồi.
      const body = JSON.stringify(report);
      for (const other of [studentsP[1]!, studentsP[2]!, studentQ]) {
        expect(body).not.toContain(other.code);
        expect(body).not.toContain(other.id);
      }
    });

    it('giáo viên bộ môn: sổ điểm lớp–môn mình dạy, gồm cả nháp, ĐTB đủ cột', async () => {
      const g = (await teacher.get(`/scores/gradebook?${gradebookQs()}`).expect(200)).body as GradebookDto;
      expect(g.view).toBe('TEACHER');
      expect(g.publishedOnly).toBe(false);
      expect(g.periodsPerWeek).toBe(1);
      expect(g.requiredRegular).toBe(2);
      expect(g.columns.map((c) => [c.code, c.status])).toEqual([
        [tx1.code, 'PUBLISHED'],
        [tx2.code, 'DRAFT'],
        [gk.code, 'PUBLISHED'],
        [ck.code, 'PUBLISHED'],
      ]);
      const row = g.rows.find((r) => r.studentId === studentsP[0]!.id)!;
      expect(row.cells.map((c) => c.value)).toEqual(['8', '6', '7', '9']);
      // (8 + 6 + 2×7 + 3×9) / 7 = 7,86 → 7,9
      expect(row.average).toEqual({ value: 7.9, provisional: false, missing: [] });
      expect(g.canRequestAdjustment).toBe(false);
      // Lớp khác, môn khác: 403 (không lộ có tồn tại hay không).
      await teacher.get(`/scores/gradebook?classId=${clsQ.id}&subjectId=${subjectA}&semesterId=${sem1.id}`).expect(403);
      await teacher.get(`/scores/gradebook?classId=${clsP.id}&subjectId=999999999&semesterId=${sem1.id}`).expect(403);
      await teacher.get(`/scores/classes/${clsP.id}/summary`).expect(403); // không chủ nhiệm lớp P
    });

    it('giáo viên chủ nhiệm: chỉ lớp mình, chỉ điểm đã công bố', async () => {
      const ctx = (await homeroom.get('/scores/context').expect(200)).body;
      expect(ctx.homeroomClasses).toEqual([{ id: clsP.id, name: clsP.name }]);

      const g = (await homeroom.get(`/scores/gradebook?${gradebookQs()}`).expect(200)).body as GradebookDto;
      expect(g.view).toBe('HOMEROOM');
      expect(g.columns.map((c) => c.code)).toEqual([tx1.code, gk.code, ck.code]);
      expect(JSON.stringify(g)).not.toContain(tx2.code);

      const summary = (await homeroom.get(`/scores/classes/${clsP.id}/summary?semesterId=${sem1.id}`).expect(200)).body as ClassSummaryDto;
      expect(summary.view).toBe('HOMEROOM');
      const col = summary.subjects.findIndex((s) => s.id === subjectA);
      expect(col).toBeGreaterThanOrEqual(0);
      const byCode = new Map(summary.rows.map((r) => [r.studentCode, r.averages[col]?.value]));
      expect(byCode.get(studentsP[0]!.code)).toBe(8.2);
      expect(byCode.get(studentsP[1]!.code)).toBe(3.7); // (4 + 6 + 12) / 6
      expect(byCode.get(studentsP[2]!.code)).toBe(9.7); // (10 + 18 + 30) / 6
      // Cả năm: chưa có học kỳ II → chưa tính.
      const year = (await homeroom.get(`/scores/classes/${clsP.id}/summary`).expect(200)).body as ClassSummaryDto;
      expect(year.periodName).toBe('Cả năm');
      expect(year.rows[0]!.averages[col]).toMatchObject({ value: null, missing: ['Chưa có điểm trung bình học kỳ II'] });

      const report = (await homeroom.get(`/scores/students/${studentsP[0]!.id}/report`).expect(200)).body as StudentReportDto;
      expect(report.publishedOnly).toBe(true);
      await homeroom.get(`/scores/classes/${clsQ.id}/summary`).expect(403);
      await homeroom.get(`/scores/students/${studentQ.id}/report`).expect(403);
      await homeroom.get('/scores/stats').expect(403);
    });

    it('BGH: toàn trường, sổ điểm cả nháp, tra cứu học sinh', async () => {
      const g = (await principal.get(`/scores/gradebook?${gradebookQs()}`).expect(200)).body as GradebookDto;
      expect(g.view).toBe('PRINCIPAL');
      expect(g.columns).toHaveLength(4);
      const report = (await principal.get(`/scores/students/${studentsP[0]!.id}/report`).expect(200)).body as StudentReportDto;
      expect(report.publishedOnly).toBe(false);
      const entries = report.semesters.flatMap((s) => s.subjects).find((s) => s.subjectId === subjectA)!.entries;
      expect(entries.find((e) => e.code === tx2.code)).toMatchObject({ value: '6', published: false });
      await principal.get(`/scores/classes/${clsQ.id}/summary`).expect(200);
    });
  });

  describe('thống kê (chỉ điểm đã công bố)', () => {
    it('phổ điểm, tỉ lệ dưới 5, trung bình theo lớp–môn, môn–khối, lớp, khối', async () => {
      const stats = (await principal.get(`/scores/stats?semesterId=${sem1.id}&gradeLevel=12&subjectId=${subjectA}`).expect(200)).body as ScoreStatsDto;
      const cs = stats.byClassSubject.find((s) => s.classId === clsP.id && s.subjectId === subjectA)!;
      expect(cs).toMatchObject({ averaged: 3, below5: 1, buckets: [0, 1, 0, 0, 2], mean: 7.2 }); // (8,2 + 3,7 + 9,7) / 3
      expect(cs.provisional).toBe(3); // mỗi em mới có 1 điểm thường xuyên đã công bố
      expect(stats.bySubject.find((s) => s.subjectId === subjectA && s.gradeLevel === 12)).toMatchObject({ averaged: 3, below5: 1 });
      expect(stats.byClass.find((s) => s.classId === clsP.id)).toMatchObject({ averaged: 3 });
      expect(stats.byGrade.find((s) => s.gradeLevel === 12)!.averaged).toBeGreaterThanOrEqual(3);
    });
  });

  describe('xuất Excel', () => {
    it('giáo viên xuất sổ điểm, chủ nhiệm xuất bảng tổng hợp; ghi audit không có giá trị điểm', async () => {
      const res = await teacher.get(`/scores/gradebook/export?${gradebookQs()}`).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      await homeroom.get(`/scores/classes/${clsP.id}/summary/export?semesterId=${sem1.id}`).expect(200);
      const logs = await prisma.auditLog.findMany({ where: { action: 'score.export', userId: { in: [BigInt(t1.id), BigInt(t2.id)] } } });
      expect(logs).toHaveLength(2);
      for (const log of logs) {
        const params = (log.payload as { params: Record<string, unknown> }).params;
        expect(Object.keys(params)).toEqual(expect.arrayContaining(['kind', 'class', 'rows']));
        expect(JSON.stringify(params)).not.toMatch(/"(8|9|7|3|4|10)(\.\d+)?"/);
      }
    });
  });

  describe('thông báo khi công bố', () => {
    it('học sinh nhận thông báo trong cổng (kênh web), không kèm giá trị điểm, không qua Telegram', async () => {
      const rows = await prisma.notification.findMany({ where: { userId: BigInt(studentsP[0]!.id) } });
      expect(rows.length).toBe(3); // TX1, GK, CK
      expect(rows.every((r) => r.channel === 'web')).toBe(true);
      for (const r of rows) {
        expect(r.title).toContain(`Môn xem điểm ${RUN}`);
        expect(r.body).not.toMatch(/\b(7|8|9)\b/);
      }
    });
  });

  describe('hạn nhập, khoá sổ, đề nghị điều chỉnh', () => {
    it('còn trong hạn thì không gửi đề nghị (sửa trực tiếp)', async () => {
      await adjust(teacher, tx1, studentsP[0]!.id, '9').expect(409);
    });

    it('BGH đặt hạn chung theo học kỳ–loại đợt; quá hạn thì giáo viên không sửa trực tiếp được', async () => {
      await teacher.put('/scores/deadlines').send({ semesterId: sem1.id.toString(), type: 'THUONG_XUYEN', deadline: PAST }).expect(403);
      const locks = (await principal.put('/scores/deadlines').send({ semesterId: sem1.id.toString(), type: 'THUONG_XUYEN', deadline: PAST }).expect(200)).body;
      expect(locks.find((l: { semesterId: string }) => l.semesterId === sem1.id.toString()).deadlines).toContainEqual({
        type: 'THUONG_XUYEN',
        deadline: new Date(PAST).toISOString(),
      });
      const res = await save(tx2, [{ studentId: studentsP[1]!.id, value: 5 }]).expect(409);
      expect(res.body.message).toContain('đề nghị điều chỉnh');
      const sheet = (await teacher.get(sheetPath(tx2, clsP.id)).expect(200)).body;
      expect(sheet).toMatchObject({ deadlinePassed: true, canEdit: false, effectiveDeadline: new Date(PAST).toISOString() });
      // Đợt giữa kỳ không chịu hạn của loại thường xuyên.
      await save(gk, [{ studentId: studentsP[0]!.id, value: 7 }]).expect(200);
      const g = (await teacher.get(`/scores/gradebook?${gradebookQs()}`).expect(200)).body as GradebookDto;
      expect(g.columns.filter((c) => c.locked).map((c) => c.code)).toEqual([tx1.code, tx2.code]);
      expect(g.canRequestAdjustment).toBe(true);
    });

    it('khoá sổ học kỳ chặn mọi sửa trực tiếp; mở khoá thì sửa lại được', async () => {
      await principal.put(`/scores/locks/${sem1.id}`).send({ locked: true, reason: 'Chốt sổ học kỳ I' }).expect(200);
      const res = await save(gk, [{ studentId: studentsP[0]!.id, value: 7.5 }]).expect(409);
      expect(res.body.message).toContain('khoá sổ');
      const locks = (await principal.get('/scores/locks').expect(200)).body;
      expect(locks.find((l: { semesterId: string }) => l.semesterId === sem1.id.toString())).toMatchObject({ locked: true, reason: 'Chốt sổ học kỳ I' });
      await principal.put(`/scores/locks/${sem1.id}`).send({ locked: false }).expect(200);
      await save(gk, [{ studentId: studentsP[0]!.id, value: 7 }]).expect(200);
    });

    let adjId: string;

    it('giáo viên gửi đề nghị kèm lý do; chỉ một đề nghị chờ cho mỗi học sinh–đợt; ngoài phạm vi bị 403', async () => {
      await adjust(teacher, tx1, studentsP[0]!.id, '9', 'ngắn').expect(400); // lý do quá ngắn
      await adjust(teacher, tx1, studentsP[0]!.id, '8').expect(400); // giống điểm hiện tại
      await adjust(teacher, tx1, studentsP[0]!.id, '11').expect(400);
      const adj = (await adjust(teacher, tx1, studentsP[0]!.id, '9,5').expect(201)).body as ScoreAdjustmentDto;
      expect(adj).toMatchObject({ status: 'PENDING', oldValue: '8', newValue: '9.5', newStatus: 'GRADED', requestedById: t1.id });
      adjId = adj.id;
      await adjust(teacher, tx1, studentsP[0]!.id, '10').expect(409);
      await adjust(homeroom, tx1, studentsP[0]!.id, '10').expect(403);

      expect(((await teacher.get('/scores/adjustments').expect(200)).body as ScoreAdjustmentDto[]).map((a) => a.id)).toContain(adjId);
      expect((await homeroom.get('/scores/adjustments').expect(200)).body).toEqual([]);
      const pending = (await principal.get('/scores/adjustments?status=PENDING').expect(200)).body as ScoreAdjustmentDto[];
      expect(pending.map((a) => a.id)).toContain(adjId);
      // Sổ điểm đánh dấu ô đang có đề nghị chờ.
      const g = (await teacher.get(`/scores/gradebook?${gradebookQs()}`).expect(200)).body as GradebookDto;
      expect(g.rows.find((r) => r.studentId === studentsP[0]!.id)!.cells[0]!.pendingAdjustmentId).toBe(adjId);
    });

    it('chỉ BGH duyệt; duyệt thì điểm đổi, lịch sử ghi người đề nghị + người duyệt + lý do; duyệt lần hai bị 409', async () => {
      await teacher.post(`/scores/adjustments/${adjId}/approve`).send({}).expect(403);
      const done = (await principal.post(`/scores/adjustments/${adjId}/approve`).send({ note: 'Đồng ý' }).expect(200)).body as ScoreAdjustmentDto;
      expect(done).toMatchObject({ status: 'APPROVED', reviewNote: 'Đồng ý' });
      expect(Number((await scoreOf(tx1, studentsP[0]!.id))!.value)).toBe(9.5);
      const last = await prisma.scoreHistory.findFirstOrThrow({
        where: { assessmentId: BigInt(tx1.id), studentId: BigInt(studentsP[0]!.id) },
        orderBy: { id: 'desc' },
      });
      expect(last).toMatchObject({ source: 'ADJUST', action: 'UPDATE', changedBy: BigInt(t1.id), approvedBy: BigInt(principalId), reason: 'Chấm sót câu 3, đã có biên bản' });
      expect(Number(last.oldValue)).toBe(8);
      expect(Number(last.newValue)).toBe(9.5);
      await principal.post(`/scores/adjustments/${adjId}/approve`).send({}).expect(409);
      // Học sinh thấy điểm mới (đợt đã công bố).
      const report = (await student1.get('/scores/me').expect(200)).body as StudentReportDto;
      const entry = report.semesters.flatMap((s) => s.subjects).find((s) => s.subjectId === subjectA)!.entries.find((e) => e.code === tx1.code);
      expect(entry!.value).toBe('9.5');
    });

    it('từ chối bắt buộc lý do, điểm giữ nguyên; giáo viên tự huỷ đề nghị của mình', async () => {
      const s2 = studentsP[1]!.id;
      const a = (await adjust(teacher, tx1, s2, '5').expect(201)).body as ScoreAdjustmentDto;
      await principal.post(`/scores/adjustments/${a.id}/reject`).send({}).expect(400);
      expect((await principal.post(`/scores/adjustments/${a.id}/reject`).send({ note: 'Không có biên bản' }).expect(200)).body.status).toBe('REJECTED');
      expect(Number((await scoreOf(tx1, s2))!.value)).toBe(4);

      const b = (await adjust(teacher, tx1, s2, '6').expect(201)).body as ScoreAdjustmentDto;
      await homeroom.post(`/scores/adjustments/${b.id}/cancel`).expect(403);
      expect((await teacher.post(`/scores/adjustments/${b.id}/cancel`).expect(200)).body.status).toBe('CANCELLED');
      await principal.post(`/scores/adjustments/${b.id}/approve`).send({}).expect(409);
    });

    it('điểm đã đổi sau khi gửi đề nghị (BGH đặt miễn) thì không áp dụng được', async () => {
      const s3 = studentsP[2]!.id;
      const a = (await adjust(teacher, tx1, s3, '9').expect(201)).body as ScoreAdjustmentDto;
      await principal.put(`${sheetPath(tx1, clsP.id)}/exemptions/${s3}`).send({ exempt: true, note: 'Nghỉ ốm dài ngày' }).expect(200);
      const res = await principal.post(`/scores/adjustments/${a.id}/approve`).send({}).expect(409);
      expect(res.body.message).toContain('đã thay đổi');
      expect((await scoreOf(tx1, s3))!.status).toBe('EXEMPT');
    });

    it('audit điều chỉnh chỉ ghi mã đợt, lớp, mã học sinh; không ghi giá trị điểm', async () => {
      const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: 'score.adjust.' }, targetType: 'score_adjustment', userId: { in: [BigInt(t1.id), BigInt(principalId)] } } });
      expect(logs.length).toBeGreaterThanOrEqual(5);
      for (const log of logs) {
        const params = (log.payload as { params: Record<string, unknown> }).params;
        expect(Object.keys(params).sort()).toEqual(['class', 'code', 'student']);
      }
    });
  });

  describe('công thức điểm trung bình', () => {
    it('ai đăng nhập cũng xem được; chỉ BGH (hoặc ADMIN qua cấu hình) sửa; đổi hệ số thì ĐTB đổi theo', async () => {
      const f = (await student1.get('/scores/formula').expect(200)).body;
      expect(f).toMatchObject({ isDefault: true, weights: { THUONG_XUYEN: 1, GIUA_KY: 2, CUOI_KY: 3 }, decimals: 1 });
      const custom = { ...f, weights: { THUONG_XUYEN: 1, GIUA_KY: 1, CUOI_KY: 1 } };
      delete custom.isDefault;
      delete custom.note;
      await teacher.put('/scores/formula').send(custom).expect(403);
      await principal.put('/scores/formula').send({ ...custom, decimals: 3 }).expect(400);
      expect((await principal.put('/scores/formula').send(custom).expect(200)).body.isDefault).toBe(false);
      const g = (await teacher.get(`/scores/gradebook?${gradebookQs()}`).expect(200)).body as GradebookDto;
      // HS2: (4 + 3 + 4) / 3 = 3,67 → 3,7 (TX2 trống)
      expect(g.rows.find((r) => r.studentId === studentsP[1]!.id)!.average.value).toBe(3.7);
      // HS1: (9,5 + 6 + 7 + 9) / 4 = 7,875 → 7,9
      expect(g.rows.find((r) => r.studentId === studentsP[0]!.id)!.average.value).toBe(7.9);
    });
  });
});
