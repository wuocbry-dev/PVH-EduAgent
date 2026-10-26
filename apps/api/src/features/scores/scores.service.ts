import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  parseScore,
  type AssessmentClassDto,
  type AssessmentDto,
  type ScoreContextDto,
  type ScoreProgressDto,
  type ScoreRowDto,
  type ScoreSheetDto,
  type ScoreStatus,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isUniqueViolation } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { vnToday } from '../timetable/timetable-dates.js';
import type {
  AssessmentsQuery,
  CreateAssessmentInput,
  ExemptionInput,
  ProgressQuery,
  SaveScoresInput,
  UpdateAssessmentInput,
} from './dto/scores.dto.js';
import {
  assignmentCovers,
  buildAssessmentCode,
  codeStem,
  diffScore,
  type AssignmentScope,
  type CodeInput,
  type DesiredScore,
} from './score-rules.js';

// Số lần ghi điểm (lưu lưới, nhập Excel, công bố, miễn) tối đa mỗi phút cho một tài khoản.
export const SCORE_WRITES_PER_MIN = 60;
export const OUT_OF_SCOPE = 'Bạn không phụ trách lớp–môn của đợt thi này';

const ASSESSMENT_INCLUDE = {
  semester: { include: { schoolYear: true } },
  subject: true,
  creator: { select: { fullName: true } },
} satisfies Prisma.AssessmentInclude;
type AssessmentRow = Prisma.AssessmentGetPayload<{ include: typeof ASSESSMENT_INCLUDE }>;

const AC_INCLUDE = { class: true, assessment: { include: ASSESSMENT_INCLUDE } } satisfies Prisma.AssessmentClassInclude;
type AssessmentClassRow = Prisma.AssessmentClassGetPayload<{ include: typeof AC_INCLUDE }>;

export interface SheetAccess {
  ac: AssessmentClassRow;
  inScope: boolean; // giáo viên được phân công lớp–môn ở học kỳ của đợt
  manager: boolean; // BGH (assessment:manage)
  deadlinePassed: boolean;
}

export type NormalizedEntry = { studentId: bigint; desired: DesiredScore };
export type WriteSource = 'GRID' | 'EXCEL' | 'EXEMPT';
export interface ApplyResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const dateOf = (s: string) => new Date(`${s}T00:00:00.000Z`);
const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

// Sắp xếp kiểu sổ điểm: theo tên (từ cuối) rồi họ đệm.
export function byVietnameseName(a: string, b: string): number {
  const last = (s: string) => s.trim().split(/\s+/).at(-1) ?? s;
  return last(a).localeCompare(last(b), 'vi') || a.localeCompare(b, 'vi');
}

