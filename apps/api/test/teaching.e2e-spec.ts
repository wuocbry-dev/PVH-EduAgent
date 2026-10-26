// Bước 16 – phân công giảng dạy: định mức tiết, phân công giáo viên–môn–lớp, cảnh báo, sao chép, xuất Excel, quyền.
// Cần PostgreSQL đã migrate + seed và Redis. Dữ liệu do test tạo mang hậu tố RUN và được dọn khi xong.
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { CopyAssignmentsResultDto, TeachingAssignmentDto, TeachingSummaryDto } from '@pvh/shared';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/features/auth/password.js';
import { PrismaService } from './../src/infrastructure/database/prisma.service.js';

const PASSWORD = 'Pvh@2026';
const ADMIN = 'admin@pvh.edu.vn';
const PRINCIPAL = 'bgh@pvh.edu.vn';
const EDITOR = 'bientap@pvh.edu.vn';
const SEED_TEACHER = 'gv.toan@pvh.edu.vn';
const STUDENT = 'HSMAU01';

const RUN = String(Date.now()).slice(-7);
const tag = (s: string) => `${s}${RUN}`;
const YEAR_B = '2093-2094';

type Agent = ReturnType<typeof request.agent>;

describe('Phân công giảng dạy (bước 16, e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Agent;
  let principal: Agent;
  let currentYearId: string;
  let dep1: string;
  let dep2: string;
  let subjectA: { id: string; name: string }; // môn của tổ 1
  let subjectB: { id: string; name: string }; // môn của tổ 2
  let t1: { id: string; email: string }; // giáo viên tổ 1
  let t2: { id: string; email: string }; // giáo viên tổ 2
  let cls1: { id: string; name: string };
  let cls2: { id: string; name: string };
  const userIds: bigint[] = [];

  const http = () => request(app.getHttpServer());

  async function loginAs(identifier: string, password = PASSWORD): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ identifier, password }).expect(200);
    return agent;
  }

  async function makeTeacher(code: string, departmentId: string) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'TEACHER' } });
    const email = `e16.${code.toLowerCase()}@pvh.edu.vn`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `GV ${code}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: { roleId: role.id } },
        teacherProfile: { create: { teacherCode: code, departmentId: BigInt(departmentId) } },
      },
    });
    userIds.push(user.id);
    return { id: user.id.toString(), email };
  }

  const assign = (body: Record<string, unknown>) => principal.post('/teaching/assignments').send(body);
  const summary = async (query = '') =>
    (await principal.get(`/teaching/summary${query}`).expect(200)).body as TeachingSummaryDto;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await loginAs(ADMIN);
    principal = await loginAs(PRINCIPAL);

    currentYearId = (await prisma.schoolYear.findFirstOrThrow({ where: { isCurrent: true } })).id.toString();
    dep1 = (await admin.post('/academic/departments').send({ name: tag('Tổ A ') }).expect(201)).body.id;
    dep2 = (await admin.post('/academic/departments').send({ name: tag('Tổ B ') }).expect(201)).body.id;
    subjectA = (await admin.post('/academic/subjects').send({ code: tag('MA'), name: `Môn A ${RUN}`, departmentId: dep1 }).expect(201)).body;
    // Tên môn bắt đầu bằng "=" để kiểm tra chống Excel injection khi xuất.
    subjectB = (await admin.post('/academic/subjects').send({ code: tag('MB'), name: '=HYPERLINK("http://evil")', departmentId: dep2 }).expect(201)).body;
    t1 = await makeTeacher(tag('E16A'), dep1);
    t2 = await makeTeacher(tag('E16B'), dep2);
    cls1 = (await admin.post('/academic/classes').send({ name: tag('P'), gradeLevel: 10 }).expect(201)).body;
    cls2 = (await admin.post('/academic/classes').send({ name: tag('Q'), gradeLevel: 10 }).expect(201)).body;
  });

  afterAll(async () => {
    const classes = [BigInt(cls1.id), BigInt(cls2.id)];
    await prisma.teachingAssignment.deleteMany({ where: { OR: [{ classId: { in: classes } }, { teacherId: { in: userIds } }] } });
    await prisma.teachingAssignment.deleteMany({ where: { class: { schoolYear: { name: YEAR_B } } } });
    await prisma.subjectPeriodQuota.deleteMany({ where: { subjectId: { in: [BigInt(subjectA.id), BigInt(subjectB.id)] } } });
    await prisma.classPeriodQuota.deleteMany({ where: { classId: { in: classes } } });
    await prisma.schoolClass.deleteMany({ where: { OR: [{ id: { in: classes } }, { schoolYear: { name: YEAR_B } }] } });
    await prisma.schoolYear.deleteMany({ where: { name: YEAR_B } });
    await prisma.subject.deleteMany({ where: { id: { in: [BigInt(subjectA.id), BigInt(subjectB.id)] } } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { targetType: 'user', targetId: { in: userIds } }] } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.department.deleteMany({ where: { id: { in: [BigInt(dep1), BigInt(dep2)] } } });
    await app.close();
  });

  describe('quyền', () => {
    it('BGH xem và sửa; ADMIN chỉ xem; biên tập viên, giáo viên, học sinh bị 403 mọi API quản lý', async () => {
      await principal.get('/teaching/summary').expect(200);
      await admin.get('/teaching/summary').expect(200);
      await admin.get('/teaching/assignments').expect(200);
      await admin.get('/teaching/quotas').expect(200);
      // ADMIN không có quyền phân công.
      await admin.put('/teaching/quotas').send({ gradeLevel: 10, subjectId: subjectA.id, periodsPerWeek: 2 }).expect(403);
      await admin.post('/teaching/assignments').send({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 2 }).expect(403);
      await admin.put(`/teaching/teachers/${t1.id}/quota`).send({ weeklyQuota: 10 }).expect(403);
      const me = (await admin.get('/auth/me').expect(200)).body;
      expect(me.permissions).toContain('teaching:read');
      expect(me.permissions).not.toContain('teaching:assign');

      for (const who of [EDITOR, SEED_TEACHER, STUDENT]) {
        const a = await loginAs(who);
        for (const path of ['/teaching/summary', '/teaching/assignments', '/teaching/quotas', '/teaching/summary/export']) {
          await a.get(path).expect(403);
        }
        await a.post('/teaching/assignments').send({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 2 }).expect(403);
        await a.put('/teaching/quotas').send({ gradeLevel: 10, subjectId: subjectA.id, periodsPerWeek: 2 }).expect(403);
        await a.post('/teaching/assignments/copy').send({ from: { schoolYearId: currentYearId }, to: { schoolYearId: currentYearId } }).expect(403);
        await a.delete('/teaching/assignments/1').expect(403);
      }
      await http().get('/teaching/summary').expect(401);
    });
  });

  describe('định mức tiết/tuần', () => {
    it('đặt, đọc, đổi, xoá định mức theo khối; ghi đè theo lớp; kiểm tra số tiết', async () => {
      const set = (periodsPerWeek: unknown) =>
        principal.put('/teaching/quotas').send({ gradeLevel: 10, subjectId: subjectA.id, periodsPerWeek });
      let q = (await set(3).expect(200)).body;
      expect(q.grades.find((g: { gradeLevel: number }) => g.gradeLevel === 10).quotas).toContainEqual({ subjectId: subjectA.id, periodsPerWeek: 3 });
      q = (await set(4).expect(200)).body;
      expect(q.grades.find((g: { gradeLevel: number }) => g.gradeLevel === 10).quotas).toContainEqual({ subjectId: subjectA.id, periodsPerWeek: 4 });
      for (const bad of [11, -1, 2.5, 'ba']) await set(bad).expect(400);
      await principal.put('/teaching/quotas').send({ gradeLevel: 9, subjectId: subjectA.id, periodsPerWeek: 2 }).expect(400);
      await principal.put('/teaching/quotas').send({ gradeLevel: 10, subjectId: '999999999', periodsPerWeek: 2 }).expect(404);

      const over = (await principal.put('/teaching/quotas/class').send({ classId: cls2.id, subjectId: subjectA.id, periodsPerWeek: 5 }).expect(200)).body;
      expect(over.classOverrides).toContainEqual({ classId: cls2.id, subjectId: subjectA.id, periodsPerWeek: 5 });
      const cleared = (await principal.put('/teaching/quotas/class').send({ classId: cls2.id, subjectId: subjectA.id, periodsPerWeek: null }).expect(200)).body;
      expect(cleared.classOverrides.filter((o: { classId: string }) => o.classId === cls2.id)).toEqual([]);

      q = (await set(null).expect(200)).body;
      const g10 = q.grades.find((g: { gradeLevel: number }) => g.gradeLevel === 10);
      expect(g10.quotas.find((x: { subjectId: string }) => x.subjectId === subjectA.id)).toBeUndefined();
      // CSDL cũng chặn số tiết vô lý.
      await expect(
        prisma.subjectPeriodQuota.create({ data: { schoolYearId: BigInt(currentYearId), gradeId: (await prisma.grade.findUniqueOrThrow({ where: { level: 11 } })).id, subjectId: BigInt(subjectA.id), periodsPerWeek: 99 } }),
      ).rejects.toThrow();
    });
  });

  describe('phân công', () => {
    it('một lớp–môn chỉ một giáo viên chính: giao cho người thứ hai bị chặn (cả ở CSDL)', async () => {
      const first = (await assign({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 3 }).expect(201)).body as TeachingAssignmentDto;
      expect(first).toMatchObject({ className: cls1.name, teacherId: t1.id, periodsPerWeek: 3, semesterId: null, crossDepartment: false });

      const dup = await assign({ classId: cls1.id, subjectId: subjectA.id, teacherId: t2.id, periodsPerWeek: 2, confirmCrossDepartment: true }).expect(409);
      expect(dup.body.message).toMatch(/đã có giáo viên GV/);
      await assign({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 1 }).expect(409); // cùng người cũng không được giao hai lần
      // Ràng buộc nằm ở CSDL, không chỉ ở service.
      await expect(
        prisma.teachingAssignment.create({
          data: { schoolYearId: BigInt(currentYearId), classId: BigInt(cls1.id), subjectId: BigInt(subjectA.id), teacherId: BigInt(t2.id), periodsPerWeek: 2 },
        }),
      ).rejects.toThrow();
      expect(await prisma.teachingAssignment.count({ where: { classId: BigInt(cls1.id), subjectId: BigInt(subjectA.id) } })).toBe(1);

      // Danh sách và lọc.
      const list = (await principal.get('/teaching/assignments').query({ classId: cls1.id }).expect(200)).body as TeachingAssignmentDto[];
      expect(list.map((a) => a.id)).toEqual([first.id]);
      expect((await principal.get('/teaching/assignments').query({ teacherId: t2.id }).expect(200)).body).toEqual([]);

      await principal.delete(`/teaching/assignments/${first.id}`).expect(204);
      await principal.delete(`/teaching/assignments/${first.id}`).expect(404);
      expect(await prisma.auditLog.count({ where: { action: 'teaching.assign', targetId: BigInt(cls1.id) } })).toBeGreaterThanOrEqual(1);
      expect(await prisma.auditLog.count({ where: { action: 'teaching.unassign', targetId: BigInt(cls1.id) } })).toBe(1);
    });

    it('phân công cả năm và theo học kỳ loại trừ nhau; học kỳ phải thuộc năm học của lớp', async () => {
      const sems = (await admin.get('/academic/semesters').query({ schoolYearId: currentYearId }).expect(200)).body as { id: string; number: number }[];
      const hk1 = sems.find((s) => s.number === 1)!;
      const hk2 = sems.find((s) => s.number === 2)!;
      const body = { classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 2 };

      const a1 = (await assign({ ...body, semesterId: hk1.id }).expect(201)).body as TeachingAssignmentDto;
      expect(a1.semesterName).toBe('Học kỳ I');
      await assign({ ...body, semesterId: hk1.id }).expect(409); // trùng học kỳ
      await assign(body).expect(409); // cả năm đụng phân công học kỳ
      const a2 = (await assign({ ...body, semesterId: hk2.id, teacherId: t2.id, confirmCrossDepartment: true }).expect(201)).body as TeachingAssignmentDto; // học kỳ khác thì được
      await principal.delete(`/teaching/assignments/${a1.id}`).expect(204);
      await principal.delete(`/teaching/assignments/${a2.id}`).expect(204);

      const whole = (await assign(body).expect(201)).body as TeachingAssignmentDto;
      await assign({ ...body, semesterId: hk1.id }).expect(409); // học kỳ đụng phân công cả năm
      await principal.delete(`/teaching/assignments/${whole.id}`).expect(204);

      // Học kỳ của năm học khác.
      const otherYear = (await admin.post('/academic/school-years').send({ name: YEAR_B, startDate: '2093-09-05', endDate: '2094-05-31' }).expect(201)).body;
      const otherSem = (await admin.post('/academic/semesters').send({ schoolYearId: otherYear.id, number: 1, startDate: '2093-09-05', endDate: '2094-01-15' }).expect(201)).body;
      const bad = await assign({ ...body, semesterId: otherSem.id }).expect(400);
      expect(bad.body.message).toMatch(/Học kỳ không thuộc năm học/);
    });

    it('giáo viên khác tổ chuyên môn: phải xác nhận rõ ràng (cả khi giao mới lẫn đổi giáo viên)', async () => {
      const body = { classId: cls1.id, subjectId: subjectA.id, teacherId: t2.id, periodsPerWeek: 2 };
      const refused = await assign(body).expect(409);
      expect(refused.body.message).toMatch(/dạy chéo tổ/);
      expect(await prisma.teachingAssignment.count({ where: { classId: BigInt(cls1.id) } })).toBe(0);

      const ok = (await assign({ ...body, confirmCrossDepartment: true }).expect(201)).body as TeachingAssignmentDto;
      expect(ok.crossDepartment).toBe(true);
      // Đổi sang giáo viên cùng tổ thì không cần xác nhận; đổi ngược lại cần.
      const back = (await principal.patch(`/teaching/assignments/${ok.id}`).send({ teacherId: t1.id }).expect(200)).body as TeachingAssignmentDto;
      expect(back).toMatchObject({ teacherId: t1.id, crossDepartment: false });
      await principal.patch(`/teaching/assignments/${ok.id}`).send({ teacherId: t2.id }).expect(409);
      await principal.patch(`/teaching/assignments/${ok.id}`).send({ teacherId: t2.id, confirmCrossDepartment: true, periodsPerWeek: 4 }).expect(200);
      expect((await prisma.teachingAssignment.findUniqueOrThrow({ where: { id: BigInt(ok.id) } })).periodsPerWeek).toBe(4);
      await principal.patch(`/teaching/assignments/${ok.id}`).send({ periodsPerWeek: 11 }).expect(400);
      await principal.delete(`/teaching/assignments/${ok.id}`).expect(204);
    });

    it('chỉ giao được cho giáo viên có hồ sơ và đang hoạt động; số tiết phải hợp lệ', async () => {
      const student = await prisma.user.findFirstOrThrow({ where: { studentProfile: { studentCode: STUDENT } } });
      const body = { classId: cls1.id, subjectId: subjectA.id, periodsPerWeek: 2 };
      await assign({ ...body, teacherId: student.id.toString() }).expect(400);
      const principalId = (await prisma.user.findUniqueOrThrow({ where: { email: PRINCIPAL } })).id.toString();
      await assign({ ...body, teacherId: principalId }).expect(400); // không có hồ sơ giáo viên
      await assign({ ...body, teacherId: t1.id, periodsPerWeek: 0 }).expect(400);
      await assign({ ...body, teacherId: t1.id, periodsPerWeek: 11 }).expect(400);
      await assign({ ...body, classId: '999999999', teacherId: t1.id }).expect(404);
      await prisma.user.update({ where: { id: BigInt(t1.id) }, data: { status: 'LOCKED' } });
      await assign({ ...body, teacherId: t1.id }).expect(400);
      await prisma.user.update({ where: { id: BigInt(t1.id) }, data: { status: 'ACTIVE' } });
      expect(await prisma.teachingAssignment.count({ where: { classId: BigInt(cls1.id) } })).toBe(0);
    });

    it('môn đã có phân công thì không xoá được (409)', async () => {
      const a = (await assign({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 2 }).expect(201)).body as TeachingAssignmentDto;
      const res = await admin.delete(`/academic/subjects/${subjectA.id}`).expect(409);
      expect(res.body.message).toMatch(/dữ liệu liên quan/);
      await admin.delete(`/academic/classes/${cls1.id}`).expect(409); // lớp cũng vậy
      await principal.delete(`/teaching/assignments/${a.id}`).expect(204);
    });
  });

  describe('thống kê và cảnh báo', () => {
    const mine = (s: TeachingSummaryDto, type: string, classId?: string) =>
      s.issues.filter((i) => i.type === type && (!classId || i.classId === classId) && (i.subjectId === undefined || [subjectA.id, subjectB.id].includes(i.subjectId)));

    it('thiếu/thừa tiết, môn chưa có người dạy, vượt/thiếu định mức giáo viên đúng với dữ liệu thử', async () => {
      await principal.put('/teaching/quotas').send({ gradeLevel: 10, subjectId: subjectA.id, periodsPerWeek: 3 }).expect(200);

      let s = await summary();
      expect(mine(s, 'SUBJECT_UNASSIGNED', cls1.id)).toHaveLength(1);
      expect(mine(s, 'SUBJECT_UNASSIGNED', cls2.id)).toHaveLength(1);

      const a = (await assign({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 2 }).expect(201)).body as TeachingAssignmentDto;
      s = await summary();
      expect(mine(s, 'SUBJECT_UNASSIGNED', cls1.id)).toHaveLength(0);
      expect(mine(s, 'PERIODS_SHORT', cls1.id)[0]!.message).toContain('thiếu 1 tiết');
      const c1 = s.classes.find((c) => c.classId === cls1.id)!;
      expect(c1.subjects.find((x) => x.subjectId === subjectA.id)).toMatchObject({ requiredPeriods: 3, assignedPeriods: 2 });

      await principal.patch(`/teaching/assignments/${a.id}`).send({ periodsPerWeek: 3 }).expect(200);
      s = await summary();
      expect(mine(s, 'PERIODS_SHORT', cls1.id)).toHaveLength(0);
      expect(mine(s, 'PERIODS_EXCESS', cls1.id)).toHaveLength(0);

      await principal.patch(`/teaching/assignments/${a.id}`).send({ periodsPerWeek: 5 }).expect(200);
      s = await summary();
      expect(mine(s, 'PERIODS_EXCESS', cls1.id)[0]).toMatchObject({ severity: 'warning' });

      // Ghi đè theo lớp: lớp 1 cần 5 tiết thì hết thừa.
      await principal.put('/teaching/quotas/class').send({ classId: cls1.id, subjectId: subjectA.id, periodsPerWeek: 5 }).expect(200);
      s = await summary();
      expect(mine(s, 'PERIODS_EXCESS', cls1.id)).toHaveLength(0);
      expect(s.classes.find((c) => c.classId === cls1.id)!.requiredPeriods).toBeGreaterThanOrEqual(5);

      // Giáo viên: mặc định 17, đang dạy 5 → thiếu; đặt định mức riêng 4 → vượt; 5 → đủ.
      let load = s.teachers.find((t) => t.teacherId === t1.id)!;
      expect(s.defaultQuota).toBe(17);
      expect(load).toMatchObject({ periods: 5, quota: 17, delta: -12, quotaOverridden: false });
      expect(s.issues.some((i) => i.type === 'TEACHER_UNDER' && i.teacherId === t1.id)).toBe(true);

      await principal.put(`/teaching/teachers/${t1.id}/quota`).send({ weeklyQuota: 4 }).expect(204);
      s = await summary();
      load = s.teachers.find((t) => t.teacherId === t1.id)!;
      expect(load).toMatchObject({ quota: 4, delta: 1, quotaOverridden: true });
      expect(s.issues.some((i) => i.type === 'TEACHER_OVER' && i.teacherId === t1.id && i.severity === 'error')).toBe(true);
      await principal.put(`/teaching/teachers/${t1.id}/quota`).send({ weeklyQuota: 5 }).expect(204);
      s = await summary();
      expect(s.issues.some((i) => (i.type === 'TEACHER_OVER' || i.type === 'TEACHER_UNDER') && i.teacherId === t1.id)).toBe(false);
      await principal.put(`/teaching/teachers/${t1.id}/quota`).send({ weeklyQuota: 99 }).expect(400);
      await principal.put('/teaching/teachers/999999999/quota').send({ weeklyQuota: 5 }).expect(404);
      await principal.put(`/teaching/teachers/${t1.id}/quota`).send({ weeklyQuota: null }).expect(204); // về định mức mặc định

      // Thống kê theo tổ gồm tổ của giáo viên thử.
      const deptName = (await prisma.department.findUniqueOrThrow({ where: { id: BigInt(dep1) } })).name;
      expect(s.departments.find((d) => d.departmentName === deptName)).toMatchObject({ teachers: 1, periods: 5, quota: 5 });

      await principal.delete(`/teaching/assignments/${a.id}`).expect(204);
      await principal.put('/teaching/quotas/class').send({ classId: cls1.id, subjectId: subjectA.id, periodsPerWeek: null }).expect(200);
    });

    it('phân công môn chưa có định mức và dạy chéo tổ được cảnh báo', async () => {
      await principal.put('/teaching/quotas').send({ gradeLevel: 10, subjectId: subjectB.id, periodsPerWeek: null }).expect(200);
      const a = (await assign({ classId: cls2.id, subjectId: subjectB.id, teacherId: t1.id, periodsPerWeek: 2, confirmCrossDepartment: true }).expect(201)).body as TeachingAssignmentDto;
      const s = await summary();
      expect(mine(s, 'NO_QUOTA', cls2.id)).toHaveLength(1);
      expect(s.issues.some((i) => i.type === 'CROSS_DEPARTMENT' && i.classId === cls2.id)).toBe(true);
      await principal.delete(`/teaching/assignments/${a.id}`).expect(204);
    });

    it('xuất Excel đọc lại được và ô bắt đầu bằng "=" được thêm dấu nháy', async () => {
      const a = (await assign({ classId: cls2.id, subjectId: subjectB.id, teacherId: t2.id, periodsPerWeek: 2 }).expect(201)).body as TeachingAssignmentDto;
      const res = await principal
        .get('/teaching/summary/export')
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('.xlsx');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Theo lớp', 'Theo giáo viên', 'Theo tổ', 'Cảnh báo']);
      const cells: string[] = [];
      wb.worksheets.forEach((w) => w.eachRow((row) => row.eachCell((c) => typeof c.value === 'string' && cells.push(c.value))));
      expect(cells.some((v) => v.includes('HYPERLINK'))).toBe(true);
      expect(cells.filter((v) => /^[=+\-@]/.test(v))).toEqual([]); // không ô nào bắt đầu bằng ký tự công thức
      expect(cells).toContain(`'=HYPERLINK("http://evil")`);
      await principal.delete(`/teaching/assignments/${a.id}`).expect(204);
    });
  });

  describe('giáo viên xem phân công của mình', () => {
    it('chỉ thấy lớp mình dạy (kèm sĩ số, tổng tiết, định mức); người khác không thấy của mình', async () => {
      await principal.put('/teaching/quotas').send({ gradeLevel: 10, subjectId: subjectA.id, periodsPerWeek: 3 }).expect(200);
      const mineA = (await assign({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 3 }).expect(201)).body as TeachingAssignmentDto;
      const other = (await assign({ classId: cls2.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 2 }).expect(201)).body as TeachingAssignmentDto;
      const forT2 = (await assign({ classId: cls2.id, subjectId: subjectB.id, teacherId: t2.id, periodsPerWeek: 2 }).expect(201)).body as TeachingAssignmentDto;

      const t1Agent = await loginAs(t1.email);
      const data = (await t1Agent.get('/teaching/mine').expect(200)).body;
      expect(data.items.map((i: { className: string }) => i.className).sort()).toEqual([cls1.name, cls2.name].sort());
      expect(data).toMatchObject({ totalPeriods: 5, weeklyQuota: 17 });
      expect(data.items.every((i: { subjectName: string }) => i.subjectName === subjectA.name)).toBe(true);
      expect(data.items[0]).toHaveProperty('studentCount');

      const t2Data = (await (await loginAs(t2.email)).get('/teaching/mine').expect(200)).body;
      expect(t2Data.items).toHaveLength(1);
      expect(t2Data.items[0]).toMatchObject({ className: cls2.name, periodsPerWeek: 2 });

      // Giáo viên không sửa được phân công của mình hay của ai.
      await t1Agent.patch(`/teaching/assignments/${mineA.id}`).send({ periodsPerWeek: 1 }).expect(403);
      await t1Agent.delete(`/teaching/assignments/${mineA.id}`).expect(403);
      await t1Agent.put(`/teaching/teachers/${t1.id}/quota`).send({ weeklyQuota: 1 }).expect(403);
      expect((await prisma.teachingAssignment.findUniqueOrThrow({ where: { id: BigInt(mineA.id) } })).periodsPerWeek).toBe(3);

      // Học sinh và tài khoản không có hồ sơ giáo viên: danh sách rỗng, không lỗi.
      expect((await (await loginAs(STUDENT)).get('/teaching/mine').expect(200)).body.items).toEqual([]);
      expect((await admin.get('/teaching/mine').expect(200)).body.items).toEqual([]);

      for (const a of [mineA, other, forT2]) await principal.delete(`/teaching/assignments/${a.id}`).expect(204);
    });
  });

  describe('sao chép từ năm học/học kỳ trước', () => {
    it('sao chép theo tên lớp, bỏ qua lớp không có và giáo viên bị khoá, chạy lại không tạo trùng', async () => {
      const yearB = await prisma.schoolYear.findUniqueOrThrow({ where: { name: YEAR_B } });
      // Năm đích chỉ có lớp cls1 cùng tên (lớp cls2 không có).
      await admin.post('/academic/classes').send({ name: cls1.name, gradeLevel: 10, schoolYearId: yearB.id.toString() }).expect(201);

      const a = (await assign({ classId: cls1.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 3 }).expect(201)).body as TeachingAssignmentDto;
      const b = (await assign({ classId: cls2.id, subjectId: subjectA.id, teacherId: t1.id, periodsPerWeek: 2 }).expect(201)).body as TeachingAssignmentDto; // lớp không có ở năm đích
      const c = (await assign({ classId: cls1.id, subjectId: subjectB.id, teacherId: t2.id, periodsPerWeek: 2 }).expect(201)).body as TeachingAssignmentDto;

      const body = { from: { schoolYearId: currentYearId }, to: { schoolYearId: yearB.id.toString() } };
      const first = (await principal.post('/teaching/assignments/copy').send(body).expect(200)).body as CopyAssignmentsResultDto;
      expect(first.copied).toBeGreaterThanOrEqual(2);
      expect(first.skipped.filter((s) => s.reason === 'Lớp không có trong năm học đích').map((s) => s.className)).toContain(cls2.name);
      const copied = await prisma.teachingAssignment.findMany({ where: { schoolYearId: yearB.id } });
      expect(copied.map((r) => r.periodsPerWeek).sort((a, b) => a - b)).toEqual(expect.arrayContaining([2, 3]));

      const again = (await principal.post('/teaching/assignments/copy').send(body).expect(200)).body as CopyAssignmentsResultDto;
      expect(again.copied).toBe(0);
      expect(again.skipped.filter((s) => s.reason === 'Đã có phân công').length).toBeGreaterThanOrEqual(2);
      expect(await prisma.teachingAssignment.count({ where: { schoolYearId: yearB.id } })).toBe(copied.length);

      // Nguồn trùng đích bị từ chối; năm không tồn tại → 404.
      await principal.post('/teaching/assignments/copy').send({ from: body.from, to: body.from }).expect(400);
      await principal.post('/teaching/assignments/copy').send({ from: body.from, to: { schoolYearId: '999999999' } }).expect(404);

      for (const x of [a, b, c]) await principal.delete(`/teaching/assignments/${x.id}`).expect(204);
      await prisma.teachingAssignment.deleteMany({ where: { schoolYearId: yearB.id } });
    });
  });
});
