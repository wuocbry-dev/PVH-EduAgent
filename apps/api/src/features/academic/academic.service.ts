import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClassDto,
  ClassStudentDto,
  DepartmentDto,
  GradeDto,
  RoomDto,
  SchoolYearDto,
  SemesterDto,
  SubjectDto,
  MyAcademicDto,
  TeacherOptionDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import type {
  BulkSessionsInput,
  ClassInput,
  ClassQuery,
  DepartmentInput,
  RoomInput,
  SchoolYearInput,
  SemesterInput,
  SemesterQuery,
  SubjectInput,
  UpdateClassInput,
  UpdateRoomInput,
  UpdateSchoolYearInput,
  UpdateSemesterInput,
  UpdateSubjectInput,
} from './dto/academic.dto.js';
import { isHomeroomOf } from './homeroom.js';

const day = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (v: string) => new Date(`${v}T00:00:00Z`);

const CLASS_INCLUDE = {
  grade: true,
  schoolYear: true,
  homeroomTeacher: { select: { fullName: true } },
  _count: { select: { enrollments: true } },
} satisfies Prisma.SchoolClassInclude;
type ClassRow = Prisma.SchoolClassGetPayload<{ include: typeof CLASS_INCLUDE }>;

// Quản lý dữ liệu học vụ gốc (bước 14). Quyền `academic:manage`; mọi thao tác ghi audit `academic.*`.
@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  // ───────────── Năm học & học kỳ ─────────────

  async listSchoolYears(actor: AuthUser): Promise<SchoolYearDto[]> {
    assertPermission(actor, 'academic:manage');
    const rows = await this.prisma.schoolYear.findMany({ orderBy: { name: 'desc' } });
    return rows.map(toSchoolYearDto);
  }

  async createSchoolYear(actor: AuthUser, input: SchoolYearInput, ip?: string): Promise<SchoolYearDto> {
    assertPermission(actor, 'academic:manage');
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (input.isCurrent) await tx.schoolYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
        return tx.schoolYear.create({
          data: {
            name: input.name,
            startDate: toDate(input.startDate),
            endDate: toDate(input.endDate),
            isCurrent: input.isCurrent ?? false,
          },
        });
      });
      await this.record(actor, 'academic.school_year.create', 'school_year', row.id, ip, { name: row.name });
      return toSchoolYearDto(row);
    } catch (err) {
      throw this.conflictOr(err, 'Năm học đã tồn tại');
    }
  }

  async updateSchoolYear(actor: AuthUser, id: string, input: UpdateSchoolYearInput, ip?: string): Promise<SchoolYearDto> {
    assertPermission(actor, 'academic:manage');
    const current = await this.schoolYearOrThrow(id);
    const start = input.startDate ?? day(current.startDate);
    const end = input.endDate ?? day(current.endDate);
    if (start > end) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    if (input.isCurrent === false && current.isCurrent) {
      throw new BadRequestException('Cần luôn có một năm học hiện hành: hãy đặt năm khác làm hiện hành');
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (input.isCurrent) {
          await tx.schoolYear.updateMany({ where: { isCurrent: true, id: { not: current.id } }, data: { isCurrent: false } });
        }
        return tx.schoolYear.update({
          where: { id: current.id },
          data: {
            name: input.name,
            startDate: input.startDate ? toDate(input.startDate) : undefined,
            endDate: input.endDate ? toDate(input.endDate) : undefined,
            isCurrent: input.isCurrent,
          },
        });
      });
      await this.record(actor, 'academic.school_year.update', 'school_year', row.id, ip, input);
      return toSchoolYearDto(row);
    } catch (err) {
      throw this.conflictOr(err, 'Năm học đã tồn tại');
    }
  }

  async deleteSchoolYear(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'academic:manage');
    const year = await this.schoolYearOrThrow(id);
    if (year.isCurrent) throw new ConflictException('Không thể xóa năm học hiện hành');
    const classes = await this.prisma.schoolClass.count({ where: { schoolYearId: year.id } });
    if (classes > 0) throw new ConflictException(`Năm học còn ${classes} lớp, hãy xóa lớp trước`);
    await this.prisma.schoolYear.delete({ where: { id: year.id } });
    await this.record(actor, 'academic.school_year.delete', 'school_year', year.id, ip, { name: year.name });
  }

  async listSemesters(actor: AuthUser, query: SemesterQuery): Promise<SemesterDto[]> {
    assertPermission(actor, 'academic:manage');
    const rows = await this.prisma.semester.findMany({
      where: query.schoolYearId ? { schoolYearId: BigInt(query.schoolYearId) } : undefined,
      orderBy: [{ schoolYearId: 'desc' }, { number: 'asc' }],
    });
    return rows.map(toSemesterDto);
  }

  async createSemester(actor: AuthUser, input: SemesterInput, ip?: string): Promise<SemesterDto> {
    assertPermission(actor, 'academic:manage');
    const year = await this.schoolYearOrThrow(input.schoolYearId);
    try {
      const row = await this.prisma.semester.create({
        data: {
          schoolYearId: year.id,
          number: input.number,
          name: `Học kỳ ${input.number === 1 ? 'I' : 'II'}`,
          startDate: toDate(input.startDate),
          endDate: toDate(input.endDate),
        },
      });
      await this.record(actor, 'academic.semester.create', 'semester', row.id, ip, { year: year.name, number: row.number });
      return toSemesterDto(row);
    } catch (err) {
      throw this.conflictOr(err, 'Năm học này đã có học kỳ đó');
    }
  }

  async updateSemester(actor: AuthUser, id: string, input: UpdateSemesterInput, ip?: string): Promise<SemesterDto> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.semester.findUnique({ where: { id: parseId(id) } });
    if (!current) throw new NotFoundException('Không tìm thấy học kỳ');
    const start = input.startDate ?? day(current.startDate);
    const end = input.endDate ?? day(current.endDate);
    if (start > end) throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    const row = await this.prisma.semester.update({
      where: { id: current.id },
      data: {
        startDate: input.startDate ? toDate(input.startDate) : undefined,
        endDate: input.endDate ? toDate(input.endDate) : undefined,
      },
    });
    await this.record(actor, 'academic.semester.update', 'semester', row.id, ip, input);
    return toSemesterDto(row);
  }

  async deleteSemester(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.semester.findUnique({ where: { id: parseId(id) } });
    if (!current) throw new NotFoundException('Không tìm thấy học kỳ');
    try {
      await this.prisma.semester.delete({ where: { id: current.id } });
    } catch {
      throw new ConflictException('Học kỳ đang có dữ liệu liên quan, không thể xóa');
    }
    await this.record(actor, 'academic.semester.delete', 'semester', current.id, ip, { number: current.number });
  }

  // ───────────── Khối, tổ, môn, phòng ─────────────

  async listGrades(actor: AuthUser): Promise<GradeDto[]> {
    assertPermission(actor, 'academic:manage');
    const rows = await this.prisma.grade.findMany({ orderBy: { level: 'asc' } });
    return rows.map((g) => ({ id: g.id.toString(), level: g.level, name: g.name }));
  }

  async listDepartments(actor: AuthUser): Promise<DepartmentDto[]> {
    assertPermission(actor, 'academic:manage');
    const rows = await this.prisma.department.findMany({ orderBy: { name: 'asc' } });
    return rows.map((d) => ({ id: d.id.toString(), name: d.name }));
  }

  async createDepartment(actor: AuthUser, input: DepartmentInput, ip?: string): Promise<DepartmentDto> {
    assertPermission(actor, 'academic:manage');
    try {
      const row = await this.prisma.department.create({ data: { name: input.name } });
      await this.record(actor, 'academic.department.create', 'department', row.id, ip, { name: row.name });
      return { id: row.id.toString(), name: row.name };
    } catch (err) {
      throw this.conflictOr(err, 'Tổ chuyên môn đã tồn tại');
    }
  }

  async updateDepartment(actor: AuthUser, id: string, input: DepartmentInput, ip?: string): Promise<DepartmentDto> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.department.findUnique({ where: { id: parseId(id) } });
    if (!current) throw new NotFoundException('Không tìm thấy tổ chuyên môn');
    try {
      const row = await this.prisma.department.update({ where: { id: current.id }, data: { name: input.name } });
      await this.record(actor, 'academic.department.update', 'department', row.id, ip, input);
      return { id: row.id.toString(), name: row.name };
    } catch (err) {
      throw this.conflictOr(err, 'Tổ chuyên môn đã tồn tại');
    }
  }

  async deleteDepartment(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.department.findUnique({
      where: { id: parseId(id) },
      include: { _count: { select: { subjects: true, teachers: true } } },
    });
    if (!current) throw new NotFoundException('Không tìm thấy tổ chuyên môn');
    const { subjects, teachers } = current._count;
    if (subjects + teachers > 0) {
      throw new ConflictException(`Tổ còn ${subjects} môn và ${teachers} giáo viên, hãy chuyển sang tổ khác trước`);
    }
    await this.prisma.department.delete({ where: { id: current.id } });
    await this.record(actor, 'academic.department.delete', 'department', current.id, ip, { name: current.name });
  }

  async listSubjects(actor: AuthUser): Promise<SubjectDto[]> {
    assertPermission(actor, 'academic:manage');
    const rows = await this.prisma.subject.findMany({ include: { department: true }, orderBy: { name: 'asc' } });
    return rows.map(toSubjectDto);
  }

  async createSubject(actor: AuthUser, input: SubjectInput, ip?: string): Promise<SubjectDto> {
    assertPermission(actor, 'academic:manage');
    const departmentId = await this.departmentIdOrNull(input.departmentId);
    try {
      const row = await this.prisma.subject.create({
        data: { code: input.code, name: input.name, departmentId, gradingType: input.gradingType },
        include: { department: true },
      });
      await this.record(actor, 'academic.subject.create', 'subject', row.id, ip, { code: row.code });
      return toSubjectDto(row);
    } catch (err) {
      throw this.conflictOr(err, 'Mã môn đã tồn tại');
    }
  }

  async updateSubject(actor: AuthUser, id: string, input: UpdateSubjectInput, ip?: string): Promise<SubjectDto> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.subject.findUnique({ where: { id: parseId(id) } });
    if (!current) throw new NotFoundException('Không tìm thấy môn học');
    const departmentId = input.departmentId === undefined ? undefined : await this.departmentIdOrNull(input.departmentId);
    const row = await this.prisma.subject.update({
      where: { id: current.id },
      data: { name: input.name, departmentId, gradingType: input.gradingType },
      include: { department: true },
    });
    await this.record(actor, 'academic.subject.update', 'subject', row.id, ip, input);
    return toSubjectDto(row);
  }

  // Các bước sau (phân công giảng dạy, đợt thi, điểm) phải dùng khoá ngoại không xoá dây chuyền,
  // nên môn đã có dữ liệu sẽ không xóa được (CSDL từ chối → 409 ở đây).
  async deleteSubject(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.subject.findUnique({ where: { id: parseId(id) } });
    if (!current) throw new NotFoundException('Không tìm thấy môn học');
    try {
      await this.prisma.subject.delete({ where: { id: current.id } });
    } catch {
      throw new ConflictException('Môn học đang có dữ liệu liên quan, không thể xóa');
    }
    await this.record(actor, 'academic.subject.delete', 'subject', current.id, ip, { code: current.code });
  }

  async listRooms(actor: AuthUser): Promise<RoomDto[]> {
    assertPermission(actor, 'academic:manage');
    const rows = await this.prisma.room.findMany({ orderBy: { name: 'asc' } });
    return rows.map((r) => ({ id: r.id.toString(), name: r.name, kind: r.kind }));
  }

  async createRoom(actor: AuthUser, input: RoomInput, ip?: string): Promise<RoomDto> {
    assertPermission(actor, 'academic:manage');
    try {
      const row = await this.prisma.room.create({ data: { name: input.name, kind: input.kind ?? null } });
      await this.record(actor, 'academic.room.create', 'room', row.id, ip, { name: row.name });
      return { id: row.id.toString(), name: row.name, kind: row.kind };
    } catch (err) {
      throw this.conflictOr(err, 'Tên phòng đã tồn tại');
    }
  }

  async updateRoom(actor: AuthUser, id: string, input: UpdateRoomInput, ip?: string): Promise<RoomDto> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.room.findUnique({ where: { id: parseId(id) } });
    if (!current) throw new NotFoundException('Không tìm thấy phòng');
    try {
      const row = await this.prisma.room.update({ where: { id: current.id }, data: { name: input.name, kind: input.kind } });
      await this.record(actor, 'academic.room.update', 'room', row.id, ip, input);
      return { id: row.id.toString(), name: row.name, kind: row.kind };
    } catch (err) {
      throw this.conflictOr(err, 'Tên phòng đã tồn tại');
    }
  }

  async deleteRoom(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'academic:manage');
    const current = await this.prisma.room.findUnique({ where: { id: parseId(id) } });
    if (!current) throw new NotFoundException('Không tìm thấy phòng');
    try {
      await this.prisma.room.delete({ where: { id: current.id } });
    } catch {
      throw new ConflictException('Phòng đang được dùng, không thể xóa');
    }
    await this.record(actor, 'academic.room.delete', 'room', current.id, ip, { name: current.name });
  }

  // ───────────── Lớp ─────────────

  async listClasses(actor: AuthUser, query: ClassQuery): Promise<ClassDto[]> {
    assertPermission(actor, 'academic:manage');
    const schoolYearId = query.schoolYearId ? BigInt(query.schoolYearId) : (await this.currentYear())?.id;
    const rows = await this.prisma.schoolClass.findMany({
      where: schoolYearId ? { schoolYearId } : undefined,
      include: CLASS_INCLUDE,
      orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(toClassDto);
  }

  async teacherOptions(actor: AuthUser): Promise<TeacherOptionDto[]> {
    assertPermission(actor, 'academic:manage');
    const rows = await this.prisma.teacherProfile.findMany({
      where: { user: { status: { not: 'LOCKED' } } },
      include: { user: { select: { fullName: true } } },
      orderBy: { teacherCode: 'asc' },
    });
    return rows.map((t) => ({ userId: t.userId.toString(), teacherCode: t.teacherCode, fullName: t.user.fullName }));
  }

  async createClass(actor: AuthUser, input: ClassInput, ip?: string): Promise<ClassDto> {
    assertPermission(actor, 'academic:manage');
    const year = input.schoolYearId ? await this.schoolYearOrThrow(input.schoolYearId) : await this.currentYear();
    if (!year) throw new BadRequestException('Chưa có năm học hiện hành');
    const grade = await this.prisma.grade.findUnique({ where: { level: input.gradeLevel } });
    if (!grade) throw new BadRequestException('Khối không tồn tại');
    const homeroomTeacherId = await this.teacherIdOrNull(input.homeroomTeacherId);
    try {
      const row = await this.prisma.schoolClass.create({
        data: {
          name: input.name,
          gradeId: grade.id,
          schoolYearId: year.id,
          subjectCombo: input.subjectCombo ?? null,
          homeroomTeacherId,
          sessions: input.sessions,
        },
        include: CLASS_INCLUDE,
      });
      await this.record(actor, 'academic.class.create', 'class', row.id, ip, { name: row.name, year: year.name });
      return toClassDto(row);
    } catch (err) {
      throw this.conflictOr(err, `Lớp ${input.name} đã có trong năm học ${year.name}`);
    }
  }

  async updateClass(actor: AuthUser, id: string, input: UpdateClassInput, ip?: string): Promise<ClassDto> {
    assertPermission(actor, 'academic:manage');
    const current = await this.classOrThrow(id);
    const homeroomTeacherId =
      input.homeroomTeacherId === undefined ? undefined : await this.teacherIdOrNull(input.homeroomTeacherId);
    try {
      const row = await this.prisma.schoolClass.update({
        where: { id: current.id },
        data: { name: input.name, subjectCombo: input.subjectCombo, homeroomTeacherId, sessions: input.sessions },
        include: CLASS_INCLUDE,
      });
      await this.record(actor, 'academic.class.update', 'class', row.id, ip, input);
      return toClassDto(row);
    } catch (err) {
      throw this.conflictOr(err, 'Tên lớp đã có trong năm học này');
    }
  }

  // Chỉnh buổi học (sáng/chiều/cả hai) hàng loạt theo khối hoặc danh sách lớp trong một năm học.
  async setSessionsBulk(actor: AuthUser, input: BulkSessionsInput, ip?: string): Promise<{ updated: number }> {
    assertPermission(actor, 'academic:manage');
    const year = input.schoolYearId ? await this.schoolYearOrThrow(input.schoolYearId) : await this.currentYear();
    if (!year) throw new BadRequestException('Chưa có năm học hiện hành');
    const { count } = await this.prisma.schoolClass.updateMany({
      where: {
        schoolYearId: year.id,
        grade: input.gradeLevel === undefined ? undefined : { level: input.gradeLevel },
        id: input.classIds ? { in: input.classIds.map((id) => BigInt(id)) } : undefined,
      },
      data: { sessions: input.sessions },
    });
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'academic.class.sessions',
      params: { year: year.name, gradeLevel: input.gradeLevel, classes: input.classIds?.length, sessions: input.sessions, updated: count },
      ok: true,
      ip,
    });
    return { updated: count };
  }

  async deleteClass(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'academic:manage');
    const current = await this.classOrThrow(id);
    if (current._count.enrollments > 0) {
      throw new ConflictException(`Lớp còn ${current._count.enrollments} học sinh, hãy chuyển học sinh sang lớp khác trước`);
    }
    try {
      await this.prisma.schoolClass.delete({ where: { id: current.id } });
    } catch {
      throw new ConflictException('Lớp đang có dữ liệu liên quan, không thể xóa');
    }
    await this.record(actor, 'academic.class.delete', 'class', current.id, ip, { name: current.name });
  }

  // Quản lý học vụ hoặc giáo viên chủ nhiệm của đúng lớp đó.
  async listClassStudents(actor: AuthUser, id: string): Promise<ClassStudentDto[]> {
    const cls = await this.classOrThrow(id);
    if (!can(actor, 'academic:manage') && !(await isHomeroomOf(this.prisma, actor, cls.id))) {
      assertPermission(actor, 'academic:manage');
    }
    const rows = await this.prisma.classEnrollment.findMany({
      where: { classId: cls.id },
      include: { student: { include: { studentProfile: true } } },
    });
    return rows
      .filter((r) => r.student.studentProfile)
      .map((r) => {
        const profile = r.student.studentProfile!;
        return {
          userId: r.student.id.toString(),
          studentCode: profile.studentCode,
          fullName: r.student.fullName,
          birthDate: profile.birthDate ? day(profile.birthDate) : null,
          gender: profile.gender,
          status: r.student.status,
        };
      })
      .sort((a, b) => a.studentCode.localeCompare(b.studentCode));
  }

  // Chuyển lớp trong cùng năm học của lớp đích (một học sinh chỉ thuộc một lớp mỗi năm học).
  async transferStudent(actor: AuthUser, userId: string, classId: string, ip?: string): Promise<void> {
    assertPermission(actor, 'academic:manage');
    const target = await this.classOrThrow(classId);
    const student = await this.prisma.studentProfile.findUnique({ where: { userId: parseId(userId) } });
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');
    const key = { studentId_schoolYearId: { studentId: student.userId, schoolYearId: target.schoolYearId } };
    const existing = await this.prisma.classEnrollment.findUnique({ where: key });
    if (existing?.classId === target.id) throw new BadRequestException('Học sinh đã ở lớp này');
    await this.prisma.classEnrollment.upsert({
      where: key,
      update: { classId: target.id },
      create: { studentId: student.userId, classId: target.id, schoolYearId: target.schoolYearId },
    });
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'academic.student.transfer',
      targetType: 'user',
      targetId: student.userId.toString(),
      params: { studentCode: student.studentCode, toClass: target.name },
      ok: true,
      ip,
    });
  }

  // Thông tin học vụ của chính mình: ai đăng nhập cũng gọi được, chỉ trả dữ liệu của bản thân.
  async me(actor: AuthUser): Promise<MyAcademicDto> {
    const userId = BigInt(actor.id);
    const year = await this.currentYear();
    const [student, teacher, enrollment, homerooms] = await Promise.all([
      this.prisma.studentProfile.findUnique({ where: { userId } }),
      this.prisma.teacherProfile.findUnique({ where: { userId } }),
      year
        ? this.prisma.classEnrollment.findUnique({
            where: { studentId_schoolYearId: { studentId: userId, schoolYearId: year.id } },
            include: { class: { include: { homeroomTeacher: { select: { fullName: true } } } } },
          })
        : null,
      year
        ? this.prisma.schoolClass.findMany({
            where: { homeroomTeacherId: userId, schoolYearId: year.id },
            include: { _count: { select: { enrollments: true } } },
            orderBy: { name: 'asc' },
          })
        : [],
    ]);
    return {
      studentCode: student?.studentCode ?? null,
      teacherCode: teacher?.teacherCode ?? null,
      schoolYearName: year?.name ?? null,
      className: enrollment?.class.name ?? null,
      homeroomTeacherName: enrollment?.class.homeroomTeacher?.fullName ?? null,
      homeroomClasses: homerooms.map((c) => ({ id: c.id.toString(), name: c.name, studentCount: c._count.enrollments })),
    };
  }

  // ───────────── Hỗ trợ ─────────────

  private currentYear() {
    return this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
  }

  private async schoolYearOrThrow(id: string) {
    const year = await this.prisma.schoolYear.findUnique({ where: { id: parseId(id) } });
    if (!year) throw new NotFoundException('Không tìm thấy năm học');
    return year;
  }

  private async classOrThrow(id: string): Promise<ClassRow> {
    const cls = await this.prisma.schoolClass.findUnique({ where: { id: parseId(id) }, include: CLASS_INCLUDE });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp');
    return cls;
  }

  private async departmentIdOrNull(id: string | null | undefined): Promise<bigint | null> {
    if (!id) return null;
    const dep = await this.prisma.department.findUnique({ where: { id: parseId(id) } });
    if (!dep) throw new BadRequestException('Tổ chuyên môn không tồn tại');
    return dep.id;
  }

  private async teacherIdOrNull(id: string | null | undefined): Promise<bigint | null> {
    if (!id) return null;
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: parseId(id) } });
    if (!teacher) throw new BadRequestException('Giáo viên chủ nhiệm phải là giáo viên có hồ sơ giáo viên');
    return teacher.userId;
  }

  private conflictOr(err: unknown, message: string): unknown {
    return isUniqueViolation(err) ? new ConflictException(message) : err;
  }

  private record(
    actor: AuthUser,
    action: string,
    targetType: string,
    targetId: bigint,
    ip: string | undefined,
    params: unknown,
  ): Promise<void> {
    return this.audit.record({
      userId: actor.id,
      channel: 'web',
      action,
      targetType,
      targetId: targetId.toString(),
      params,
      ok: true,
      ip,
    });
  }
}