// Đợt thi và nhập điểm (bước 18). Điểm là dữ liệu nhạy cảm: chỉ giáo viên được phân công (score:enter, đúng lớp–môn–học kỳ)
// được nhập; BGH (assessment:manage, score:read:all) tạo đợt chung, xem, đặt miễn; ADMIN không có quyền nào.
// Giá trị điểm chỉ nằm ở scores và score_history, audit_logs chỉ ghi số lượng.
@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly limits: RateLimitService,
  ) {}

  // ───────────── Ngữ cảnh, danh sách, tiến độ ─────────────

  async context(actor: AuthUser): Promise<ScoreContextDto> {
    this.assertAnyScorePermission(actor);
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, include: { semesters: { orderBy: { number: 'asc' } } } });
    const canManage = can(actor, 'assessment:manage');
    if (!year) return { schoolYearId: null, schoolYearName: null, semesters: [], currentSemesterId: null, pairs: [], subjects: [], canManage };

    const pairs = can(actor, 'score:enter')
      ? await this.prisma.teachingAssignment.findMany({
          where: { teacherId: BigInt(actor.id), schoolYearId: year.id, subject: { gradingType: 'SCORE' } },
          include: { class: { include: { grade: true } }, subject: true },
        })
      : [];
    const subjects = canManage
      ? await this.prisma.subject.findMany({ where: { gradingType: 'SCORE' }, orderBy: { name: 'asc' } })
      : [];
    return {
      schoolYearId: year.id.toString(),
      schoolYearName: year.name,
      semesters: year.semesters.map((s) => ({
        id: s.id.toString(),
        number: s.number,
        name: s.name,
        startDate: day(s.startDate),
        endDate: day(s.endDate),
      })),
      currentSemesterId: this.currentSemester(year.semesters)?.id.toString() ?? null,
      pairs: pairs
        .map((p) => ({
          classId: p.classId.toString(),
          className: p.class.name,
          gradeLevel: p.class.grade.level,
          subjectId: p.subjectId.toString(),
          subjectCode: p.subject.code,
          subjectName: p.subject.name,
          semesterId: p.semesterId?.toString() ?? null,
        }))
        .sort((a, b) => a.className.localeCompare(b.className, 'vi') || a.subjectName.localeCompare(b.subjectName, 'vi')),
      subjects: subjects.map((s) => ({ id: s.id.toString(), code: s.code, name: s.name })),
      canManage,
    };
  }

  // Giáo viên: chỉ các đợt (và các lớp của đợt) thuộc lớp–môn mình được phân công. BGH: mọi đợt.
  async list(actor: AuthUser, query: AssessmentsQuery): Promise<AssessmentDto[]> {
    this.assertAnyScorePermission(actor);
    const semester = await this.semesterOrDefault(query.semesterId);
    if (!semester) return [];
    const where: Prisma.AssessmentWhereInput = {
      semesterId: semester.id,
      type: query.type,
      subjectId: query.subjectId ? parseId(query.subjectId) : undefined,
      classes: query.classId ? { some: { classId: parseId(query.classId) } } : undefined,
    };

    const readAll = can(actor, 'score:read:all') || can(actor, 'assessment:manage');
    let scopes: AssignmentScope[] = [];
    if (!readAll) {
      scopes = (await this.teacherScopes(actor, semester.schoolYearId)).filter(
        (s) => s.semesterId === null || s.semesterId === semester.id.toString(),
      );
      if (scopes.length === 0) return [];
      where.AND = [{ OR: scopes.map((s) => ({ subjectId: BigInt(s.subjectId), classes: { some: { classId: BigInt(s.classId) } } })) }];
    }

    const rows = await this.prisma.assessment.findMany({
      where,
      include: { ...ASSESSMENT_INCLUDE, classes: { include: { class: true } } },
      orderBy: [{ testDate: 'desc' }, { id: 'desc' }],
    });
    const visible = rows.map((a) => ({
      ...a,
      classes: readAll
        ? a.classes
        : a.classes.filter((c) =>
            assignmentCovers(scopes, {
              teacherId: actor.id,
              classId: c.classId.toString(),
              subjectId: a.subjectId.toString(),
              schoolYearId: a.semester.schoolYearId.toString(),
              semesterId: a.semesterId.toString(),
            }),
          ),
    }));
    const counts = await this.classCounts(visible.flatMap((a) => a.classes.map((c) => ({ assessmentId: a.id, classId: c.classId }))));
    return visible.map((a) => this.toDto(a, a.classes.map((c) => this.classDto(c, counts))));
  }

  async progress(actor: AuthUser, query: ProgressQuery): Promise<ScoreProgressDto> {
    assertPermission(actor, 'score:read:all');
    const semester = await this.semesterOrDefault(query.semesterId);
    if (!semester) return { assessments: [], totals: { assessments: 0, classes: 0, complete: 0, published: 0 } };
    const rows = await this.prisma.assessment.findMany({
      where: {
        semesterId: semester.id,
        type: query.type,
        subjectId: query.subjectId ? parseId(query.subjectId) : undefined,
      },
      include: { ...ASSESSMENT_INCLUDE, classes: { include: { class: { include: { grade: true } } } } },
      orderBy: [{ testDate: 'desc' }, { id: 'desc' }],
    });
    const filtered = rows
      .map((a) => ({
        ...a,
        classes: a.classes
          .filter((c) => query.gradeLevel === undefined || c.class.grade.level === query.gradeLevel)
          .sort((x, y) => x.class.name.localeCompare(y.class.name, 'vi')),
      }))
      .filter((a) => a.classes.length > 0);

    const counts = await this.classCounts(filtered.flatMap((a) => a.classes.map((c) => ({ assessmentId: a.id, classId: c.classId }))));
    // Giáo viên dạy lớp–môn (phân công theo học kỳ ưu tiên hơn phân công cả năm).
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: {
        schoolYearId: semester.schoolYearId,
        OR: [{ semesterId: null }, { semesterId: semester.id }],
        classId: { in: [...new Set(filtered.flatMap((a) => a.classes.map((c) => c.classId)))] },
      },
      include: { teacher: { select: { fullName: true } } },
      orderBy: { semesterId: { sort: 'asc', nulls: 'first' } },
    });
    const teacherOf = new Map(assignments.map((t) => [`${t.classId}:${t.subjectId}`, t.teacher.fullName]));

    let classes = 0;
    let complete = 0;
    let published = 0;
    const assessments = filtered.map((a) => {
      const { classes: _omit, ...dto } = this.toDto(a, []);
      return {
        ...dto,
        classes: a.classes.map((c) => {
          const base = this.classDto(c, counts);
          classes++;
          if (base.students > 0 && base.entered >= base.students) complete++;
          if (base.status === 'PUBLISHED') published++;
          return { ...base, teacherName: teacherOf.get(`${c.classId}:${a.subjectId}`) ?? null };
        }),
      };
    });
    return { assessments, totals: { assessments: assessments.length, classes, complete, published } };
  }

  // ───────────── Tạo / sửa / xoá đợt thi ─────────────

  async create(actor: AuthUser, input: CreateAssessmentInput, ip?: string): Promise<AssessmentDto> {
    if (input.type === 'THUONG_XUYEN') assertPermission(actor, 'score:enter');
    else assertPermission(actor, 'assessment:manage');

    const semester = await this.prisma.semester.findUnique({ where: { id: parseId(input.semesterId) }, include: { schoolYear: true } });
    if (!semester) throw new BadRequestException('Học kỳ không tồn tại');
    const subject = await this.prisma.subject.findUnique({ where: { id: parseId(input.subjectId) } });
    if (!subject) throw new BadRequestException('Môn học không tồn tại');

    let classIds: bigint[];
    let codeInput: CodeInput;
    let gradeLevel: number | null = null;
    if (input.type === 'THUONG_XUYEN') {
      const cls = await this.prisma.schoolClass.findUnique({ where: { id: parseId(input.classId) } });
      const scopes = await this.teacherScopes(actor, semester.schoolYearId);
      const covered =
        !!cls &&
        assignmentCovers(scopes, {
          teacherId: actor.id,
          classId: cls.id.toString(),
          subjectId: subject.id.toString(),
          schoolYearId: semester.schoolYearId.toString(),
          semesterId: semester.id.toString(),
        });
      if (!cls || !covered) throw new ForbiddenException('Bạn chỉ tạo được đợt kiểm tra cho lớp–môn mình được phân công ở học kỳ này');
      classIds = [cls.id];
      codeInput = { type: input.type, schoolYearName: semester.schoolYear.name, semesterNumber: semester.number, subjectCode: subject.code, scope: { className: cls.name } };
    } else {
      gradeLevel = input.gradeLevel;
      const gradeClasses = await this.prisma.schoolClass.findMany({
        where: { schoolYearId: semester.schoolYearId, grade: { level: gradeLevel } },
        orderBy: { name: 'asc' },
      });
      if (input.classIds) {
        const allowed = new Set(gradeClasses.map((c) => c.id.toString()));
        const bad = input.classIds.filter((c) => !allowed.has(c));
        if (bad.length > 0) throw new BadRequestException(`Có lớp không thuộc khối ${gradeLevel} của năm học ${semester.schoolYear.name}`);
        classIds = [...new Set(input.classIds)].map((c) => BigInt(c));
      } else {
        classIds = gradeClasses.map((c) => c.id);
      }
      if (classIds.length === 0) throw new BadRequestException(`Khối ${gradeLevel} chưa có lớp nào trong năm học ${semester.schoolYear.name}`);
      codeInput = { type: input.type, schoolYearName: semester.schoolYear.name, semesterNumber: semester.number, subjectCode: subject.code, scope: { gradeLevel } };
    }
    if (subject.gradingType !== 'SCORE') throw new BadRequestException(`Môn ${subject.name} đánh giá bằng nhận xét, không nhập điểm số`);
    if (input.testDate < day(semester.startDate) || input.testDate > day(semester.endDate)) {
      throw new BadRequestException(`Ngày kiểm tra phải nằm trong ${semester.name} (${day(semester.startDate)} – ${day(semester.endDate)})`);
    }

    const customCode = input.type === 'THUONG_XUYEN' ? undefined : input.code;
    const deadline = input.type === 'THUONG_XUYEN' ? null : (input.entryDeadline ?? null);
    let created: AssessmentRow | undefined;
    for (let attempt = 0; !created; attempt++) {
      const stem = codeStem(codeInput);
      const existing = customCode ? [] : (await this.prisma.assessment.findMany({ where: { code: { startsWith: stem } }, select: { code: true } })).map((c) => c.code);
      const code = customCode ?? buildAssessmentCode(codeInput, existing);
      try {
        created = await this.prisma.assessment.create({
          data: {
            code,
            type: input.type,
            semesterId: semester.id,
            subjectId: subject.id,
            gradeLevel,
            testDate: dateOf(input.testDate),
            description: input.description || null,
            entryDeadline: deadline ? new Date(deadline) : null,
            createdBy: BigInt(actor.id),
            classes: { create: classIds.map((classId) => ({ classId })) },
          },
          include: ASSESSMENT_INCLUDE,
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Mã tự sinh có thể trùng khi hai người tạo cùng lúc: sinh lại. Mã do BGH đặt thì báo trùng.
        if (customCode) throw new ConflictException(`Mã đợt thi ${customCode} đã tồn tại`);
        if (attempt >= 2) throw new ConflictException('Không sinh được mã đợt thi, hãy thử lại');
      }
    }
    await this.record(actor, 'assessment.create', created.id, ip, {
      code: created.code,
      type: created.type,
      subject: subject.code,
      classes: classIds.length,
    });
    return this.getDto(created.id);
  }

  async update(actor: AuthUser, id: string, input: UpdateAssessmentInput, ip?: string): Promise<AssessmentDto> {
    const a = await this.editableAssessment(actor, id);
    const manager = can(actor, 'assessment:manage');
    if (input.entryDeadline !== undefined && !manager) {
      throw new ForbiddenException('Chỉ Ban giám hiệu đặt hạn nhập điểm');
    }
    if (input.testDate && (input.testDate < day(a.semester.startDate) || input.testDate > day(a.semester.endDate))) {
      throw new BadRequestException(`Ngày kiểm tra phải nằm trong ${a.semester.name}`);
    }
    await this.prisma.assessment.update({
      where: { id: a.id },
      data: {
        testDate: input.testDate ? dateOf(input.testDate) : undefined,
        description: input.description === undefined ? undefined : input.description || null,
        entryDeadline: input.entryDeadline === undefined ? undefined : input.entryDeadline ? new Date(input.entryDeadline) : null,
      },
    });
    await this.record(actor, 'assessment.update', a.id, ip, { code: a.code, fields: Object.keys(input) });
    return this.getDto(a.id);
  }

  async remove(actor: AuthUser, id: string, ip?: string): Promise<void> {
    const a = await this.editableAssessment(actor, id);
    const [history, published] = await Promise.all([
      this.prisma.scoreHistory.count({ where: { assessmentId: a.id } }),
      this.prisma.assessmentClass.count({ where: { assessmentId: a.id, status: 'PUBLISHED' } }),
    ]);
    if (history > 0 || published > 0) {
      throw new ConflictException('Đợt thi đã có điểm hoặc đã công bố, không xoá được (lịch sử điểm phải được giữ)');
    }
    await this.prisma.assessment.delete({ where: { id: a.id } });
    await this.record(actor, 'assessment.delete', a.id, ip, { code: a.code });
  }

  // ───────────── Bảng điểm của một lớp trong đợt ─────────────

  async sheet(actor: AuthUser, assessmentId: string, classId: string): Promise<ScoreSheetDto> {
    return this.buildSheet(actor, await this.access(actor, assessmentId, classId));
  }

  async save(actor: AuthUser, assessmentId: string, classId: string, input: SaveScoresInput, ip?: string) {
    const ctx = await this.access(actor, assessmentId, classId);
    this.assertCanEdit(ctx);
    await this.limitWrites(actor);

    const students = await this.classStudents(ctx.ac.classId);
    const seen = new Set<string>();
    const entries: NormalizedEntry[] = input.entries.map((e) => {
      const student = students.get(e.studentId);
      if (!student) throw new BadRequestException('Có học sinh không thuộc lớp của đợt thi này');
      if (seen.has(e.studentId)) throw new BadRequestException(`Học sinh ${student.code} xuất hiện hai lần`);
      seen.add(e.studentId);
      const note = e.note?.trim() || null;
      if (e.status === 'ABSENT') {
        if (e.value !== null && String(e.value).trim() !== '') throw new BadRequestException(`${student.code}: học sinh vắng thì để trống điểm`);
        if (!note) throw new BadRequestException(`${student.code}: cần ghi lý do vắng (ốm, tai nạn…)`);
        return { studentId: BigInt(e.studentId), desired: { value: null, status: 'ABSENT', note } };
      }
      const parsed = parseScore(e.value);
      if (!parsed.ok) throw new BadRequestException(`${student.code}: ${parsed.error}`);
      return {
        studentId: BigInt(e.studentId),
        desired: parsed.value === null ? null : { value: parsed.value, status: 'GRADED', note },
      };
    });

    const result = await this.apply(actor, ctx, entries, 'GRID');
    await this.record(actor, 'score.save', ctx.ac.assessmentId, ip, {
      code: ctx.ac.assessment.code,
      class: ctx.ac.class.name,
      ...result,
    });
    return { ...result, sheet: await this.buildSheet(actor, ctx) };
  }

  async publish(actor: AuthUser, assessmentId: string, classId: string, ip?: string): Promise<ScoreSheetDto> {
    const ctx = await this.access(actor, assessmentId, classId);
    if (!ctx.inScope && !ctx.manager) throw new ForbiddenException(OUT_OF_SCOPE);
    await this.limitWrites(actor);
    if (ctx.ac.status !== 'PUBLISHED') {
      await this.prisma.assessmentClass.update({
        where: { id: ctx.ac.id },
        data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: BigInt(actor.id) },
      });
    }
    const sheet = await this.buildSheet(actor, await this.access(actor, assessmentId, classId));
    await this.record(actor, 'assessment.publish', ctx.ac.assessmentId, ip, {
      code: ctx.ac.assessment.code,
      class: ctx.ac.class.name,
      missing: sheet.counts.missing,
    });
    return sheet;
  }

  // Miễn kiểm tra: chỉ Ban giám hiệu đặt/bỏ (vắng vì lý do ngoài ý muốn thì giáo viên tự ghi trên lưới).
  async setExemption(actor: AuthUser, assessmentId: string, classId: string, studentId: string, input: ExemptionInput, ip?: string) {
    assertPermission(actor, 'assessment:manage');
    const ctx = await this.access(actor, assessmentId, classId);
    await this.limitWrites(actor);
    const students = await this.classStudents(ctx.ac.classId);
    if (!students.has(studentId)) throw new BadRequestException('Học sinh không thuộc lớp của đợt thi này');
    const sid = BigInt(studentId);
    const current = await this.prisma.score.findUnique({ where: { assessmentId_studentId: { assessmentId: ctx.ac.assessmentId, studentId: sid } } });
    if (input.exempt && !input.note?.trim()) throw new BadRequestException('Cần ghi lý do miễn');

    await this.prisma.$transaction(async (tx) => {
      if (input.exempt) {
        const data = { value: null, status: 'EXEMPT' as const, note: input.note!.trim(), enteredBy: BigInt(actor.id), classId: ctx.ac.classId };
        if (current) await tx.score.update({ where: { id: current.id }, data });
        else await tx.score.create({ data: { ...data, assessmentId: ctx.ac.assessmentId, studentId: sid } });
        await tx.scoreHistory.create({
          data: this.historyRow(actor, ctx.ac.assessmentId, sid, current ? 'UPDATE' : 'CREATE', current, { value: null, status: 'EXEMPT', note: data.note }, 'EXEMPT', data.note),
        });
      } else if (current?.status === 'EXEMPT') {
        await tx.score.delete({ where: { id: current.id } });
        await tx.scoreHistory.create({
          data: this.historyRow(actor, ctx.ac.assessmentId, sid, 'DELETE', current, null, 'EXEMPT', input.note?.trim() || 'Bỏ miễn'),
        });
      }
    });
    await this.audit.record({
      userId: actor.id,
      channel: 'web',
      action: 'score.exempt',
      targetType: 'user',
      targetId: studentId,
      params: { code: ctx.ac.assessment.code, class: ctx.ac.class.name, exempt: input.exempt },
      ok: true,
      ip,
    });
    return this.buildSheet(actor, ctx);
  }

  // ───────────── Dùng chung với nhập Excel ─────────────

  async access(actor: AuthUser, assessmentId: string, classId: string): Promise<SheetAccess> {
    this.assertAnyScorePermission(actor);
    const aid = parseId(assessmentId);
    const cid = parseId(classId);
    const reader = can(actor, 'score:read:all');
    const manager = can(actor, 'assessment:manage');
    const ac = await this.prisma.assessmentClass.findUnique({
      where: { assessmentId_classId: { assessmentId: aid, classId: cid } },
      include: AC_INCLUDE,
    });
    // Người không được xem mọi điểm không phân biệt được "không tồn tại" với "không phải lớp mình".
    if (!ac) {
      if (reader || manager) throw new NotFoundException('Không tìm thấy lớp của đợt thi');
      throw new ForbiddenException(OUT_OF_SCOPE);
    }
    const inScope =
      can(actor, 'score:enter') &&
      assignmentCovers(await this.teacherScopes(actor, ac.assessment.semester.schoolYearId), {
        teacherId: actor.id,
        classId: ac.classId.toString(),
        subjectId: ac.assessment.subjectId.toString(),
        schoolYearId: ac.assessment.semester.schoolYearId.toString(),
        semesterId: ac.assessment.semesterId.toString(),
      });
    if (!inScope && !reader && !manager) throw new ForbiddenException(OUT_OF_SCOPE);
    const deadline = ac.assessment.entryDeadline;
    return { ac, inScope, manager, deadlinePassed: !!deadline && deadline.getTime() < Date.now() };
  }

  assertCanEdit(ctx: SheetAccess): void {
    if (!ctx.inScope) throw new ForbiddenException('Chỉ giáo viên được phân công lớp–môn này mới nhập điểm');
    if (ctx.deadlinePassed) {
      throw new ConflictException('Đã quá hạn nhập điểm của đợt thi; điều chỉnh sau hạn cần Ban giám hiệu xử lý');
    }
  }

  async limitWrites(actor: AuthUser): Promise<void> {
    const { count, retryAfterSec } = await this.limits.increment('score-write', actor.id, 60);
    if (count > SCORE_WRITES_PER_MIN) {
      throw new HttpException(`Bạn lưu điểm quá nhiều lần, vui lòng thử lại sau ${retryAfterSec} giây`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // Học sinh đang thuộc lớp (theo class_enrollments), khoá theo id dạng chuỗi.
  async classStudents(classId: bigint): Promise<Map<string, { id: bigint; code: string; fullName: string }>> {
    const rows = await this.prisma.classEnrollment.findMany({
      where: { classId },
      include: { student: { select: { id: true, fullName: true, studentProfile: { select: { studentCode: true } } } } },
    });
    return new Map(
      rows.map((r) => [
        r.studentId.toString(),
        { id: r.studentId, code: r.student.studentProfile?.studentCode ?? '', fullName: r.student.fullName },
      ]),
    );
  }

  // Áp các thay đổi trong MỘT transaction; mỗi ô thay đổi sinh một dòng score_history. Điểm do BGH miễn không sửa được.
  async apply(actor: AuthUser, ctx: SheetAccess, entries: NormalizedEntry[], source: WriteSource): Promise<ApplyResult> {
    const result: ApplyResult = { created: 0, updated: 0, deleted: 0, unchanged: 0 };
    const assessmentId = ctx.ac.assessmentId;
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = new Map(
          (await tx.score.findMany({ where: { assessmentId, studentId: { in: entries.map((e) => e.studentId) } } })).map((s) => [
            s.studentId.toString(),
            s,
          ]),
        );
        for (const { studentId, desired } of entries) {
          const current = existing.get(studentId.toString()) ?? null;
          const stored = current ? { value: num(current.value), status: current.status, note: current.note } : null;
          const change = diffScore(stored, desired);
          if (!change) {
            result.unchanged++;
            continue;
          }
          if (current?.status === 'EXEMPT') {
            throw new ConflictException('Có học sinh được Ban giám hiệu miễn, không sửa được điểm của học sinh đó');
          }
          if (change === 'DELETE') {
            await tx.score.delete({ where: { id: current!.id } });
            result.deleted++;
          } else {
            const data = { value: desired!.value, status: desired!.status, note: desired!.note, enteredBy: BigInt(actor.id), classId: ctx.ac.classId };
            if (change === 'CREATE') {
              await tx.score.create({ data: { ...data, assessmentId, studentId } });
              result.created++;
            } else {
              await tx.score.update({ where: { id: current!.id }, data });
              result.updated++;
            }
          }
          await tx.scoreHistory.create({ data: this.historyRow(actor, assessmentId, studentId, change, current, desired, source, null) });
        }
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Điểm vừa được lưu ở nơi khác, hãy tải lại bảng điểm');
      throw err;
    }
    return result;
  }

  async buildSheet(actor: AuthUser, ctx: SheetAccess): Promise<ScoreSheetDto> {
    const { ac } = ctx;
    const [students, scores, counts] = await Promise.all([
      this.classStudents(ac.classId),
      this.prisma.score.findMany({ where: { assessmentId: ac.assessmentId } }),
      this.classCounts([{ assessmentId: ac.assessmentId, classId: ac.classId }]),
    ]);
    const byStudent = new Map(scores.map((s) => [s.studentId.toString(), s]));
    const rows: ScoreRowDto[] = [...students.values()]
      .map((st) => {
        const s = byStudent.get(st.id.toString());
        return {
          studentId: st.id.toString(),
          studentCode: st.code,
          fullName: st.fullName,
          value: s?.value === null || s?.value === undefined ? null : String(Number(s.value)),
          status: (s?.status ?? null) as ScoreStatus | null,
          note: s?.note ?? null,
          updatedAt: s?.updatedAt.toISOString() ?? null,
        };
      })
      .sort((a, b) => byVietnameseName(a.fullName, b.fullName));
    const count = (status: ScoreStatus) => rows.filter((r) => r.status === status).length;
    const assessment = this.toDto(ac.assessment, [this.classDto(ac, counts)]);
    return {
      assessment,
      classId: ac.classId.toString(),
      className: ac.class.name,
      status: ac.status,
      publishedAt: ac.publishedAt?.toISOString() ?? null,
      deadlinePassed: ctx.deadlinePassed,
      canEdit: ctx.inScope && !ctx.deadlinePassed,
      canExempt: can(actor, 'assessment:manage'),
      canPublish: ctx.inScope || ctx.manager,
      rows,
      counts: {
        students: rows.length,
        graded: count('GRADED'),
        absent: count('ABSENT'),
        exempt: count('EXEMPT'),
        missing: rows.filter((r) => r.status === null).length,
      },
    };
  }

  // ───────────── Nội bộ ─────────────

  private assertAnyScorePermission(actor: AuthUser): void {
    if (!can(actor, 'score:enter') && !can(actor, 'score:read:all') && !can(actor, 'assessment:manage')) {
      assertPermission(actor, 'score:enter');
    }
  }

  private async teacherScopes(actor: AuthUser, schoolYearId: bigint): Promise<AssignmentScope[]> {
    const rows = await this.prisma.teachingAssignment.findMany({ where: { teacherId: BigInt(actor.id), schoolYearId } });
    return rows.map((r) => ({
      teacherId: r.teacherId.toString(),
      classId: r.classId.toString(),
      subjectId: r.subjectId.toString(),
      schoolYearId: r.schoolYearId.toString(),
      semesterId: r.semesterId?.toString() ?? null,
    }));
  }

  private currentSemester<T extends { startDate: Date; endDate: Date }>(semesters: T[]): T | null {
    const today = vnToday();
    return (
      semesters.find((s) => day(s.startDate) <= today && today <= day(s.endDate)) ??
      semesters.filter((s) => day(s.startDate) <= today).at(-1) ??
      semesters[0] ??
      null
    );
  }

  private async semesterOrDefault(semesterId?: string) {
    if (semesterId) {
      const s = await this.prisma.semester.findUnique({ where: { id: parseId(semesterId) } });
      if (!s) throw new NotFoundException('Học kỳ không tồn tại');
      return s;
    }
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, include: { semesters: { orderBy: { number: 'asc' } } } });
    return year ? this.currentSemester(year.semesters) : null;
  }

  // Đợt mà người này được sửa/xoá: BGH mọi đợt; giáo viên chỉ đợt thường xuyên do chính mình tạo, còn trong phạm vi phân công.
  private async editableAssessment(actor: AuthUser, id: string): Promise<AssessmentRow> {
    this.assertAnyScorePermission(actor);
    const a = await this.prisma.assessment.findUnique({ where: { id: parseId(id) }, include: { ...ASSESSMENT_INCLUDE, classes: true } });
    const manager = can(actor, 'assessment:manage');
    if (manager) {
      if (!a) throw new NotFoundException('Đợt thi không tồn tại');
      return a;
    }
    const own = !!a && a.type === 'THUONG_XUYEN' && a.createdBy.toString() === actor.id && can(actor, 'score:enter');
    if (!own) throw new ForbiddenException('Bạn chỉ sửa/xoá được đợt kiểm tra thường xuyên do mình tạo');
    const scopes = await this.teacherScopes(actor, a.semester.schoolYearId);
    const covered = a.classes.every((c) =>
      assignmentCovers(scopes, {
        teacherId: actor.id,
        classId: c.classId.toString(),
        subjectId: a.subjectId.toString(),
        schoolYearId: a.semester.schoolYearId.toString(),
        semesterId: a.semesterId.toString(),
      }),
    );
    if (!covered) throw new ForbiddenException(OUT_OF_SCOPE);
    return a;
  }

  private async getDto(id: bigint): Promise<AssessmentDto> {
    const a = await this.prisma.assessment.findUniqueOrThrow({
      where: { id },
      include: { ...ASSESSMENT_INCLUDE, classes: { include: { class: true } } },
    });
    const counts = await this.classCounts(a.classes.map((c) => ({ assessmentId: a.id, classId: c.classId })));
    return this.toDto(a, a.classes.map((c) => this.classDto(c, counts)));
  }

  // Sĩ số lớp và số học sinh đã có điểm/ghi chú trong đợt.
  private async classCounts(pairs: { assessmentId: bigint; classId: bigint }[]) {
    const classIds = [...new Set(pairs.map((p) => p.classId))];
    const assessmentIds = [...new Set(pairs.map((p) => p.assessmentId))];
    if (classIds.length === 0) return { students: new Map<string, number>(), entered: new Map<string, number>() };
    const [enrollments, scores] = await Promise.all([
      this.prisma.classEnrollment.groupBy({ by: ['classId'], where: { classId: { in: classIds } }, _count: { _all: true } }),
      this.prisma.score.groupBy({
        by: ['assessmentId', 'classId'],
        where: { assessmentId: { in: assessmentIds }, classId: { in: classIds } },
        _count: { _all: true },
      }),
    ]);
    return {
      students: new Map(enrollments.map((e) => [e.classId.toString(), e._count._all])),
      entered: new Map(scores.map((s) => [`${s.assessmentId}:${s.classId}`, s._count._all])),
    };
  }

  private classDto(
    c: { assessmentId: bigint; classId: bigint; status: 'DRAFT' | 'PUBLISHED'; publishedAt: Date | null; class: { name: string } },
    counts: Awaited<ReturnType<ScoresService['classCounts']>>,
  ): AssessmentClassDto {
    return {
      classId: c.classId.toString(),
      className: c.class.name,
      status: c.status,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      students: counts.students.get(c.classId.toString()) ?? 0,
      entered: counts.entered.get(`${c.assessmentId}:${c.classId}`) ?? 0,
    };
  }

  private toDto(a: AssessmentRow, classes: AssessmentClassDto[]): AssessmentDto {
    return {
      id: a.id.toString(),
      code: a.code,
      type: a.type,
      semesterId: a.semesterId.toString(),
      semesterName: a.semester.name,
      schoolYearName: a.semester.schoolYear.name,
      subjectId: a.subjectId.toString(),
      subjectCode: a.subject.code,
      subjectName: a.subject.name,
      gradeLevel: a.gradeLevel,
      testDate: day(a.testDate),
      description: a.description,
      entryDeadline: a.entryDeadline?.toISOString() ?? null,
      createdById: a.createdBy.toString(),
      createdByName: a.creator.fullName,
      createdAt: a.createdAt.toISOString(),
      classes: classes.sort((x, y) => x.className.localeCompare(y.className, 'vi')),
    };
  }

  private historyRow(
    actor: AuthUser,
    assessmentId: bigint,
    studentId: bigint,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    before: { value: Prisma.Decimal | null; status: ScoreStatus } | null,
    after: { value: number | null; status: ScoreStatus; note: string | null } | null,
    source: WriteSource,
    reason: string | null,
  ): Prisma.ScoreHistoryUncheckedCreateInput {
    return {
      assessmentId,
      studentId,
      action,
      oldValue: before?.value ?? null,
      newValue: after?.value ?? null,
      oldStatus: before?.status ?? null,
      newStatus: after?.status ?? null,
      note: after?.note ?? null,
      reason,
      source,
      changedBy: BigInt(actor.id),
    };
  }

  private record(actor: AuthUser, action: string, assessmentId: bigint, ip: string | undefined, params: Record<string, unknown>) {
    return this.audit.record({
      userId: actor.id,
      channel: 'web',
      action,
      targetType: 'assessment',
      targetId: assessmentId.toString(),
      params,
      ok: true,
      ip,
    });
  }
}
