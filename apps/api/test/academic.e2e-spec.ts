// Bước 14 – dữ liệu học vụ gốc: năm học, học kỳ, lớp, môn, tổ, phòng, chủ nhiệm, chuyển lớp.
// Cần PostgreSQL đã migrate + seed (dữ liệu mẫu học vụ) và Redis.
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
const TEACHER = 'gv.toan@pvh.edu.vn'; // GVMAU01, chủ nhiệm 10A1 (seed)
const SEED_STUDENT = 'HSMAU01';

// Mọi dữ liệu do test tạo mang hậu tố này để dọn sạch khi xong.
const RUN = String(Date.now()).slice(-7);
const tag = (s: string) => `${s}${RUN}`;

type Agent = ReturnType<typeof request.agent>;

describe('Học vụ gốc (bước 14, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;
  let originalCurrentYearId: bigint;
  const userIds: bigint[] = [];

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
    originalCurrentYearId = (await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id;
  });

  afterAll(async () => {
    // Khôi phục năm học hiện hành rồi xoá mọi thứ do test tạo.
    await prisma.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await prisma.schoolYear.update({ where: { id: originalCurrentYearId }, data: { isCurrent: true } });
    await prisma.classEnrollment.deleteMany({ where: { class: { name: { endsWith: RUN } } } });
    await prisma.schoolClass.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.schoolYear.deleteMany({ where: { name: { in: ['2090-2091', '2092-2093'] } } });
    await prisma.subject.deleteMany({ where: { code: { endsWith: RUN } } });
    await prisma.department.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.room.deleteMany({ where: { name: { endsWith: RUN } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('quyền', () => {
    it('giáo viên, học sinh, biên tập viên không quản lý học vụ (403); BGH và ADMIN được', async () => {
      const teacher = await loginAs(TEACHER);
      const student = await loginAs(SEED_STUDENT);
      const editor = await loginAs('bientap@pvh.edu.vn');
      for (const agent of [teacher, student, editor]) {
        await agent.get('/academic/classes').expect(403);
        await agent.post('/academic/classes').send({ name: tag('X'), gradeLevel: 10 }).expect(403);
        await agent.get('/academic/school-years').expect(403);
        await agent.get('/academic/subjects').expect(403);
      }
      await (await loginAs(PRINCIPAL)).get('/academic/classes').expect(200);
      await admin.get('/academic/classes').expect(200);
    });

    it('chỉ ADMIN có student:import, BGH có academic:manage', async () => {
      const principal = (await (await loginAs(PRINCIPAL)).get('/auth/me').expect(200)).body;
      expect(principal.permissions).toContain('academic:manage');
      expect(principal.permissions).not.toContain('student:import');
      const adminMe = (await admin.get('/auth/me').expect(200)).body;
      expect(adminMe.permissions).toEqual(expect.arrayContaining(['academic:manage', 'student:import']));
    });
  });

  describe('dữ liệu mẫu từ seed', () => {
    it('có năm học hiện hành duy nhất, 2 học kỳ, 3 khối, môn, tổ, phòng bộ môn, lớp mẫu', async () => {
      const years = (await admin.get('/academic/school-years').expect(200)).body as { id: string; isCurrent: boolean }[];
      expect(years.filter((y) => y.isCurrent)).toHaveLength(1);
      const current = years.find((y) => y.isCurrent)!;
      const semesters = (await admin.get('/academic/semesters').query({ schoolYearId: current.id }).expect(200)).body;
      expect(semesters.map((s: { number: number }) => s.number)).toEqual([1, 2]);
      const grades = (await admin.get('/academic/grades').expect(200)).body;
      expect(grades.map((g: { level: number }) => g.level)).toEqual([10, 11, 12]);
      const subjects = (await admin.get('/academic/subjects').expect(200)).body as { code: string; gradingType: string }[];
      expect(subjects.find((s) => s.code === 'TOAN')?.gradingType).toBe('SCORE');
      expect(subjects.find((s) => s.code === 'HDTNHN')?.gradingType).toBe('COMMENT');
      expect((await admin.get('/academic/departments').expect(200)).body.length).toBeGreaterThanOrEqual(5);
      expect((await admin.get('/academic/rooms').expect(200)).body.length).toBeGreaterThanOrEqual(4);
      const classes = (await admin.get('/academic/classes').expect(200)).body as { name: string; homeroomTeacherName: string | null }[];
      expect(classes.find((c) => c.name === '10A1')?.homeroomTeacherName).toBeTruthy();
    });
  });

  describe('năm học và học kỳ', () => {
    it('đặt năm hiện hành thì năm cũ tự bỏ cờ (luôn đúng một năm hiện hành); CSDL chặn có hai năm hiện hành', async () => {
      const created = (
        await admin
          .post('/academic/school-years')
          .send({ name: '2090-2091', startDate: '2090-09-05', endDate: '2091-05-31' })
          .expect(201)
      ).body;
      expect(created.isCurrent).toBe(false);

      await admin.patch(`/academic/school-years/${created.id}`).send({ isCurrent: true }).expect(200);
      const years = (await admin.get('/academic/school-years').expect(200)).body as { id: string; isCurrent: boolean }[];
      expect(years.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([created.id]);

      await expect(
        prisma.schoolYear.update({ where: { id: originalCurrentYearId }, data: { isCurrent: true } }),
      ).rejects.toThrow();

      // Không bỏ cờ năm hiện hành mà không chỉ định năm khác; không xoá năm hiện hành.
      await admin.patch(`/academic/school-years/${created.id}`).send({ isCurrent: false }).expect(400);
      const del = await admin.delete(`/academic/school-years/${created.id}`).expect(409);
      expect(del.body.message).toMatch(/hiện hành/);

      await admin.patch(`/academic/school-years/${originalCurrentYearId}`).send({ isCurrent: true }).expect(200);
      await admin.delete(`/academic/school-years/${created.id}`).expect(204);
    });

    it('kiểm tra dữ liệu: tên sai dạng, ngày ngược, trùng tên; học kỳ chỉ 1 hoặc 2 và không trùng', async () => {
      const bad = await admin.post('/academic/school-years').send({ name: 'abc', startDate: '2090-09-05', endDate: '2091-05-31' }).expect(400);
      expect(bad.body.fieldErrors?.name?.[0]).toMatch(/2026-2027/);
      await admin.post('/academic/school-years').send({ name: '2092-2093', startDate: '2093-01-01', endDate: '2092-01-01' }).expect(400);
      await admin.post('/academic/school-years').send({ name: '2026-2027', startDate: '2026-09-05', endDate: '2027-05-31' }).expect(409);

      const y = (await admin.post('/academic/school-years').send({ name: '2092-2093', startDate: '2092-09-05', endDate: '2093-05-31' }).expect(201)).body;
      await admin.post('/academic/semesters').send({ schoolYearId: y.id, number: 3, startDate: '2092-09-05', endDate: '2092-12-31' }).expect(400);
      const sem = (await admin.post('/academic/semesters').send({ schoolYearId: y.id, number: 1, startDate: '2092-09-05', endDate: '2093-01-15' }).expect(201)).body;
      await admin.post('/academic/semesters').send({ schoolYearId: y.id, number: 1, startDate: '2092-09-05', endDate: '2093-01-15' }).expect(409);
      await admin.patch(`/academic/semesters/${sem.id}`).send({ endDate: '2092-01-01' }).expect(400);
      await admin.patch(`/academic/semesters/${sem.id}`).send({ endDate: '2093-01-20' }).expect(200);
      await admin.delete(`/academic/semesters/${sem.id}`).expect(204);
      await admin.delete(`/academic/school-years/${y.id}`).expect(204);
    });
  });

  describe('tổ chuyên môn, môn học, phòng bộ môn', () => {
    it('thêm/sửa/xoá; trùng tên hoặc mã là 409; không xoá tổ còn môn', async () => {
      const dep = (await admin.post('/academic/departments').send({ name: tag('Tổ thử ') }).expect(201)).body;
      await admin.post('/academic/departments').send({ name: tag('Tổ thử ') }).expect(409);

      const subject = (
        await admin.post('/academic/subjects').send({ code: tag('mon'), name: 'Môn thử', departmentId: dep.id }).expect(201)
      ).body;
      expect(subject.code).toBe(tag('MON')); // mã được viết hoa
      expect(subject.departmentName).toBe(dep.name);
      expect(subject.gradingType).toBe('SCORE');
      await admin.post('/academic/subjects').send({ code: tag('MON'), name: 'Trùng' }).expect(409);
      await admin.post('/academic/subjects').send({ code: tag('khac'), name: 'Môn', departmentId: '999999999' }).expect(400);

      const del = await admin.delete(`/academic/departments/${dep.id}`).expect(409);
      expect(del.body.message).toMatch(/còn 1 môn/);

      const updated = (await admin.patch(`/academic/subjects/${subject.id}`).send({ gradingType: 'COMMENT', name: 'Môn nhận xét' }).expect(200)).body;
      expect(updated).toMatchObject({ gradingType: 'COMMENT', name: 'Môn nhận xét' });
      await admin.delete(`/academic/subjects/${subject.id}`).expect(204);
      await admin.patch(`/academic/departments/${dep.id}`).send({ name: tag('Tổ đổi ') }).expect(200);
      await admin.delete(`/academic/departments/${dep.id}`).expect(204);
      await admin.delete(`/academic/subjects/${subject.id}`).expect(404);
    });

    it('phòng bộ môn: thêm, trùng tên 409, sửa, xoá', async () => {
      const room = (await admin.post('/academic/rooms').send({ name: tag('Phòng thử '), kind: 'Thí nghiệm' }).expect(201)).body;
      expect(room.kind).toBe('Thí nghiệm');
      await admin.post('/academic/rooms').send({ name: tag('Phòng thử ') }).expect(409);
      const patched = (await admin.patch(`/academic/rooms/${room.id}`).send({ kind: '' }).expect(200)).body;
      expect(patched.kind).toBeNull();
      await admin.delete(`/academic/rooms/${room.id}`).expect(204);
    });
  });

  describe('lớp, chủ nhiệm, chuyển lớp', () => {
    async function makeStudent(code: string): Promise<bigint> {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: 'STUDENT' } });
      const user = await prisma.user.create({
        data: {
          fullName: `Học sinh ${code}`,
          passwordHash: '!unusable',
          status: 'PENDING',
          roles: { create: { roleId: role.id } },
          studentProfile: { create: { studentCode: code } },
        },
      });
      userIds.push(user.id);
      return user.id;
    }

    it('tạo lớp (mặc định năm hiện hành), tên lớp duy nhất trong năm, chủ nhiệm phải là giáo viên có hồ sơ', async () => {
      const name = tag('L');
      const cls = (await admin.post('/academic/classes').send({ name, gradeLevel: 10, subjectCombo: 'Khoa học tự nhiên' }).expect(201)).body;
      expect(cls).toMatchObject({ name, gradeLevel: 10, subjectCombo: 'Khoa học tự nhiên', studentCount: 0, homeroomTeacherId: null });
      expect(cls.schoolYearName).toBe('2026-2027');

      const dup = await admin.post('/academic/classes').send({ name, gradeLevel: 11 }).expect(409);
      expect(dup.body.message).toMatch(/đã có trong năm học/);
      await admin.post('/academic/classes').send({ name: tag('K'), gradeLevel: 9 }).expect(400);

      const teachers = (await admin.get('/academic/teachers').expect(200)).body as { userId: string; teacherCode: string }[];
      const gv = teachers.find((t) => t.teacherCode === 'GVMAU01')!;
      const principalId = (await prisma.user.findUniqueOrThrow({ where: { email: PRINCIPAL } })).id.toString();
      await admin.patch(`/academic/classes/${cls.id}`).send({ homeroomTeacherId: principalId }).expect(400); // không có hồ sơ giáo viên
      const set = (await admin.patch(`/academic/classes/${cls.id}`).send({ homeroomTeacherId: gv.userId, name: tag('M') }).expect(200)).body;
      expect(set.homeroomTeacherId).toBe(gv.userId);
      expect(set.name).toBe(tag('M'));
      const cleared = (await admin.patch(`/academic/classes/${cls.id}`).send({ homeroomTeacherId: null }).expect(200)).body;
      expect(cleared.homeroomTeacherName).toBeNull();

      await admin.delete(`/academic/classes/${cls.id}`).expect(204);
    });

    it('chuyển lớp: một học sinh chỉ thuộc một lớp mỗi năm học; không xoá lớp còn học sinh', async () => {
      const a = (await admin.post('/academic/classes').send({ name: tag('A'), gradeLevel: 10 }).expect(201)).body;
      const b = (await admin.post('/academic/classes').send({ name: tag('B'), gradeLevel: 10 }).expect(201)).body;
      const studentId = await makeStudent(tag('TS'));

      await admin.post(`/academic/students/${studentId}/transfer`).send({ classId: a.id }).expect(204);
      let list = (await admin.get(`/academic/classes/${a.id}/students`).expect(200)).body as { studentCode: string; status: string }[];
      expect(list.map((s) => s.studentCode)).toEqual([tag('TS')]);
      expect(list[0]!.status).toBe('PENDING');
      await admin.post(`/academic/students/${studentId}/transfer`).send({ classId: a.id }).expect(400); // đã ở lớp này
      const blocked = await admin.delete(`/academic/classes/${a.id}`).expect(409);
      expect(blocked.body.message).toMatch(/còn 1 học sinh/);

      await admin.post(`/academic/students/${studentId}/transfer`).send({ classId: b.id }).expect(204);
      list = (await admin.get(`/academic/classes/${a.id}/students`).expect(200)).body;
      expect(list).toEqual([]);
      expect((await admin.get(`/academic/classes/${b.id}/students`).expect(200)).body).toHaveLength(1);
      expect(await prisma.classEnrollment.count({ where: { studentId } })).toBe(1);

      // CSDL cũng chặn: không thể có hai bản ghi ghi danh cùng năm học.
      await expect(
        prisma.classEnrollment.create({ data: { studentId, classId: BigInt(a.id), schoolYearId: BigInt(b.schoolYearId) } }),
      ).rejects.toThrow();

      await admin.post('/academic/students/999999999/transfer').send({ classId: a.id }).expect(404);
      await admin.post(`/academic/students/${studentId}/transfer`).send({ classId: '999999999' }).expect(404);
      await admin.post(`/academic/students/${studentId}/transfer`).send({ classId: 'abc' }).expect(400);

      await admin.post(`/academic/students/${studentId}/transfer`).send({ classId: a.id }).expect(204);
      await prisma.classEnrollment.deleteMany({ where: { studentId } });
      await admin.delete(`/academic/classes/${a.id}`).expect(204);
      await admin.delete(`/academic/classes/${b.id}`).expect(204);
    });

    it('giáo viên chủ nhiệm xem được học sinh đúng lớp mình, lớp khác bị 403; BGH xem được', async () => {
      const classes = (await admin.get('/academic/classes').expect(200)).body as { id: string; name: string }[];
      const own = classes.find((c) => c.name === '10A1')!;
      const other = classes.find((c) => c.name === '10A2')!;
      const teacher = await loginAs(TEACHER);
      const students = (await teacher.get(`/academic/classes/${own.id}/students`).expect(200)).body as { studentCode: string }[];
      expect(students.map((s) => s.studentCode)).toEqual(expect.arrayContaining(['HSMAU01', 'HSMAU02']));
      await teacher.get(`/academic/classes/${other.id}/students`).expect(403);
      await (await loginAs(PRINCIPAL)).get(`/academic/classes/${other.id}/students`).expect(200);
    });

    it('ghi nhật ký academic.* cho thao tác thay đổi', async () => {
      const before = await prisma.auditLog.count({ where: { action: 'academic.room.create' } });
      const room = (await admin.post('/academic/rooms').send({ name: tag('Phòng nhật ký ') }).expect(201)).body;
      expect(await prisma.auditLog.count({ where: { action: 'academic.room.create' } })).toBe(before + 1);
      await admin.delete(`/academic/rooms/${room.id}`).expect(204);
      expect(await prisma.auditLog.count({ where: { action: 'academic.room.delete', targetId: BigInt(room.id) } })).toBe(1);
    });
  });
});
