import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TEACHING_DEFAULT_WEEKLY_QUOTA,
  type CopyAssignmentsResultDto,
  type MyTeachingDto,
  type PeriodQuotasDto,
  type TeachingAssignmentDto,
  type TeachingSummaryDto,
} from '@pvh/shared';
import ExcelJS from 'exceljs';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { safeCell } from '../roster/excel.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  AssignmentsQuery,
  CopyAssignmentsInput,
  CreateAssignmentInput,
  QuotasQuery,
  SetClassQuotaInput,
  SetGradeQuotaInput,
  SummaryQuery,
  TeacherQuotaInput,
  UpdateAssignmentInput,
} from './dto/teaching.dto.js';
import { computeSummary } from './teaching-summary.js';

const ASSIGNMENT_INCLUDE = {
  semester: true,
  class: { include: { grade: true } },
  subject: { include: { department: true } },
  teacher: { include: { teacherProfile: { include: { department: true } } } },
} satisfies Prisma.TeachingAssignmentInclude;
type AssignmentRow = Prisma.TeachingAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>;

// Phân công giảng dạy (bước 16). Xem: `teaching:read` (BGH, ADMIN); sửa: `teaching:assign` (chỉ BGH).
// Giáo viên chỉ xem phân công của chính mình (`mine`). Mọi thay đổi ghi audit `teaching.*`.
@Injectable()
export class TeachingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Định mức tiết/tuần ─────────────

  async getQuotas(actor: AuthUser, query: QuotasQuery): Promise<PeriodQuotasDto> {
    assertPermission(actor, 'teaching:read');
    const year = await this.yearOrThrow(query.schoolYearId);
    const [grade, overrides] = await Promise.all([
      this.prisma.subjectPeriodQuota.findMany({ where: { schoolYearId: year.id }, include: { grade: true } }),
      this.prisma.classPeriodQuota.findMany({ where: { class: { schoolYearId: year.id } } }),
    ]);
    const levels = [...new Set(grade.map((q) => q.grade.level))].sort((a, b) => a - b);
    return {
      schoolYearId: year.id.toString(),
      grades: levels.map((level) => ({
        gradeLevel: level,
        quotas: grade
          .filter((q) => q.grade.level === level)
          .map((q) => ({ subjectId: q.subjectId.toString(), periodsPerWeek: q.periodsPerWeek })),
      })),
      classOverrides: overrides.map((o) => ({
        classId: o.classId.toString(),
        subjectId: o.subjectId.toString(),
        periodsPerWeek: o.periodsPerWeek,
      })),
    };
  }

  async setGradeQuota(actor: AuthUser, input: SetGradeQuotaInput, ip?: string): Promise<PeriodQuotasDto> {
    assertPermission(actor, 'teaching:assign');
    const year = await this.yearOrThrow(input.schoolYearId);
    const grade = await this.prisma.grade.findUnique({ where: { level: input.gradeLevel } });
    if (!grade) throw new BadRequestException('Khối không tồn tại');
    const subject = await this.subjectOrThrow(input.subjectId);
    const where = { schoolYearId_gradeId_subjectId: { schoolYearId: year.id, gradeId: grade.id, subjectId: subject.id } };
    if (input.periodsPerWeek === null) {
      await this.prisma.subjectPeriodQuota.deleteMany({
        where: { schoolYearId: year.id, gradeId: grade.id, subjectId: subject.id },
      });
    } else {
      await this.prisma.subjectPeriodQuota.upsert({
        where,
        update: { periodsPerWeek: input.periodsPerWeek },
        create: { schoolYearId: year.id, gradeId: grade.id, subjectId: subject.id, periodsPerWeek: input.periodsPerWeek },
      });
    }
    await this.record(actor, 'teaching.quota.set', 'subject', subject.id, ip, {
      year: year.name,
      grade: input.gradeLevel,
      subject: subject.code,
      periodsPerWeek: input.periodsPerWeek,
    });
    return this.getQuotas(actor, { schoolYearId: year.id.toString() });
  }

  async setClassQuota(actor: AuthUser, input: SetClassQuotaInput, ip?: string): Promise<PeriodQuotasDto> {
    assertPermission(actor, 'teaching:assign');
    const cls = await this.classOrThrow(input.classId);
    const subject = await this.subjectOrThrow(input.subjectId);
    if (input.periodsPerWeek === null) {
      await this.prisma.classPeriodQuota.deleteMany({ where: { classId: cls.id, subjectId: subject.id } });
    } else {
      await this.prisma.classPeriodQuota.upsert({
        where: { classId_subjectId: { classId: cls.id, subjectId: subject.id } },
        update: { periodsPerWeek: input.periodsPerWeek },
        create: { classId: cls.id, subjectId: subject.id, periodsPerWeek: input.periodsPerWeek },
      });
    }
    await this.record(actor, 'teaching.class_quota.set', 'class', cls.id, ip, {
      class: cls.name,
      subject: subject.code,
      periodsPerWeek: input.periodsPerWeek,
    });
    return this.getQuotas(actor, { schoolYearId: cls.schoolYearId.toString() });
  }

  // ───────────── Phân công ─────────────

  async listAssignments(actor: AuthUser, query: AssignmentsQuery): Promise<TeachingAssignmentDto[]> {
    assertPermission(actor, 'teaching:read');
    const year = await this.yearOrThrow(query.schoolYearId);
    const rows = await this.prisma.teachingAssignment.findMany({
      where: {
        schoolYearId: year.id,
        classId: query.classId ? parseId(query.classId) : undefined,
        teacherId: query.teacherId ? parseId(query.teacherId) : undefined,
        semesterId: query.semesterId ? parseId(query.semesterId) : undefined,
      },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
    return rows.map(toAssignmentDto);
  }

  async createAssignment(actor: AuthUser, input: CreateAssignmentInput, ip?: string): Promise<TeachingAssignmentDto> {
    assertPermission(actor, 'teaching:assign');
    const cls = await this.classOrThrow(input.classId);
    const subject = await this.prisma.subject.findUnique({ where: { id: parseId(input.subjectId) }, include: { department: true } });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học');
    const teacher = await this.teacherOrThrow(input.teacherId);
    const semesterId = input.semesterId ? await this.semesterIdOf(input.semesterId, cls.schoolYearId) : null;
    this.assertCrossDepartment(teacher, subject, input.confirmCrossDepartment);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.assertNoConflict(tx, cls.id, subject.id, semesterId, null);
        return tx.teachingAssignment.create({
          data: {
            schoolYearId: cls.schoolYearId,
            semesterId,
            classId: cls.id,
            subjectId: subject.id,
            teacherId: teacher.id,
            periodsPerWeek: input.periodsPerWeek,
          },
          include: ASSIGNMENT_INCLUDE,
        });
      });
      await this.record(actor, 'teaching.assign', 'class', cls.id, ip, {
        class: cls.name,
        subject: subject.code,
        teacher: teacher.teacherProfile?.teacherCode,
        periodsPerWeek: input.periodsPerWeek,
        semesterId: semesterId?.toString() ?? null,
        crossDepartment: input.confirmCrossDepartment === true || undefined,
      });
      return toAssignmentDto(row);
    } catch (err) {
      throw isUniqueViolation(err) ? new ConflictException(`Lớp ${cls.name} môn ${subject.name} đã có giáo viên`) : err;
    }
  }

  async updateAssignment(actor: AuthUser, id: string, input: UpdateAssignmentInput, ip?: string): Promise<TeachingAssignmentDto> {
    assertPermission(actor, 'teaching:assign');
    const current = await this.assignmentOrThrow(id);
    const teacher = input.teacherId ? await this.teacherOrThrow(input.teacherId) : null;
    if (teacher) this.assertCrossDepartment(teacher, current.subject, input.confirmCrossDepartment);

    // Thời khoá biểu (bước 17): giảm số tiết dưới số tiết đã xếp thì từ chối; đổi giáo viên thì đồng bộ các tiết đã xếp
    // (bản nháp và bản đã công bố; bản lưu trữ giữ nguyên lịch sử) và báo giáo viên cũ/mới.
    if (input.periodsPerWeek !== undefined && input.periodsPerWeek < current.periodsPerWeek) {
      const placed = await this.prisma.timetableSlot.groupBy({
        by: ['timetableId'],
        where: { assignmentId: current.id, timetable: { status: { not: 'ARCHIVED' } } },
        _count: { _all: true },
      });
      const most = Math.max(0, ...placed.map((p) => p._count._all));
      if (most > input.periodsPerWeek) {
        throw new ConflictException(`Phân công đang được xếp ${most} tiết/tuần trong thời khoá biểu, hãy gỡ bớt tiết trước khi giảm xuống ${input.periodsPerWeek}`);
      }
    }
    const teacherChanged = !!teacher && teacher.id !== current.teacherId;
    let publishedAffected = 0;
    let row: AssignmentRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.teachingAssignment.update({
          where: { id: current.id },
          data: { teacherId: teacher?.id, periodsPerWeek: input.periodsPerWeek },
          include: ASSIGNMENT_INCLUDE,
        });
        if (teacherChanged) {
          const slots = await tx.timetableSlot.findMany({
            where: { assignmentId: current.id, timetable: { status: { in: ['DRAFT', 'PUBLISHED'] } } },
            include: { timetable: { select: { status: true } } },
          });
          publishedAffected = slots.filter((s) => s.timetable.status === 'PUBLISHED').length;
          if (slots.length > 0) {
            await tx.timetableSlot.updateMany({ where: { id: { in: slots.map((s) => s.id) } }, data: { teacherId: teacher.id } });
          }
        }
        return updated;
      });
    } catch (err) {
      throw isUniqueViolation(err)
        ? new ConflictException('Giáo viên mới đã có tiết khác trùng giờ trong thời khoá biểu, hãy gỡ hoặc dời tiết đó trước khi đổi giáo viên')
        : err;
    }
    if (teacherChanged && publishedAffected > 0) {
      const text = `Lịch dạy thay đổi: lớp ${current.class.name} môn ${current.subject.name} đã đổi giáo viên. Xem lại thời khoá biểu của bạn.`;
      await this.notifications.notify([
        { userId: current.teacherId, title: 'Thay đổi thời khoá biểu', body: text },
        { userId: row.teacherId, title: 'Thay đổi thời khoá biểu', body: text },
      ]);
    }
    await this.record(actor, 'teaching.update', 'class', current.classId, ip, {
      class: current.class.name,
      subject: current.subject.code,
      teacher: row.teacher.teacherProfile?.teacherCode,
      periodsPerWeek: row.periodsPerWeek,
      timetableSlotsSynced: teacherChanged ? publishedAffected : undefined,
    });
    return toAssignmentDto(row);
  }

  async deleteAssignment(actor: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(actor, 'teaching:assign');
    const current = await this.assignmentOrThrow(id);
    // Tiết đã xếp trong bản nháp thì gỡ theo; nằm trong bản đã công bố/lưu trữ thì giữ lịch sử nên không xoá được.
    const kept = await this.prisma.timetableSlot.count({ where: { assignmentId: current.id, timetable: { status: { not: 'DRAFT' } } } });
    if (kept > 0) {
      throw new ConflictException(`Phân công đang có ${kept} tiết trong thời khoá biểu đã công bố, không thể xóa`);
    }
    await this.prisma.$transaction([
      this.prisma.timetableSlot.deleteMany({ where: { assignmentId: current.id } }),
      this.prisma.teachingAssignment.delete({ where: { id: current.id } }),
    ]);
    await this.record(actor, 'teaching.unassign', 'class', current.classId, ip, {
      class: current.class.name,
      subject: current.subject.code,
      teacher: current.teacher.teacherProfile?.teacherCode,
    });
  }

  // Sao chép phân công từ năm học/học kỳ trước. Lớp ghép theo tên (lớp thuộc từng năm học); dòng không sao chép được
  // (lớp không có ở đích, giáo viên bị khoá, đã có phân công) được liệt kê kèm lý do, không tạo trùng.
  async copyAssignments(actor: AuthUser, input: CopyAssignmentsInput, ip?: string): Promise<CopyAssignmentsResultDto> {
    assertPermission(actor, 'teaching:assign');
    const fromYear = await this.yearOrThrow(input.from.schoolYearId);
    const toYear = await this.yearOrThrow(input.to.schoolYearId);
    const fromSem = input.from.semesterId ? await this.semesterIdOf(input.from.semesterId, fromYear.id) : null;
    const toSem = input.to.semesterId ? await this.semesterIdOf(input.to.semesterId, toYear.id) : null;
    if (fromYear.id === toYear.id && fromSem === toSem) throw new BadRequestException('Nguồn và đích trùng nhau');

    const source = await this.prisma.teachingAssignment.findMany({
      where: { schoolYearId: fromYear.id, semesterId: fromSem },
      include: ASSIGNMENT_INCLUDE,
    });
    const targetClasses = new Map(
      (await this.prisma.schoolClass.findMany({ where: { schoolYearId: toYear.id } })).map((c) => [c.name, c]),
    );
    const result: CopyAssignmentsResultDto = { copied: 0, skipped: [] };
    for (const row of source) {
      const skip = (reason: string) => result.skipped.push({ className: row.class.name, subjectName: row.subject.name, reason });
      const cls = targetClasses.get(row.class.name);
      if (!cls) {
        skip('Lớp không có trong năm học đích');
        continue;
      }
      if (row.teacher.status === 'LOCKED') {
        skip('Giáo viên đang bị khóa');
        continue;
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.assertNoConflict(tx, cls.id, row.subjectId, toSem, null);
          await tx.teachingAssignment.create({
            data: {
              schoolYearId: toYear.id,
              semesterId: toSem,
              classId: cls.id,
              subjectId: row.subjectId,
              teacherId: row.teacherId,
              periodsPerWeek: row.periodsPerWeek,
            },
          });
        });
        result.copied++;
      } catch (err) {
        if (err instanceof ConflictException || isUniqueViolation(err)) skip('Đã có phân công');
        else throw err;
      }
    }
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'teaching.copy',
      params: { from: fromYear.name, to: toYear.name, copied: result.copied, skipped: result.skipped.length },
      ok: true,
      ip,
    });
    return result;
  }

  // ───────────── Thống kê & cảnh báo ─────────────

  async summary(actor: AuthUser, query: SummaryQuery): Promise<TeachingSummaryDto> {
    assertPermission(actor, 'teaching:read');
    const year = await this.yearOrThrow(query.schoolYearId);
    const semesterId = query.semesterId ? await this.semesterIdOf(query.semesterId, year.id) : null;
    const defaultQuota = await this.defaultQuota();

    const [classes, subjects, gradeQuotas, classQuotas, assignments, teachers] = await Promise.all([
      this.prisma.schoolClass.findMany({ where: { schoolYearId: year.id }, include: { grade: true }, orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }] }),
      this.prisma.subject.findMany({ include: { department: true } }),
      this.prisma.subjectPeriodQuota.findMany({ where: { schoolYearId: year.id }, include: { grade: true } }),
      this.prisma.classPeriodQuota.findMany({ where: { class: { schoolYearId: year.id } } }),
      // Phân công áp dụng: cả năm, cộng phân công của học kỳ đang xem (nếu chọn).
      this.prisma.teachingAssignment.findMany({
        where: { schoolYearId: year.id, OR: [{ semesterId: null }, ...(semesterId ? [{ semesterId }] : [])] },
      }),
      this.prisma.teacherProfile.findMany({
        where: { user: { status: { not: 'LOCKED' } } },
        include: { user: { select: { fullName: true } }, department: true },
      }),
    ]);

    const result = computeSummary({
      classes: classes.map((c) => ({ id: c.id.toString(), name: c.name, gradeLevel: c.grade.level })),
      subjects: subjects.map((s) => ({ id: s.id.toString(), code: s.code, name: s.name, departmentName: s.department?.name ?? null })),
      gradeQuotas: new Map(gradeQuotas.map((q) => [`${q.grade.level}:${q.subjectId}`, q.periodsPerWeek])),
      classQuotas: new Map(classQuotas.map((q) => [`${q.classId}:${q.subjectId}`, q.periodsPerWeek])),
      assignments: assignments.map((a) => ({
        classId: a.classId.toString(),
        subjectId: a.subjectId.toString(),
        teacherId: a.teacherId.toString(),
        periodsPerWeek: a.periodsPerWeek,
      })),
      teachers: teachers.map((t) => ({
        id: t.userId.toString(),
        code: t.teacherCode,
        name: t.user.fullName,
        departmentName: t.department?.name ?? null,
        weeklyQuota: t.weeklyQuota,
      })),
      defaultQuota,
    });
    return {
      schoolYearId: year.id.toString(),
      schoolYearName: year.name,
      semesterId: semesterId?.toString() ?? null,
      defaultQuota,
      ...result,
    };
  }

  // Xuất Excel (ô văn bản bắt đầu bằng = + - @ được thêm dấu nháy để chống Excel injection).
  async exportSummary(actor: AuthUser, query: SummaryQuery): Promise<Buffer> {
    const s = await this.summary(actor, query);
    const wb = new ExcelJS.Workbook();
    const text = (v: string) => safeCell(v);

    const byClass = wb.addWorksheet('Theo lớp');
    byClass.addRow(['Lớp', 'Khối', 'Môn', 'Định mức (tiết/tuần)', 'Đã phân công', 'Giáo viên']);
    for (const c of s.classes) {
      for (const sub of c.subjects) {
        byClass.addRow([
          text(c.className),
          c.gradeLevel,
          text(sub.subjectName),
          sub.requiredPeriods,
          sub.assignedPeriods,
          text(sub.teachers.map((t) => `${t.teacherName} (${t.periodsPerWeek})`).join('; ')),
        ]);
      }
    }
    const byTeacher = wb.addWorksheet('Theo giáo viên');
    byTeacher.addRow(['Mã', 'Họ tên', 'Tổ chuyên môn', 'Số tiết', 'Định mức', 'Chênh lệch', 'Lớp–môn đang dạy']);
    for (const t of s.teachers) {
      byTeacher.addRow([
        text(t.teacherCode),
        text(t.teacherName),
        text(t.departmentName ?? ''),
        t.periods,
        t.quota,
        t.delta,
        text(t.assignments.map((a) => `${a.className} ${a.subjectName} (${a.periodsPerWeek})`).join('; ')),
      ]);
    }
    const byDepartment = wb.addWorksheet('Theo tổ');
    byDepartment.addRow(['Tổ chuyên môn', 'Số giáo viên', 'Tổng tiết', 'Tổng định mức']);
    for (const d of s.departments) byDepartment.addRow([text(d.departmentName), d.teachers, d.periods, d.quota]);
    const issues = wb.addWorksheet('Cảnh báo');
    issues.addRow(['Mức độ', 'Nội dung']);
    for (const i of s.issues) issues.addRow([i.severity === 'error' ? 'Lỗi' : 'Cảnh báo', text(i.message)]);
    for (const sheet of wb.worksheets) sheet.getRow(1).font = { bold: true };
    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  // ───────────── Giáo viên ─────────────

  // Lớp tôi dạy: chỉ phân công của chính người đăng nhập (năm học hiện hành).
  async mine(actor: AuthUser): Promise<MyTeachingDto> {
    const userId = BigInt(actor.id);
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    const defaultQuota = await this.defaultQuota();
    if (!year || !profile) {
      return { schoolYearName: year?.name ?? null, weeklyQuota: profile?.weeklyQuota ?? defaultQuota, totalPeriods: 0, items: [] };
    }
    const rows = await this.prisma.teachingAssignment.findMany({
      where: { schoolYearId: year.id, teacherId: userId },
      include: { class: { include: { _count: { select: { enrollments: true } } } }, subject: true, semester: true },
      orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
    // Tổng tiết = phân công cả năm + phân công của học kỳ đang diễn ra (nếu có).
    const today = new Date();
    const current = await this.prisma.semester.findFirst({
      where: { schoolYearId: year.id, startDate: { lte: today }, endDate: { gte: today } },
    });
    const total = rows
      .filter((r) => r.semesterId === null || r.semesterId === current?.id)
      .reduce((sum, r) => sum + r.periodsPerWeek, 0);
    return {
      schoolYearName: year.name,
      weeklyQuota: profile.weeklyQuota ?? defaultQuota,
      totalPeriods: total,
      items: rows.map((r) => ({
        classId: r.classId.toString(),
        className: r.class.name,
        studentCount: r.class._count.enrollments,
        subjectCode: r.subject.code,
        subjectName: r.subject.name,
        semesterName: r.semester?.name ?? null,
        periodsPerWeek: r.periodsPerWeek,
      })),
    };
  }

  async setTeacherQuota(actor: AuthUser, userId: string, input: TeacherQuotaInput, ip?: string): Promise<void> {
    assertPermission(actor, 'teaching:assign');
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId: parseId(userId) } });
    if (!profile) throw new NotFoundException('Không tìm thấy giáo viên');
    await this.prisma.teacherProfile.update({ where: { userId: profile.userId }, data: { weeklyQuota: input.weeklyQuota } });
    await this.record(actor, 'teaching.teacher_quota.set', 'user', profile.userId, ip, {
      teacher: profile.teacherCode,
      weeklyQuota: input.weeklyQuota,
    });
  }

  // ───────────── Hỗ trợ ─────────────

  private async defaultQuota(): Promise<number> {
    return Number(await this.settings.effective('teaching.default_quota')) || TEACHING_DEFAULT_WEEKLY_QUOTA;
  }

  private async yearOrThrow(id?: string) {
    const year = id
      ? await this.prisma.schoolYear.findUnique({ where: { id: parseId(id) } })
      : await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    if (!year) throw new NotFoundException(id ? 'Không tìm thấy năm học' : 'Chưa có năm học hiện hành');
    return year;
  }

  private async classOrThrow(id: string) {
    const cls = await this.prisma.schoolClass.findUnique({ where: { id: parseId(id) } });
    if (!cls) throw new NotFoundException('Không tìm thấy lớp');
    return cls;
  }

  private async subjectOrThrow(id: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: parseId(id) } });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học');
    return subject;
  }

  private async teacherOrThrow(id: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id: parseId(id), teacherProfile: { isNot: null } },
      include: { teacherProfile: { include: { department: true } } },
    });
    if (!teacher) throw new BadRequestException('Giáo viên không tồn tại hoặc chưa có hồ sơ giáo viên');
    if (teacher.status === 'LOCKED') throw new BadRequestException('Giáo viên đang bị khóa');
    return teacher;
  }

  private async semesterIdOf(semesterId: string, schoolYearId: bigint): Promise<bigint> {
    const sem = await this.prisma.semester.findUnique({ where: { id: parseId(semesterId) } });
    if (!sem || sem.schoolYearId !== schoolYearId) throw new BadRequestException('Học kỳ không thuộc năm học của lớp');
    return sem.id;
  }

  private async assignmentOrThrow(id: string): Promise<AssignmentRow> {
    const row = await this.prisma.teachingAssignment.findUnique({ where: { id: parseId(id) }, include: ASSIGNMENT_INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy phân công');
    return row;
  }

  // Dạy chéo tổ chuyên môn vẫn có thật: chỉ cho phép khi người giao xác nhận rõ ràng.
  private assertCrossDepartment(
    teacher: { fullName: string; teacherProfile: { department: { name: string } | null } | null },
    subject: { name: string; department: { name: string } | null },
    confirmed: boolean | undefined,
  ): void {
    const teacherDept = teacher.teacherProfile?.department?.name;
    const subjectDept = subject.department?.name;
    if (teacherDept && subjectDept && teacherDept !== subjectDept && !confirmed) {
      throw new ConflictException(
        `${teacher.fullName} thuộc ${teacherDept} nhưng môn ${subject.name} thuộc ${subjectDept}. Gửi confirmCrossDepartment=true để xác nhận dạy chéo tổ.`,
      );
    }
  }

  // Một lớp–môn chỉ có một giáo viên chính: phân công cả năm loại trừ mọi phân công theo học kỳ và ngược lại;
  // hai phân công cùng học kỳ cũng loại trừ nhau. (Index duy nhất một phần trong CSDL chặn trùng cùng phạm vi.)
  private async assertNoConflict(
    tx: Prisma.TransactionClient,
    classId: bigint,
    subjectId: bigint,
    semesterId: bigint | null,
    ignoreId: bigint | null,
  ): Promise<void> {
    const existing = await tx.teachingAssignment.findMany({
      where: {
        classId,
        subjectId,
        id: ignoreId ? { not: ignoreId } : undefined,
        // Trùng nếu: một trong hai là cả năm, hoặc cùng học kỳ.
        ...(semesterId === null ? {} : { OR: [{ semesterId: null }, { semesterId }] }),
      },
      include: { teacher: { select: { fullName: true } }, class: true, subject: true },
    });
    const clash = existing[0];
    if (clash) {
      throw new ConflictException(
        `Lớp ${clash.class.name} môn ${clash.subject.name} đã có giáo viên ${clash.teacher.fullName}${clash.semesterId ? ' (theo học kỳ)' : ' (cả năm)'}, hãy sửa hoặc xóa phân công đó trước`,
      );
    }
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

function toAssignmentDto(a: AssignmentRow): TeachingAssignmentDto {
  const teacherDept = a.teacher.teacherProfile?.department?.name;
  const subjectDept = a.subject.department?.name;
  return {
    id: a.id.toString(),
    schoolYearId: a.schoolYearId.toString(),
    semesterId: a.semesterId?.toString() ?? null,
    semesterName: a.semester?.name ?? null,
    classId: a.classId.toString(),
    className: a.class.name,
    gradeLevel: a.class.grade.level,
    subjectId: a.subjectId.toString(),
    subjectCode: a.subject.code,
    subjectName: a.subject.name,
    teacherId: a.teacherId.toString(),
    teacherCode: a.teacher.teacherProfile?.teacherCode ?? '',
    teacherName: a.teacher.fullName,
    periodsPerWeek: a.periodsPerWeek,
    crossDepartment: !!teacherDept && !!subjectDept && teacherDept !== subjectDept,
  };
}
