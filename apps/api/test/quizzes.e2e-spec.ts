// Bước 22 – trắc nghiệm ôn tập: phạm vi soạn của giáo viên (môn/khối/lớp mình dạy), đề không lộ đáp án, chấm ở server
// (câu một/nhiều đáp án), hết giờ tự nộp, số lần làm, đối tượng, thống kê câu sai nhiều nhất, nhập Excel, và bảng scores
// không đổi. Cần PostgreSQL đã migrate + seed và Redis. Dữ liệu test mang hậu tố RUN và được dọn khi xong.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { XLSX_MIME, type QuizAttemptDto, type QuizAvailableDto, type QuizEditDto, type QuizImportPreviewDto, type QuizStatsDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/features/auth/password.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';
import { StorageService } from './../src/infrastructure/storage/storage.service.js';

const PASSWORD = 'Pvh@2026';
const RUN = String(Date.now()).slice(-7);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

type Agent = ReturnType<typeof request.agent>;

describe('Trắc nghiệm ôn tập (bước 22, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;
  let editor: Agent;
  let librarian: Agent;
  let principal: Agent;
  let t1: Agent; // dạy môn S ở lớp C10
  let t2: Agent; // không dạy môn S
  let hs10: Agent;
  let hs11: Agent;
  let yearId: bigint;
  const subjects: bigint[] = [];
  const classes: bigint[] = [];
  const userIds: bigint[] = [];
  let scoresBefore: { scores: number; history: number };

  const loginAs = async (identifier: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password: PASSWORD }).expect(200);
    return agent;
  };
  async function makeUser(role: 'TEACHER' | 'STUDENT', key: string, classId?: bigint) {
    const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
    const email = `e22.${key}${RUN}@pvh.edu.vn`;
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
    return { id: user.id, email };
  }
  const S = () => subjects[0].toString();
  const base = (title: string, over: Record<string, unknown> = {}) => ({
    title: `${title} ${RUN}`,
    subjectId: S(),
    gradeLevel: 10,
    audience: 'GRADE',
    gradeLevels: [10],
    ...over,
  });
  const QUESTIONS = [
    { content: '<p>Câu một đáp án <script>alert(1)</script></p>', explanation: 'Vì A', options: [{ content: 'A1', correct: true }, { content: 'B1', correct: false }] },
    {
      content: '<p>Câu nhiều đáp án</p>',
      explanation: 'A và C',
      options: [{ content: 'A2', correct: true }, { content: 'B2', correct: false }, { content: 'C2', correct: true }],
    },
    { content: '<p>Câu ba</p>', explanation: null, options: [{ content: 'A3', correct: false }, { content: 'B3', correct: true }] },
  ];
  // Tạo quiz đã có câu hỏi và công bố.
  async function published(owner: Agent, title: string, over: Record<string, unknown> = {}) {
    const quiz = (await owner.post('/quizzes').send(base(title, over)).expect(201)).body as QuizEditDto;
    const withQ = (await owner.put(`/quizzes/${quiz.id}/questions`).send({ questions: QUESTIONS }).expect(200)).body as QuizEditDto;
    await owner.post(`/quizzes/${quiz.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
    return withQ;
  }
  // id đáp án theo nội dung, trong đề đang làm.
  const opt = (a: QuizAttemptDto, text: string) => a.questions!.flatMap((q) => q.options).find((o) => o.content === text)!.id;
  const qOf = (a: QuizAttemptDto, text: string) => a.questions!.find((q) => q.options.some((o) => o.content === text))!.id;
  const countScores = async () => ({ scores: await prisma.score.count(), history: await prisma.scoreHistory.count() });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    yearId = (await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id;
    for (const k of ['S', 'O']) subjects.push((await prisma.subject.create({ data: { code: `Q${k}${RUN}`, name: `Môn ${k} ${RUN}` } })).id);
    for (const level of [10, 11]) {
      const grade = await prisma.grade.findUniqueOrThrow({ where: { level } });
      classes.push((await prisma.schoolClass.create({ data: { name: `Q${level}${RUN}`, gradeId: grade.id, schoolYearId: yearId } })).id);
    }
    const u1 = await makeUser('TEACHER', 't1');
    const u2 = await makeUser('TEACHER', 't2');
    const s10 = await makeUser('STUDENT', 'hs10', classes[0]);
    const s11 = await makeUser('STUDENT', 'hs11', classes[1]);
    await prisma.teachingAssignment.createMany({
      data: [
        { schoolYearId: yearId, classId: classes[0], subjectId: subjects[0], teacherId: u1.id, periodsPerWeek: 2 },
        { schoolYearId: yearId, classId: classes[1], subjectId: subjects[1], teacherId: u2.id, periodsPerWeek: 2 },
      ],
    });
    admin = await loginAs('admin@pvh.edu.vn');
    editor = await loginAs('bientap@pvh.edu.vn');
    librarian = await loginAs('thuthu@pvh.edu.vn');
    principal = await loginAs('bgh@pvh.edu.vn');
    t1 = await loginAs(u1.email);
    t2 = await loginAs(u2.email);
    hs10 = await loginAs(s10.email);
    hs11 = await loginAs(s11.email);
    scoresBefore = await countScores();
  });

  afterAll(async () => {
    const quizzes = await prisma.quiz.findMany({ where: { title: { endsWith: RUN } }, select: { id: true } });
    const media = await prisma.media.findMany({ where: { uploadedBy: { in: userIds } } });
    const librarianId = (await prisma.user.findUniqueOrThrow({ where: { email: 'thuthu@pvh.edu.vn' } })).id;
    const libMedia = await prisma.media.findMany({ where: { uploadedBy: librarianId, createdAt: { gte: new Date(Date.now() - 30 * 60_000) }, mimeType: 'image/png', size: PNG.length } });
    for (const m of [...media, ...libMedia]) await app.get(StorageService).delete(m.storageKey).catch(() => undefined);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { targetType: 'quiz', targetId: { in: quizzes.map((q) => q.id) } },
          { targetType: 'media', targetId: { in: [...media, ...libMedia].map((m) => m.id) } },
        ],
      },
    });
    await prisma.quiz.deleteMany({ where: { id: { in: quizzes.map((q) => q.id) } } });
    await prisma.media.deleteMany({ where: { id: { in: [...media, ...libMedia].map((m) => m.id) } } });
    await prisma.teachingAssignment.deleteMany({ where: { subjectId: { in: subjects } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.schoolClass.deleteMany({ where: { id: { in: classes } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjects } } });
    await app.close();
  });

  describe('quyền và phạm vi soạn', () => {
    it('học sinh, ADMIN, biên tập không soạn được; thủ thư/BGH quản lý', async () => {
      for (const agent of [hs10, admin, editor]) {
        await agent.post('/quizzes').send(base('Không được')).expect(403);
        await agent.get('/quizzes/form-options').expect(403);
      }
      await t1.get('/quizzes/manage?scope=all').expect(403);
      await librarian.get('/quizzes/manage?scope=all').expect(200);
      await principal.get('/quizzes/manage?scope=all').expect(200);
    });

    it('giáo viên chỉ soạn môn mình dạy, chỉ giao cho khối/lớp mình dạy; không sửa quiz của người khác', async () => {
      const opts = (await t1.get('/quizzes/form-options').expect(200)).body;
      expect(opts.canManage).toBe(false);
      expect(opts.subjects).toEqual([expect.objectContaining({ id: S(), grades: [10], classes: [expect.objectContaining({ id: classes[0].toString() })] })]);

      await t1.post('/quizzes').send(base('Môn khác', { subjectId: subjects[1].toString() })).expect(403);
      await t1.post('/quizzes').send(base('Toàn trường', { audience: 'ALL', gradeLevels: [] })).expect(403);
      await t1.post('/quizzes').send(base('Khối 11', { gradeLevel: 11, gradeLevels: [11] })).expect(403);
      await t1.post('/quizzes').send(base('Lớp khác', { audience: 'CLASS', gradeLevels: [], classIds: [classes[1].toString()] })).expect(403);
      await t1.post('/quizzes').send(base('Chỉ GV', { audience: 'TEACHERS_ONLY' })).expect(400);
      const mine = (await t1.post('/quizzes').send(base('Của T1')).expect(201)).body as QuizEditDto;
      await t1.post('/quizzes').send(base('Lớp mình', { audience: 'CLASS', gradeLevels: [], classIds: [classes[0].toString()] })).expect(201);

      // T2 không dạy môn S: không sửa, không xem đáp án, không xem thống kê quiz của T1.
      await t2.patch(`/quizzes/${mine.id}`).send(base('Sửa trộm')).expect(403);
      await t2.get(`/quizzes/${mine.id}`).expect(403);
      await t2.get(`/quizzes/${mine.id}/stats`).expect(403);
      // Người quản lý giao được toàn trường và sửa được quiz của giáo viên.
      await librarian.post('/quizzes').send(base('Toàn trường TT', { audience: 'ALL', gradeLevels: [] })).expect(201);
      await librarian.patch(`/quizzes/${mine.id}`).send(base('Của T1', { description: 'Thủ thư sửa' })).expect(200);

      const created = await prisma.auditLog.count({ where: { action: 'quiz.create', targetType: 'quiz', userId: userIds[0] } });
      expect(created).toBe(2);
    });

    it('câu hỏi: mỗi câu phải có đáp án đúng; nội dung được làm sạch; chưa có câu thì không công bố', async () => {
      const quiz = (await t1.post('/quizzes').send(base('Kiểm tra câu')).expect(201)).body as QuizEditDto;
      await t1.post(`/quizzes/${quiz.id}/status`).send({ status: 'PUBLISHED' }).expect(400);
      await t1
        .put(`/quizzes/${quiz.id}/questions`)
        .send({ questions: [{ content: 'X', options: [{ content: 'a', correct: false }, { content: 'b', correct: false }] }] })
        .expect(400);
      await t1.put(`/quizzes/${quiz.id}/questions`).send({ questions: [{ content: 'X', options: [{ content: 'a', correct: true }] }] }).expect(400);
      const saved = (await t1.put(`/quizzes/${quiz.id}/questions`).send({ questions: QUESTIONS }).expect(200)).body as QuizEditDto;
      expect(saved.questions).toHaveLength(3);
      expect(saved.questions[0].content).not.toContain('<script');
      expect(saved.questions[1].options.filter((o) => o.correct)).toHaveLength(2);
    });
  });

  describe('làm bài và chấm', () => {
    let quiz: QuizEditDto;

    beforeAll(async () => {
      quiz = await published(t1, 'Ôn tập chương 1', { maxAttempts: 2 });
    });

    it('đề gửi xuống không có đáp án đúng hay giải thích; học sinh ngoài đối tượng và giáo viên không làm được', async () => {
      await hs11.post(`/quizzes/${quiz.id}/attempts`).expect(403);
      await t1.post(`/quizzes/${quiz.id}/attempts`).expect(403);
      const list11 = (await hs11.get('/quizzes/available').expect(200)).body as QuizAvailableDto[];
      expect(list11.map((q) => q.id)).not.toContain(quiz.id);
      const list10 = (await hs10.get('/quizzes/available').expect(200)).body as QuizAvailableDto[];
      expect(list10.find((q) => q.id === quiz.id)).toMatchObject({ attemptsLeft: 2, inProgressId: null });

      const res = await hs10.post(`/quizzes/${quiz.id}/attempts`).expect(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/"correct"|isCorrect|explanation|Vì A/);
      const attempt = res.body as QuizAttemptDto;
      expect(attempt.questions).toHaveLength(3);
      expect(attempt.questions!.find((q) => q.options.some((o) => o.content === 'A2'))!.multiple).toBe(true);
      // Bấm bắt đầu lần nữa: mở lại đúng lần đang làm, không tạo lần mới.
      expect(((await hs10.post(`/quizzes/${quiz.id}/attempts`).expect(200)).body as QuizAttemptDto).id).toBe(attempt.id);
      // Học sinh khác không xem được lần làm này.
      await hs11.get(`/quizzes/attempts/${attempt.id}`).expect(404);
    });

    it('chấm ở server: câu một đáp án, câu nhiều đáp án phải đúng hết; đáp án không thuộc câu bị chặn', async () => {
      const list = (await hs10.get('/quizzes/available').expect(200)).body as QuizAvailableDto[];
      const attempt = (await hs10.get(`/quizzes/attempts/${list.find((q) => q.id === quiz.id)!.inProgressId}`).expect(200)).body as QuizAttemptDto;
      // Lưu dần: câu 1 đúng; câu 2 chỉ chọn A (thiếu C → sai).
      await hs10.put(`/quizzes/attempts/${attempt.id}/answers`).send({ questionId: qOf(attempt, 'A1'), optionIds: [opt(attempt, 'A1')] }).expect(204);
      await hs10.put(`/quizzes/attempts/${attempt.id}/answers`).send({ questionId: qOf(attempt, 'A2'), optionIds: [opt(attempt, 'A2')] }).expect(204);
      await hs10.put(`/quizzes/attempts/${attempt.id}/answers`).send({ questionId: qOf(attempt, 'A2'), optionIds: [opt(attempt, 'A1')] }).expect(409);
      const reopened = (await hs10.get(`/quizzes/attempts/${attempt.id}`).expect(200)).body as QuizAttemptDto;
      expect(reopened.questions!.find((q) => q.id === qOf(attempt, 'A1'))!.selected).toEqual([opt(attempt, 'A1')]);

      const result = (
        await hs10
          .post(`/quizzes/attempts/${attempt.id}/submit`)
          .send({ answers: [{ questionId: qOf(attempt, 'B3'), optionIds: [opt(attempt, 'B3')] }] })
          .expect(200)
      ).body as QuizAttemptDto;
      expect(result).toMatchObject({ correctCount: 2, totalCount: 3, score: 6.67, showAnswers: true, autoSubmitted: false });
      const q2 = result.results!.find((q) => q.options.some((o) => o.content === 'A2'))!;
      expect(q2).toMatchObject({ isCorrect: false, explanation: 'A và C' });
      expect(q2.options.filter((o) => o.correct).map((o) => o.content).sort()).toEqual(['A2', 'C2']);
      // Đã nộp thì không sửa được nữa.
      await hs10.put(`/quizzes/attempts/${attempt.id}/answers`).send({ questionId: qOf(attempt, 'A1'), optionIds: [] }).expect(409);

      // Lần 2: chọn đủ A và C → câu nhiều đáp án đúng.
      const second = (await hs10.post(`/quizzes/${quiz.id}/attempts`).expect(200)).body as QuizAttemptDto;
      expect(second.id).not.toBe(attempt.id);
      const done = (
        await hs10
          .post(`/quizzes/attempts/${second.id}/submit`)
          .send({
            answers: [
              { questionId: qOf(second, 'A1'), optionIds: [opt(second, 'A1')] },
              { questionId: qOf(second, 'A2'), optionIds: [opt(second, 'C2'), opt(second, 'A2')] },
              { questionId: qOf(second, 'A3'), optionIds: [opt(second, 'A3')] },
            ],
          })
          .expect(200)
      ).body as QuizAttemptDto;
      expect(done).toMatchObject({ correctCount: 2, score: 6.67 });
      expect(done.results!.find((q) => q.options.some((o) => o.content === 'A2'))!.isCorrect).toBe(true);
    });

    it('quá số lần làm bị chặn; câu hỏi bị khoá khi đã có lượt làm', async () => {
      await hs10.post(`/quizzes/${quiz.id}/attempts`).expect(409);
      const list = (await hs10.get('/quizzes/available').expect(200)).body as QuizAvailableDto[];
      expect(list.find((q) => q.id === quiz.id)).toMatchObject({ attemptsLeft: 0 });
      expect(list.find((q) => q.id === quiz.id)!.attempts).toHaveLength(2);
      await t1.put(`/quizzes/${quiz.id}/questions`).send({ questions: QUESTIONS }).expect(409);
      await t1.delete(`/quizzes/${quiz.id}`).expect(409);
      await t1.post(`/quizzes/${quiz.id}/status`).send({ status: 'DRAFT' }).expect(409);
    });

    it('thống kê: số lượt, điểm trung bình, câu sai nhiều nhất lên đầu', async () => {
      const stats = (await t1.get(`/quizzes/${quiz.id}/stats`).expect(200)).body as QuizStatsDto;
      expect(stats).toMatchObject({ attempts: 2, students: 1, average: 6.67 });
      expect(stats.distribution).toEqual([0, 0, 0, 2, 0]);
      // Câu 2 sai 1 lần, câu 3 sai 1 lần, câu 1 không sai lần nào → câu 1 xếp cuối.
      expect(stats.questions.at(-1)).toMatchObject({ position: 1, wrong: 0 });
      expect(stats.questions[0].wrong).toBe(1);
      expect(stats.questions[0].wrongRate).toBe(50);
    });

    it('ẩn thì học sinh không thấy và không làm được nữa', async () => {
      const other = await published(t1, 'Sẽ ẩn');
      await t1.post(`/quizzes/${other.id}/status`).send({ status: 'ARCHIVED' }).expect(200);
      expect(((await hs10.get('/quizzes/available').expect(200)).body as QuizAvailableDto[]).map((q) => q.id)).not.toContain(other.id);
      await hs10.post(`/quizzes/${other.id}/attempts`).expect(404);
    });
  });

  describe('hết giờ', () => {
    it('quá hạn: không nhận câu trả lời mới, bài tự nộp với các câu đã lưu', async () => {
      const quiz = await published(t1, 'Có giờ', { durationMinutes: 1, showAnswers: false });
      const attempt = (await hs10.post(`/quizzes/${quiz.id}/attempts`).expect(200)).body as QuizAttemptDto;
      expect(new Date(attempt.deadline!).getTime() - new Date(attempt.startedAt).getTime()).toBe(60_000);
      await hs10.put(`/quizzes/attempts/${attempt.id}/answers`).send({ questionId: qOf(attempt, 'A1'), optionIds: [opt(attempt, 'A1')] }).expect(204);
      // Giả lập đã quá giờ (vượt cả thời gian bù mạng).
      await prisma.quizAttempt.update({ where: { id: BigInt(attempt.id) }, data: { deadline: new Date(Date.now() - 60_000) } });

      await hs10.put(`/quizzes/attempts/${attempt.id}/answers`).send({ questionId: qOf(attempt, 'B3'), optionIds: [opt(attempt, 'B3')] }).expect(409);
      const late = await hs10
        .post(`/quizzes/attempts/${attempt.id}/submit`)
        .send({ answers: [{ questionId: qOf(attempt, 'B3'), optionIds: [opt(attempt, 'B3')] }] });
      expect(late.status).toBe(200); // đã tự nộp ở lần lưu trước: trả kết quả, không nhận câu gửi kèm
      const result = (await hs10.get(`/quizzes/attempts/${attempt.id}`).expect(200)).body as QuizAttemptDto;
      expect(result).toMatchObject({ autoSubmitted: true, correctCount: 1, score: 3.33, showAnswers: false });
      expect(JSON.stringify(result.results)).not.toMatch(/"correct"|explanation/);

      // Lần làm bỏ dở quá hạn được tự nộp khi xem danh sách; nộp sau hạn thì 409.
      const third = (await hs10.post(`/quizzes/${quiz.id}/attempts`).expect(200)).body as QuizAttemptDto;
      await prisma.quizAttempt.update({ where: { id: BigInt(third.id) }, data: { deadline: new Date(Date.now() - 60_000) } });
      const list = (await hs10.get('/quizzes/available').expect(200)).body as QuizAvailableDto[];
      expect(list.find((q) => q.id === quiz.id)!.inProgressId).toBeNull();
      expect((await prisma.quizAttempt.findUniqueOrThrow({ where: { id: BigInt(third.id) } })).autoSubmitted).toBe(true);

      const fourth = (await hs10.post(`/quizzes/${quiz.id}/attempts`).expect(200)).body as QuizAttemptDto;
      await prisma.quizAttempt.update({ where: { id: BigInt(fourth.id) }, data: { deadline: new Date(Date.now() - 60_000) } });
      expect((await hs10.post(`/quizzes/attempts/${fourth.id}/submit`).send({ answers: [] })).status).toBe(409);
    });
  });

  describe('nhập Excel, ảnh câu hỏi', () => {
    it('xem trước báo đúng dòng lỗi, xác nhận thêm câu hợp lệ vào cuối, dùng một lần', async () => {
      const tpl = await t1.get('/quizzes/import-template').buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(tpl.status).toBe(200);
      expect(tpl.headers['content-type']).toContain('spreadsheetml');
      await hs10.get('/quizzes/import-template').expect(403);

      const quiz = (await t1.post('/quizzes').send(base('Nhập Excel')).expect(201)).body as QuizEditDto;
      await t1.put(`/quizzes/${quiz.id}/questions`).send({ questions: QUESTIONS.slice(0, 1) }).expect(200);
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Câu hỏi');
      sheet.addRow(['Câu hỏi', 'A', 'B', 'C', 'D', 'Đáp án đúng', 'Giải thích']);
      sheet.addRow(['1 + 1 = ?', '1', '2', '3', '', 'B', 'Cộng']);
      sheet.addRow(['Số chẵn?', '2', '3', '4', '', 'A, C', '']);
      sheet.addRow(['Thiếu đáp án đúng', '1', '2', '', '', '', '']);
      sheet.addRow(['Đáp án ngoài khoảng', '1', '2', '', '', 'D', '']);
      const file = Buffer.from(await wb.xlsx.writeBuffer());

      await t2.post(`/quizzes/${quiz.id}/import/preview`).set('Content-Type', XLSX_MIME).send(file).expect(403);
      const preview = (await t1.post(`/quizzes/${quiz.id}/import/preview`).set('Content-Type', XLSX_MIME).send(file).expect(200))
        .body as QuizImportPreviewDto;
      expect(preview).toMatchObject({ okCount: 2, errorCount: 2 });
      expect(preview.rows.filter((r) => r.status === 'ERROR').map((r) => r.row)).toEqual([4, 5]);
      await t2.post(`/quizzes/import/${preview.previewId}/confirm`).expect(404); // người khác đoán id
      const after = (await t1.post(`/quizzes/import/${preview.previewId}/confirm`).expect(200)).body as QuizEditDto;
      expect(after.questions.map((q) => q.content)).toEqual([expect.any(String), '<p>1 + 1 = ?</p>', '<p>Số chẵn?</p>']);
      expect(after.questions[2].options.filter((o) => o.correct).map((o) => o.content)).toEqual(['2', '4']);
      await t1.post(`/quizzes/import/${preview.previewId}/confirm`).expect(404);
      expect(await prisma.auditLog.count({ where: { action: 'quiz.import', targetId: BigInt(quiz.id) } })).toBe(1);
    });

    it('thủ thư (không có quyền bài viết) tải được ảnh cho câu hỏi; học sinh thì không', async () => {
      await hs10.post('/quizzes/images').send({ mimeType: 'image/png', size: PNG.length }).expect(403);
      const p = (await librarian.post('/quizzes/images').send({ mimeType: 'image/png', size: PNG.length }).expect(200)).body;
      await request(app.getHttpServer()).put(p.uploadUrl).set(p.headers).send(PNG).expect(204);
      const media = (await librarian.post(`/quizzes/images/${p.id}/complete`).expect(200)).body;
      expect(media).toMatchObject({ kind: 'IMAGE' });
      const storage = app.get(StorageService);
      const quiz = (await librarian.post('/quizzes').send(base('Có ảnh', { audience: 'ALL', gradeLevels: [] })).expect(201)).body as QuizEditDto;
      const html = `<p>Nhìn hình</p><img src="${storage.contentUrl(storage.keyFromUrl(media.url)!)}"><img src="https://evil.example/x.png">`;
      const saved = (
        await librarian
          .put(`/quizzes/${quiz.id}/questions`)
          .send({ questions: [{ content: html, options: [{ content: 'a', correct: true }, { content: 'b', correct: false }] }] })
          .expect(200)
      ).body as QuizEditDto;
      expect(saved.questions[0].content).toContain(storage.keyFromUrl(media.url)!);
      expect(saved.questions[0].content).not.toContain('evil.example');
    });
  });

  it('làm quiz không đụng tới bảng điểm chính thức; không ghi nhật ký cho từng lần làm bài', async () => {
    expect(await countScores()).toEqual(scoresBefore);
    const studentIds = userIds.slice(2);
    expect(await prisma.auditLog.count({ where: { userId: { in: studentIds }, action: { startsWith: 'quiz' } } })).toBe(0);
  });
});
