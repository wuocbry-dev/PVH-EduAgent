// Bước 18 – đợt thi có mã và giáo viên nhập điểm: phạm vi phân công, chặn điểm sai (cả ở CSDL), lịch sử điểm,
// nhập Excel (xem trước → xác nhận), đợt chung của BGH, miễn, hạn nhập, công bố, audit không chứa giá trị điểm.
// Cần PostgreSQL đã migrate + seed và Redis. Dữ liệu do test tạo mang hậu tố RUN và được dọn khi xong.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AssessmentDto, ScoreImportPreviewDto, ScoreProgressDto, ScoreSheetDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/features/auth/password.js';
import { SCORE_WRITES_PER_MIN } from './../src/features/scores/scores.service.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { RateLimitService } from './../src/infrastructure/rate-limit/rate-limit.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const STUDENT = 'HSMAU01';

const RUN = String(Date.now()).slice(-7);
const tag = (s: string) => `${s}${RUN}`;

type Agent = ReturnType<typeof request.agent>;
type Person = { id: string; email: string; code: string };

describe('Đợt thi và nhập điểm (bước 18, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;
  let principal: Agent;
  let teacher1: Agent;
  let teacher2: Agent;
  let yearId: bigint;
  let sem1: { id: string; start: string };
  let sem2: { id: string; start: string };
  let subjectA: string;
  let subjectB: string;
  let clsP: { id: string; name: string };
  let clsQ: { id: string; name: string };
  let t1: Person; // dạy môn A lớp P cả năm
  let t2: Person; // dạy môn A lớp Q, chỉ học kỳ I
  const studentsP: Person[] = [];
  const studentsQ: Person[] = [];
  const userIds: bigint[] = [];
  const assessmentIds: string[] = [];

  async function loginAs(identifier: string): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password: PASSWORD }).expect(200);
    return agent;
  }

  async function makeUser(role: 'TEACHER' | 'STUDENT', code: string, classId?: string): Promise<Person> {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const email = `e18.${code.toLowerCase()}@pvh.edu.vn`;
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

  const sheetPath = (assessmentId: string, classId: string) => `/scores/assessments/${assessmentId}/classes/${classId}`;
  const save = (agent: Agent, assessmentId: string, classId: string, entries: unknown[]) =>
    agent.put(sheetPath(assessmentId, classId)).send({ entries });
  const createTx = (agent: Agent, classId: string, subjectId = subjectA, semesterId = sem1.id) =>
    agent.post('/scores/assessments').send({ type: 'THUONG_XUYEN', semesterId, subjectId, classId, testDate: sem1.start });
  const track = (a: AssessmentDto) => {
    assessmentIds.push(a.id);
    return a;
  };
  const historyOf = (assessmentId: string, studentId: string) =>
    prisma.scoreHistory.findMany({ where: { assessmentId: BigInt(assessmentId), studentId: BigInt(studentId) }, orderBy: { id: 'asc' } });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await loginAs(ADMIN);
    principal = await loginAs(PRINCIPAL);

    const year = await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true }, include: { semesters: { orderBy: { number: 'asc' } } } });
    yearId = year.id;
    const [s1, s2] = year.semesters;
    sem1 = { id: s1!.id.toString(), start: s1!.startDate.toISOString().slice(0, 10) };
    sem2 = { id: s2!.id.toString(), start: s2!.startDate.toISOString().slice(0, 10) };

    subjectA = (await admin.post('/academic/subjects').send({ code: tag('DA'), name: `Môn điểm ${RUN}` }).expect(201)).body.id;
    subjectB = (await admin.post('/academic/subjects').send({ code: tag('DB'), name: `Môn khác ${RUN}` }).expect(201)).body.id;
    clsP = (await admin.post('/academic/classes').send({ name: tag('P'), gradeLevel: 12 }).expect(201)).body;
    clsQ = (await admin.post('/academic/classes').send({ name: tag('Q'), gradeLevel: 12 }).expect(201)).body;

    t1 = await makeUser('TEACHER', tag('E18A'));
    t2 = await makeUser('TEACHER', tag('E18B'));
    for (let i = 1; i <= 3; i++) studentsP.push(await makeUser('STUDENT', tag(`P${i}H`), clsP.id));
    for (let i = 1; i <= 2; i++) studentsQ.push(await makeUser('STUDENT', tag(`Q${i}H`), clsQ.id));

    await prisma.teachingAssignment.createMany({
      data: [
        { schoolYearId: yearId, classId: BigInt(clsP.id), subjectId: BigInt(subjectA), teacherId: BigInt(t1.id), periodsPerWeek: 2 },
        {
          schoolYearId: yearId,
          semesterId: BigInt(sem1.id),
          classId: BigInt(clsQ.id),
          subjectId: BigInt(subjectA),
          teacherId: BigInt(t2.id),
          periodsPerWeek: 2,
        },
      ],
    });
    teacher1 = await loginAs(t1.email);
    teacher2 = await loginAs(t2.email);
    const limits = app.get(RateLimitService);
    for (const u of [t1, t2]) await limits.reset('score-write', u.id);
  });

  afterAll(async () => {
    const classes = [BigInt(clsP.id), BigInt(clsQ.id)];
    const assessments = await prisma.assessment.findMany({
      where: { OR: [{ subjectId: { in: [BigInt(subjectA), BigInt(subjectB)] } }, { classes: { some: { classId: { in: classes } } } }] },
      select: { id: true },
    });
    const aIds = assessments.map((a) => a.id);
    // Lịch sử điểm chỉ xoá được khi bật rõ ràng trong transaction (dọn dữ liệu kiểm thử).
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
          { targetType: 'assessment', targetId: { in: aIds.map(String) } },
          { targetType: 'user', targetId: { in: userIds.map(String) } },
        ],
      },
    });
    await prisma.teachingAssignment.deleteMany({ where: { classId: { in: classes } } });
    await prisma.classEnrollment.deleteMany({ where: { classId: { in: classes } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classes } } });
    await prisma.subject.deleteMany({ where: { id: { in: [BigInt(subjectA), BigInt(subjectB)] } } });
    await app.close();
  });

  describe('quyền', () => {
    it('ADMIN, biên tập viên, học sinh bị 403 mọi API điểm; ADMIN không có quyền điểm nào', async () => {
      const me = (await admin.get('/auth/me').expect(200)).body as { permissions: string[] };
      expect(me.permissions.filter((p) => p.startsWith('score:') || p.startsWith('assessment:'))).toEqual([]);
      for (const who of [admin, await loginAs(EDITOR), await loginAs(STUDENT)]) {
        await who.get('/scores/context').expect(403);
        await who.get('/scores/assessments').expect(403);
        await who.get('/scores/progress').expect(403);
        await who.get(sheetPath('1', clsP.id)).expect(403);
        await save(who, '1', clsP.id, [{ studentId: studentsP[0]!.id, value: 5 }]).expect(403);
        await who.post('/scores/assessments').send({ type: 'THUONG_XUYEN', semesterId: sem1.id, subjectId: subjectA, classId: clsP.id, testDate: sem1.start }).expect(403);
      }
      await request(app.getHttpServer()).get('/scores/context').expect(401);
    });

    it('ngữ cảnh của giáo viên chỉ gồm lớp–môn mình được phân công', async () => {
      const ctx = (await teacher1.get('/scores/context').expect(200)).body;
      expect(ctx.pairs).toEqual([expect.objectContaining({ classId: clsP.id, subjectId: subjectA, semesterId: null })]);
      expect(ctx.canManage).toBe(false);
      expect((await principal.get('/scores/context').expect(200)).body.canManage).toBe(true);
    });
  });

  describe('đợt thường xuyên và nhập điểm trên lưới', () => {
    let tx: AssessmentDto;

    it('giáo viên tạo đợt thường xuyên cho lớp–môn mình dạy; mã tự sinh tăng dần; lớp khác, môn khác, loại khác bị chặn', async () => {
      tx = track((await createTx(teacher1, clsP.id).expect(201)).body);
      expect(tx.code).toMatch(new RegExp(`^KT-\\d{4}-HK1-DA${RUN}-P${RUN}-001$`));
      expect(tx.classes).toEqual([expect.objectContaining({ classId: clsP.id, status: 'DRAFT', students: 3, entered: 0 })]);
      const second = track((await createTx(teacher1, clsP.id).expect(201)).body);
      expect(second.code).toBe(tx.code.replace(/001$/, '002'));

      await createTx(teacher1, clsQ.id).expect(403); // lớp không dạy
      await createTx(teacher1, clsP.id, subjectB).expect(403); // môn không dạy
      await createTx(teacher2, clsQ.id, subjectA, sem2.id).expect(403); // phân công chỉ học kỳ I
      await teacher1
        .post('/scores/assessments')
        .send({ type: 'GIUA_KY', semesterId: sem1.id, subjectId: subjectA, gradeLevel: 12, testDate: sem1.start })
        .expect(403);
      await teacher1
        .post('/scores/assessments')
        .send({ type: 'THUONG_XUYEN', semesterId: sem1.id, subjectId: subjectA, classId: clsP.id, testDate: '2001-01-01' })
        .expect(400); // ngoài học kỳ
    });

    it('nhập điểm dấu phẩy/chấm; giáo viên khác, lớp khác, id đoán bừa đều 403', async () => {
      const [a, b, c] = studentsP;
      const res = (
        await save(teacher1, tx.id, clsP.id, [
          { studentId: a!.id, value: '8,5' },
          { studentId: b!.id, value: 7 },
          { studentId: c!.id, value: '10' },
        ]).expect(200)
      ).body;
      expect(res).toMatchObject({ created: 3, updated: 0, deleted: 0 });
      const sheet = res.sheet as ScoreSheetDto;
      expect(sheet.rows.find((r) => r.studentId === a!.id)).toMatchObject({ value: '8.5', status: 'GRADED' });
      expect(sheet.counts).toMatchObject({ students: 3, graded: 3, missing: 0 });
      expect(sheet.canEdit).toBe(true);

      await teacher2.get(sheetPath(tx.id, clsP.id)).expect(403);
      await save(teacher2, tx.id, clsP.id, [{ studentId: a!.id, value: 1 }]).expect(403);
      await teacher1.get(sheetPath(tx.id, clsQ.id)).expect(403); // lớp không thuộc đợt
      await teacher2.get(sheetPath('999999999', clsQ.id)).expect(403); // không lộ "không tồn tại"
      await principal.get(sheetPath('999999999', clsQ.id)).expect(404);
      // BGH xem được nhưng không nhập điểm.
      expect((await principal.get(sheetPath(tx.id, clsP.id)).expect(200)).body.canEdit).toBe(false);
      await save(principal, tx.id, clsP.id, [{ studentId: a!.id, value: 1 }]).expect(403);
    });

    it('điểm 10.5, -1, chữ, quá 2 chữ số thập phân bị chặn; trùng học sinh, học sinh lớp khác bị chặn', async () => {
      const a = studentsP[0]!.id;
      for (const value of ['10.5', -1, 'abc', '7.125', '1e1']) {
        await save(teacher1, tx.id, clsP.id, [{ studentId: a, value }]).expect(400);
      }
      await save(teacher1, tx.id, clsP.id, [{ studentId: a, value: 5 }, { studentId: a, value: 6 }]).expect(400);
      await save(teacher1, tx.id, clsP.id, [{ studentId: studentsQ[0]!.id, value: 5 }]).expect(400);
      const row = await prisma.score.findUniqueOrThrow({ where: { assessmentId_studentId: { assessmentId: BigInt(tx.id), studentId: BigInt(a) } } });
      expect(Number(row.value)).toBe(8.5);
    });

    it('CSDL chặn điểm ngoài 0–10, chữ, trùng (đợt, học sinh) và điểm của học sinh vắng', async () => {
      const id = (await prisma.score.findFirstOrThrow({ where: { assessmentId: BigInt(tx.id) } })).id;
      await expect(prisma.$executeRawUnsafe(`UPDATE scores SET value = 10.5 WHERE id = ${id}`)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE scores SET value = -1 WHERE id = ${id}`)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE scores SET value = 'abc' WHERE id = ${id}`)).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE scores SET status = 'ABSENT' WHERE id = ${id}`)).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO scores (assessment_id, student_id, class_id, value, entered_by, updated_at)
           SELECT assessment_id, student_id, class_id, 5, entered_by, now() FROM scores WHERE id = ${id}`,
        ),
      ).rejects.toThrow();
    });

    it('mỗi lần tạo/sửa/xoá sinh một dòng score_history; lịch sử không sửa/xoá được', async () => {
      const a = studentsP[0]!.id;
      await save(teacher1, tx.id, clsP.id, [{ studentId: a, value: '9' }]).expect(200);
      const unchanged = (await save(teacher1, tx.id, clsP.id, [{ studentId: a, value: '9,0' }]).expect(200)).body;
      expect(unchanged).toMatchObject({ unchanged: 1, updated: 0 });
      await save(teacher1, tx.id, clsP.id, [{ studentId: a, value: null }]).expect(200);
      const history = await historyOf(tx.id, a);
      expect(history.map((h) => [h.action, h.oldValue?.toString() ?? null, h.newValue?.toString() ?? null, h.changedBy.toString(), h.source])).toEqual([
        ['CREATE', null, '8.5', t1.id, 'GRID'],
        ['UPDATE', '8.5', '9', t1.id, 'GRID'],
        ['DELETE', '9', null, t1.id, 'GRID'],
      ]);
      await expect(prisma.$executeRawUnsafe(`UPDATE score_history SET new_value = 10 WHERE id = ${history[0]!.id}`)).rejects.toThrow(
        /không được sửa hoặc xoá/,
      );
      await expect(prisma.$executeRawUnsafe(`DELETE FROM score_history WHERE id = ${history[0]!.id}`)).rejects.toThrow();
      expect(await historyOf(tx.id, a)).toHaveLength(3);
    });

    it('vắng có lý do: điểm để trống và bắt buộc ghi lý do', async () => {
      const a = studentsP[0]!.id;
      await save(teacher1, tx.id, clsP.id, [{ studentId: a, value: null, status: 'ABSENT' }]).expect(400);
      await save(teacher1, tx.id, clsP.id, [{ studentId: a, value: 5, status: 'ABSENT', note: 'Ốm' }]).expect(400);
      const sheet = (await save(teacher1, tx.id, clsP.id, [{ studentId: a, value: null, status: 'ABSENT', note: 'Ốm, có giấy' }]).expect(200))
        .body.sheet as ScoreSheetDto;
      expect(sheet.rows.find((r) => r.studentId === a)).toMatchObject({ value: null, status: 'ABSENT', note: 'Ốm, có giấy' });
      expect(sheet.counts).toMatchObject({ graded: 2, absent: 1, missing: 0 });
    });

    it('công bố cho lớp: báo số còn trống, vẫn sửa được trong hạn; đợt đã có lịch sử không xoá được', async () => {
      await save(teacher1, tx.id, clsP.id, [{ studentId: studentsP[2]!.id, value: null }]).expect(200);
      const sheet = (await teacher1.post(`${sheetPath(tx.id, clsP.id)}/publish`).expect(200)).body as ScoreSheetDto;
      expect(sheet).toMatchObject({ status: 'PUBLISHED', counts: expect.objectContaining({ missing: 1 }) });
      expect(sheet.publishedAt).not.toBeNull();
      await save(teacher1, tx.id, clsP.id, [{ studentId: studentsP[2]!.id, value: '6,75' }]).expect(200);
      await teacher2.post(`${sheetPath(tx.id, clsP.id)}/publish`).expect(403);

      await teacher1.delete(`/scores/assessments/${tx.id}`).expect(409);
      const empty = track((await createTx(teacher1, clsP.id).expect(201)).body);
      await teacher2.delete(`/scores/assessments/${empty.id}`).expect(403);
      await teacher1.delete(`/scores/assessments/${empty.id}`).expect(204);
    });

    it('giáo viên không tự đặt hạn nhập điểm; quá hạn thì không sửa được', async () => {
      await teacher1.patch(`/scores/assessments/${tx.id}`).send({ entryDeadline: '2099-01-01T00:00:00+07:00' }).expect(403);
      await teacher1.patch(`/scores/assessments/${tx.id}`).send({ description: 'Kiểm tra 15 phút' }).expect(200);
      await principal.patch(`/scores/assessments/${tx.id}`).send({ entryDeadline: '2020-01-01T00:00:00+07:00' }).expect(200);
      await save(teacher1, tx.id, clsP.id, [{ studentId: studentsP[1]!.id, value: 4 }]).expect(409);
      const sheet = (await teacher1.get(sheetPath(tx.id, clsP.id)).expect(200)).body as ScoreSheetDto;
      expect(sheet).toMatchObject({ deadlinePassed: true, canEdit: false });
      await principal.patch(`/scores/assessments/${tx.id}`).send({ entryDeadline: null }).expect(200);
      await save(teacher1, tx.id, clsP.id, [{ studentId: studentsP[1]!.id, value: 4 }]).expect(200);
    });
  });

  describe('nhập điểm từ Excel', () => {
    let tx: AssessmentDto;
    const upload = (agent: Agent, file: Buffer) =>
      agent.post(`${sheetPath(tx.id, clsP.id)}/import/preview`).set('Content-Type', 'application/octet-stream').send(file);

    beforeAll(async () => {
      tx = track((await createTx(teacher1, clsP.id).expect(201)).body);
    });

    it('file mẫu điền sẵn mã + tên học sinh của lớp; xem trước báo đúng lỗi; xác nhận chỉ ghi dòng hợp lệ', async () => {
      const res = await teacher1.get(`${sheetPath(tx.id, clsP.id)}/template`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as ExcelJS.Buffer);
      const sheet = wb.worksheets[0]!;
      expect(sheet.getRow(1).values).toEqual([undefined, 'STT', 'Mã học sinh', 'Họ và tên', 'Điểm', 'Ghi chú']);
      const codes = [2, 3, 4].map((r) => sheet.getRow(r).getCell(2).text);
      expect(codes.sort()).toEqual(studentsP.map((s) => s.code).sort());
      await teacher2.get(`${sheetPath(tx.id, clsP.id)}/template`).expect(403);

      // Điền điểm: hợp lệ, ngoài khoảng, chữ, mã lớp khác, trùng mã.
      const [a, b, c] = studentsP;
      const rowOf = (code: string) => [2, 3, 4].find((r) => sheet.getRow(r).getCell(2).text === code)!;
      sheet.getRow(rowOf(a!.code)).getCell(4).value = 7.5;
      sheet.getRow(rowOf(b!.code)).getCell(4).value = 11;
      sheet.getRow(rowOf(c!.code)).getCell(4).value = 'tám';
      sheet.addRow([4, studentsQ[0]!.code, 'Lạc lớp', '5', '']);
      sheet.addRow([5, a!.code, 'Trùng', '6', '']);
      const file = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

      await upload(teacher2, file).expect(403);
      const preview = (await upload(teacher1, file).expect(200)).body as ScoreImportPreviewDto;
      expect(preview).toMatchObject({ total: 5, ok: 1, errors: 4 });
      const msg = (code: string, row?: number) => preview.rows.find((r) => r.studentCode === code && (row === undefined || r.row === row))?.message;
      expect(msg(b!.code)).toBe('Điểm tối đa là 10');
      expect(msg(c!.code)).toBe('Điểm phải là số từ 0 đến 10');
      expect(msg(studentsQ[0]!.code)).toBe('Mã học sinh không thuộc lớp này');
      expect(preview.rows.filter((r) => r.studentCode === a!.code).map((r) => r.status)).toEqual(['ok', 'error']);
      // Chưa ghi gì trước khi xác nhận.
      expect(await prisma.score.count({ where: { assessmentId: BigInt(tx.id) } })).toBe(0);

      await principal.post(`/scores/import/${preview.previewId}/confirm`).expect(404); // không phải người tải lên
      const done = (await teacher1.post(`/scores/import/${preview.previewId}/confirm`).expect(200)).body;
      expect(done).toMatchObject({ created: 1, skipped: 4 });
      expect((done.sheet as ScoreSheetDto).rows.find((r) => r.studentId === a!.id)?.value).toBe('7.5');
      expect((await historyOf(tx.id, a!.id)).map((h) => h.source)).toEqual(['EXCEL']);
      await teacher1.post(`/scores/import/${preview.previewId}/confirm`).expect(404); // dùng một lần
    });

    it('file không phải Excel bị từ chối', async () => {
      await upload(teacher1, Buffer.from('không phải xlsx')).expect(400);
    });
  });

  describe('đợt chung của BGH, miễn kiểm tra và tiến độ', () => {
    let gk: AssessmentDto;

    it('BGH tạo đợt giữa kỳ cho khối: mặc định mọi lớp của khối, hoặc các lớp chọn; mã tự đặt trùng bị 409', async () => {
      const body = { type: 'GIUA_KY', semesterId: sem1.id, subjectId: subjectA, gradeLevel: 12, testDate: sem1.start };
      gk = track((await principal.post('/scores/assessments').send(body).expect(201)).body);
      const grade12 = await prisma.schoolClass.findMany({ where: { schoolYearId: yearId, grade: { level: 12 } } });
      expect(gk.classes.map((c) => c.classId).sort()).toEqual(grade12.map((c) => c.id.toString()).sort());
      expect(gk.code).toBe(`GK-${gk.schoolYearName.slice(0, 4)}-HK1-DA${RUN}-K12`);
      expect(gk.gradeLevel).toBe(12);

      const custom = track(
        (await principal.post('/scores/assessments').send({ ...body, type: 'CUOI_KY', classIds: [clsP.id], code: tag('ck-rieng-') }).expect(201)).body,
      );
      expect(custom.code).toBe(tag('CK-RIENG-'));
      expect(custom.classes.map((c) => c.classId)).toEqual([clsP.id]);
      await principal.post('/scores/assessments').send({ ...body, code: tag('CK-RIENG-') }).expect(409);
      await principal.post('/scores/assessments').send({ ...body, classIds: [clsP.id, '1'] }).expect(400); // lớp ngoài khối
    });

    it('giáo viên chỉ thấy và nhập lớp mình trong đợt chung', async () => {
      const mine1 = ((await teacher1.get('/scores/assessments').query({ semesterId: sem1.id }).expect(200)).body as AssessmentDto[]).find((a) => a.id === gk.id)!;
      expect(mine1.classes.map((c) => c.classId)).toEqual([clsP.id]);
      const mine2 = ((await teacher2.get('/scores/assessments').query({ semesterId: sem1.id }).expect(200)).body as AssessmentDto[]).find((a) => a.id === gk.id)!;
      expect(mine2.classes.map((c) => c.classId)).toEqual([clsQ.id]);
      // Đợt thường xuyên của t1 không hiện cho t2.
      expect(((await teacher2.get('/scores/assessments').expect(200)).body as AssessmentDto[]).every((a) => a.type !== 'THUONG_XUYEN')).toBe(true);

      await save(teacher2, gk.id, clsQ.id, [{ studentId: studentsQ[0]!.id, value: '3,33' }]).expect(200);
      await save(teacher1, gk.id, clsQ.id, [{ studentId: studentsQ[0]!.id, value: 9 }]).expect(403);
      await save(teacher1, gk.id, clsP.id, [{ studentId: studentsP[0]!.id, value: '7,77' }]).expect(200);
    });

    it('chỉ BGH đặt miễn; điểm của học sinh được miễn giáo viên không sửa được', async () => {
      const path = `${sheetPath(gk.id, clsP.id)}/exemptions/${studentsP[1]!.id}`;
      await teacher1.put(path).send({ exempt: true, note: 'x' }).expect(403);
      await principal.put(path).send({ exempt: true }).expect(400); // thiếu lý do
      const sheet = (await principal.put(path).send({ exempt: true, note: 'Miễn theo quyết định của BGH' }).expect(200)).body as ScoreSheetDto;
      expect(sheet.rows.find((r) => r.studentId === studentsP[1]!.id)).toMatchObject({ status: 'EXEMPT', value: null });
      await save(teacher1, gk.id, clsP.id, [{ studentId: studentsP[1]!.id, value: 5 }]).expect(409);
      expect((await historyOf(gk.id, studentsP[1]!.id)).map((h) => [h.action, h.newStatus, h.source, h.changedBy.toString()])).toEqual([
        ['CREATE', 'EXEMPT', 'EXEMPT', expect.any(String)],
      ]);
      await principal.put(path).send({ exempt: false }).expect(200);
      await save(teacher1, gk.id, clsP.id, [{ studentId: studentsP[1]!.id, value: 5 }]).expect(200);
    });

    it('BGH xem tiến độ nhập điểm theo lớp; ADMIN và giáo viên bị 403', async () => {
      await teacher2.post(`${sheetPath(gk.id, clsQ.id)}/publish`).expect(200);
      const progress = (await principal.get('/scores/progress').query({ semesterId: sem1.id, gradeLevel: 12 }).expect(200)).body as ScoreProgressDto;
      const row = progress.assessments.find((a) => a.id === gk.id)!;
      expect(row.classes.find((c) => c.classId === clsP.id)).toMatchObject({ students: 3, entered: 2, status: 'DRAFT', teacherName: `GV ${t1.code}` });
      expect(row.classes.find((c) => c.classId === clsQ.id)).toMatchObject({ students: 2, entered: 1, status: 'PUBLISHED', teacherName: `GV ${t2.code}` });
      expect(progress.totals.published).toBeGreaterThanOrEqual(1);
      await admin.get('/scores/progress').expect(403);
      await teacher1.get('/scores/progress').expect(403);
    });
  });

  describe('nhật ký và giới hạn', () => {
    it('audit_logs có assessment.* và score.* nhưng không chứa giá trị điểm', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { OR: [{ action: { startsWith: 'score.' } }, { action: { startsWith: 'assessment.' } }], targetId: { in: [...assessmentIds, ...userIds.map(String)] } },
      });
      const actions = new Set(logs.map((l) => l.action));
      for (const a of ['assessment.create', 'assessment.update', 'assessment.delete', 'assessment.publish', 'score.save', 'score.import_preview', 'score.import', 'score.exempt']) {
        expect(actions, a).toContain(a);
      }
      const text = JSON.stringify(logs.map((l) => l.payload));
      for (const v of ['8.5', '8,5', '7.77', '7,77', '3.33', '3,33', '6.75', '6,75', '7.5']) expect(text).not.toContain(v);
      expect(text).not.toMatch(/"value"/);
    });

    it(`ghi điểm quá ${SCORE_WRITES_PER_MIN} lần/phút bị 429`, async () => {
      const limits = app.get(RateLimitService);
      await limits.reset('score-write', t2.id);
      await limits.increment('score-write', t2.id, 60, SCORE_WRITES_PER_MIN);
      await save(teacher2, assessmentIds.at(-2)!, clsQ.id, [{ studentId: studentsQ[1]!.id, value: 5 }]).expect(429);
      await limits.reset('score-write', t2.id);
    });
  });
});