function toSchoolYearDto(y: { id: bigint; name: string; startDate: Date; endDate: Date; isCurrent: boolean }): SchoolYearDto {
  return { id: y.id.toString(), name: y.name, startDate: day(y.startDate), endDate: day(y.endDate), isCurrent: y.isCurrent };
}

function toSemesterDto(s: { id: bigint; schoolYearId: bigint; number: number; name: string; startDate: Date; endDate: Date }): SemesterDto {
  return {
    id: s.id.toString(),
    schoolYearId: s.schoolYearId.toString(),
    number: s.number,
    name: s.name,
    startDate: day(s.startDate),
    endDate: day(s.endDate),
  };
}

function toSubjectDto(s: {
  id: bigint;
  code: string;
  name: string;
  departmentId: bigint | null;
  gradingType: 'SCORE' | 'COMMENT';
  department: { name: string } | null;
}): SubjectDto {
  return {
    id: s.id.toString(),
    code: s.code,
    name: s.name,
    departmentId: s.departmentId?.toString() ?? null,
    departmentName: s.department?.name ?? null,
    gradingType: s.gradingType,
  };
}

function toClassDto(c: ClassRow): ClassDto {
  return {
    id: c.id.toString(),
    name: c.name,
    gradeId: c.gradeId.toString(),
    gradeLevel: c.grade.level,
    schoolYearId: c.schoolYearId.toString(),
    schoolYearName: c.schoolYear.name,
    subjectCombo: c.subjectCombo,
    homeroomTeacherId: c.homeroomTeacherId?.toString() ?? null,
    homeroomTeacherName: c.homeroomTeacher?.fullName ?? null,
    studentCount: c._count.enrollments,
    sessions: c.sessions,
  };
}
