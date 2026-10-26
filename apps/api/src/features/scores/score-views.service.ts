import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  bucketOf,
  formatScore,
  requiredRegularCount,
  SCORE_BUCKETS,
  SCORE_FORMULA_NOTE,
  SCORE_STATUS_NAMES,
  subjectAverage,
  yearAverage,
  type AssessmentType,
  type ClassSummaryDto,
  type GradebookColumnDto,
  type GradebookDto,
  type ScoreAverageDto,
  type ScoreAverageEntry,
  type ScoreStatGroupDto,
  type ScoreStatsDto,
  type ScoreStatus,
  type ScoreView,
  type StudentReportDto,
  type StudentSubjectReportDto,
} from '@pvh/shared';
import ExcelJS from 'exceljs';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { isHomeroomOf } from '../academic/homeroom.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { safeCell } from '../roster/excel.js';
import { vnToday } from '../timetable/timetable-dates.js';
import type { ClassSummaryQuery, GradebookQuery, StatsQuery } from './dto/score-views.dto.js';
import { assignmentCovers } from './score-rules.js';
import { effectiveDeadline, isLocked, ScoreCalendarService } from './score-calendar.service.js';
import { byVietnameseName, OUT_OF_SCOPE, ScoresService } from './scores.service.js';

// Số lần xem bảng điểm/thống kê và xuất Excel tối đa mỗi phút cho một tài khoản.
export const SCORE_READS_PER_MIN = 240;
export const SCORE_EXPORTS_PER_MIN = 20;

const TYPE_ORDER: Record<AssessmentType, number> = { THUONG_XUYEN: 0, GIUA_KY: 1, CUOI_KY: 2 };
const day = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: { toString(): string } | null) => (v === null ? null : Number(v));
const pairKey = (a: bigint | string, b: bigint | string) => `${a}:${b}`;

// Một điểm đã lưu cùng thông tin đợt, dùng để tính ĐTB.
interface ScoreFact {
  assessmentId: bigint;
  code: string;
  type: AssessmentType;
  testDate: Date;
  subjectId: bigint;
  semesterId: bigint;
  studentId: bigint;
  classId: bigint;
  value: number | null;
  status: ScoreStatus;
  note: string | null;
  published: boolean;
}

interface Access {
  view: ScoreView;
  publishedOnly: boolean;
}

// Xem điểm theo vai trò (bước 19). Học sinh: chỉ điểm của mình, chỉ điểm đã công bố. Giáo viên bộ môn: lớp–môn mình được phân
// công (cả nháp). Giáo viên chủ nhiệm: mọi môn của lớp chủ nhiệm, chỉ điểm đã công bố. BGH (score:read:all): toàn trường.
// ADMIN không có quyền điểm nào nên luôn 403. Thống kê chỉ dùng điểm đã công bố. Không trang nào được cache công khai.
@Injectable()
export class ScoreViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly limits: RateLimitService,
    private readonly scores: ScoresService,
    private readonly calendar: ScoreCalendarService,
  ) {}

  // ───────────── Sổ điểm một lớp–môn–học kỳ ─────────────

  async gradebook(actor: AuthUser, q: GradebookQuery): Promise<GradebookDto> {
    this.assertAnyScoreRole(actor);
    const [cls, subject, semester] = await Promise.all([
      this.prisma.schoolClass.findUnique({ where: { id: parseId(q.classId) } }),
      this.prisma.subject.findUnique({ where: { id: parseId(q.subjectId) } }),
      this.prisma.semester.findUnique({ where: { id: parseId(q.semesterId) }, include: { schoolYear: true } }),
    ]);
    const reader = can(actor, 'score:read:all');
    if (!cls || !subject || !semester || semester.schoolYearId !== cls.schoolYearId) {
      if (reader) throw new NotFoundException('Không tìm thấy lớp, môn hoặc học kỳ');
      throw new ForbiddenException(OUT_OF_SCOPE);
    }
    const access = await this.gradebookAccess(actor, cls.id, subject.id, semester);
    await this.limitReads(actor);

    const [acs, students, formula, gates, periods] = await Promise.all([
      this.prisma.assessmentClass.findMany({
        where: {
          classId: cls.id,
          assessment: { subjectId: subject.id, semesterId: semester.id },
          status: access.publishedOnly ? 'PUBLISHED' : undefined,
        },
        include: { assessment: true },
      }),
      this.scores.classStudents(cls.id),
      this.calendar.formula(),
      this.calendar.gates([semester.id]),
      this.periodsMap([cls.id]),
    ]);
    const gate = gates.get(semester.id.toString());
    acs.sort(
      (x, y) =>
        TYPE_ORDER[x.assessment.type] - TYPE_ORDER[y.assessment.type] ||
        x.assessment.testDate.getTime() - y.assessment.testDate.getTime() ||
        x.assessment.code.localeCompare(y.assessment.code),
    );
    const columns: GradebookColumnDto[] = acs.map((ac) => ({
      assessmentId: ac.assessmentId.toString(),
      code: ac.assessment.code,
      type: ac.assessment.type,
      testDate: day(ac.assessment.testDate),
      status: ac.status,
      deadline: effectiveDeadline(ac.assessment, gate)?.toISOString() ?? null,
      locked: isLocked(ac.assessment, gate),
    }));
    const assessmentIds = acs.map((ac) => ac.assessmentId);
    const studentIds = [...students.values()].map((s) => s.id);
    const [scores, pending] = await Promise.all([
      this.prisma.score.findMany({ where: { assessmentId: { in: assessmentIds }, studentId: { in: studentIds } } }),
      access.view === 'HOMEROOM'
        ? []
        : this.prisma.scoreAdjustment.findMany({
            where: { status: 'PENDING', assessmentId: { in: assessmentIds }, studentId: { in: studentIds } },
            select: { id: true, assessmentId: true, studentId: true },
          }),
    ]);
    const scoreOf = new Map(scores.map((s) => [pairKey(s.assessmentId, s.studentId), s]));
    const pendingOf = new Map(pending.map((p) => [pairKey(p.assessmentId, p.studentId), p.id.toString()]));
    const periodsPerWeek = periods.get(pairKey(cls.id, subject.id)) ?? null;

    const rows = [...students.values()]
      .map((st) => {
        const entries: ScoreAverageEntry[] = [];
        const cells = acs.map((ac) => {
          const s = scoreOf.get(pairKey(ac.assessmentId, st.id));
          if (s) entries.push({ type: ac.assessment.type, value: num(s.value), status: s.status });
          return {
            value: s?.value == null ? null : String(Number(s.value)),
            status: s?.status ?? null,
            note: s?.note ?? null,
            pendingAdjustmentId: pendingOf.get(pairKey(ac.assessmentId, st.id)) ?? null,
          };
        });
        return {
          studentId: st.id.toString(),
          studentCode: st.code,
          fullName: st.fullName,
          cells,
          average: subjectAverage(entries, periodsPerWeek, formula),
        };
      })
      .sort((a, b) => byVietnameseName(a.fullName, b.fullName));

    return {
      classId: cls.id.toString(),
      className: cls.name,
      subjectId: subject.id.toString(),
      subjectName: subject.name,
      semesterId: semester.id.toString(),
      semesterName: semester.name,
      schoolYearName: semester.schoolYear.name,
      view: access.view,
      publishedOnly: access.publishedOnly,
      periodsPerWeek,
      requiredRegular: requiredRegularCount(formula, periodsPerWeek),
      semesterLocked: !!gate?.locked,
      canRequestAdjustment: access.view === 'TEACHER' && columns.some((c) => c.locked),
      columns,
      rows,
      formulaNote: SCORE_FORMULA_NOTE,
    };
  }

  // ───────────── Bảng tổng hợp mọi môn của một lớp ─────────────

  async classSummary(actor: AuthUser, classId: string, q: ClassSummaryQuery): Promise<ClassSummaryDto> {
    this.assertAnyScoreRole(actor);
    const cls = await this.prisma.schoolClass.findUnique({ where: { id: parseId(classId) }, include: { schoolYear: { include: { semesters: { orderBy: { number: 'asc' } } } } } });
    const reader = can(actor, 'score:read:all');
    if (!cls) {
      if (reader) throw new NotFoundException('Lớp không tồn tại');
      throw new ForbiddenException('Bạn chỉ xem được bảng điểm lớp mình chủ nhiệm');
    }
    let view: ScoreView;
    if (reader) view = 'PRINCIPAL';
    else if (can(actor, 'score:enter') && (await isHomeroomOf(this.prisma, actor, cls.id))) view = 'HOMEROOM';
    else throw new ForbiddenException('Bạn chỉ xem được bảng điểm lớp mình chủ nhiệm');

    const semesters = cls.schoolYear.semesters;
    const semester = q.semesterId ? semesters.find((s) => s.id.toString() === q.semesterId) : undefined;
    if (q.semesterId && !semester) throw new BadRequestException('Học kỳ không thuộc năm học của lớp');
    await this.limitReads(actor);

    const [students, formula, periods, assignments, facts] = await Promise.all([
      this.scores.classStudents(cls.id),
      this.calendar.formula(),
      this.periodsMap([cls.id]),
      this.prisma.teachingAssignment.findMany({ where: { classId: cls.id }, include: { subject: true } }),
      // Bảng tổng hợp là kết quả chính thức: chỉ điểm đã công bố, kể cả với BGH.
      this.facts({ classIds: [cls.id], semesterIds: semesters.map((s) => s.id), publishedOnly: true }),
    ]);
    const subjects = await this.scoreSubjects(
      assignments.filter((a) => a.subject.gradingType === 'SCORE').map((a) => a.subjectId),
      facts.map((f) => f.subjectId),
    );
    const bySemester = (studentId: bigint, subjectId: bigint, semesterId: bigint): ScoreAverageDto | null => {
      const entries = facts.filter((f) => f.studentId === studentId && f.subjectId === subjectId && f.semesterId === semesterId);
      if (entries.length === 0) return null;
      return subjectAverage(entries, periods.get(pairKey(cls.id, subjectId)) ?? null, formula);
    };
    const [hk1, hk2] = semesters;

    const rows = [...students.values()]
      .map((st) => ({
        studentId: st.id.toString(),
        studentCode: st.code,
        fullName: st.fullName,
        averages: subjects.map((sub) => {
          if (semester) return bySemester(st.id, sub.id, semester.id);
          const a1 = hk1 ? bySemester(st.id, sub.id, hk1.id) : null;
          const a2 = hk2 ? bySemester(st.id, sub.id, hk2.id) : null;
          return a1 || a2 ? yearAverage(a1, a2, formula) : null;
        }),
      }))
      .sort((a, b) => byVietnameseName(a.fullName, b.fullName));

    return {
      classId: cls.id.toString(),
      className: cls.name,
      schoolYearName: cls.schoolYear.name,
      semesterId: semester?.id.toString() ?? null,
      periodName: semester ? semester.name : 'Cả năm',
      view,
      publishedOnly: true,
      subjects: subjects.map((s) => ({ id: s.id.toString(), code: s.code, name: s.name })),
      rows,
      formulaNote: SCORE_FORMULA_NOTE,
    };
  }

  // ───────────── Kết quả học tập của một học sinh ─────────────

  // Học sinh xem điểm của chính mình: chỉ điểm đã công bố, không thấy điểm bạn khác, không xếp hạng.
  async myReport(actor: AuthUser): Promise<StudentReportDto> {
    if (!actor.roles.includes('STUDENT')) throw new ForbiddenException('Chỉ học sinh xem được trang điểm của em');
    await this.limitReads(actor);
    return this.report(BigInt(actor.id), true);
  }

  // BGH: mọi điểm (cả nháp, có đánh dấu). Giáo viên chủ nhiệm của lớp hiện tại của học sinh: chỉ điểm đã công bố.
  async studentReport(actor: AuthUser, studentId: string): Promise<StudentReportDto> {
    this.assertAnyScoreRole(actor);
    const sid = parseId(studentId);
    const reader = can(actor, 'score:read:all');
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true } });
    const enrollment = year ? await this.prisma.classEnrollment.findUnique({ where: { studentId_schoolYearId: { studentId: sid, schoolYearId: year.id } } }) : null;
    if (!reader) {
      const homeroom = !!enrollment && can(actor, 'score:enter') && (await isHomeroomOf(this.prisma, actor, enrollment.classId));
      if (!homeroom) throw new ForbiddenException('Bạn chỉ xem được điểm của học sinh lớp mình chủ nhiệm');
    } else if (!(await this.prisma.studentProfile.findUnique({ where: { userId: sid } }))) {
      throw new NotFoundException('Học sinh không tồn tại');
    }
    await this.limitReads(actor);
    return this.report(sid, !reader);
  }

  // ───────────── Thống kê toàn trường (BGH) ─────────────

  async stats(actor: AuthUser, q: StatsQuery): Promise<ScoreStatsDto> {
    assertPermission(actor, 'score:read:all');
    const semester = q.semesterId
      ? await this.prisma.semester.findUnique({ where: { id: parseId(q.semesterId) }, include: { schoolYear: true } })
      : await this.currentSemester();
    if (!semester) throw new NotFoundException('Không có học kỳ để thống kê');
    await this.limitReads(actor);

    const classes = await this.prisma.schoolClass.findMany({
      where: { schoolYearId: semester.schoolYearId, grade: q.gradeLevel ? { level: q.gradeLevel } : undefined },
      include: { grade: true },
    });
    const classIds = classes.map((c) => c.id);
    const [formula, periods, facts] = await Promise.all([
      this.calendar.formula(),
      this.periodsMap(classIds),
      this.facts({ classIds, semesterIds: [semester.id], subjectIds: q.subjectId ? [parseId(q.subjectId)] : undefined, publishedOnly: true }),
    ]);
    const subjects = new Map(
      (await this.prisma.subject.findMany({ where: { id: { in: [...new Set(facts.map((f) => f.subjectId))] } } })).map((s) => [s.id.toString(), s]),
    );
    const classOf = new Map(classes.map((c) => [c.id.toString(), c]));

    // ĐTB môn học kỳ của từng học sinh (theo lớp của điểm).
    const perStudent = new Map<string, { classId: bigint; subjectId: bigint; entries: ScoreAverageEntry[] }>();
    for (const f of facts) {
      const key = `${f.classId}:${f.subjectId}:${f.studentId}`;
      const item = perStudent.get(key) ?? { classId: f.classId, subjectId: f.subjectId, entries: [] };
      item.entries.push(f);
      perStudent.set(key, item);
    }
    const groups = new Map<string, { base: Omit<ScoreStatGroupDto, 'averaged' | 'provisional' | 'mean' | 'below5' | 'buckets'>; values: ScoreAverageDto[] }>();
    const add = (base: Omit<ScoreStatGroupDto, 'averaged' | 'provisional' | 'mean' | 'below5' | 'buckets'>, avg: ScoreAverageDto) => {
      const g = groups.get(base.key) ?? { base, values: [] };
      g.values.push(avg);
      groups.set(base.key, g);
    };
    for (const item of perStudent.values()) {
      const avg = subjectAverage(item.entries, periods.get(pairKey(item.classId, item.subjectId)) ?? null, formula);
      if (avg.value === null) continue;
      const cls = classOf.get(item.classId.toString());
      const sub = subjects.get(item.subjectId.toString());
      if (!cls || !sub) continue;
      const level = cls.grade.level;
      add({ key: `cs:${cls.id}:${sub.id}`, label: `${cls.name} – ${sub.name}`, gradeLevel: level, classId: cls.id.toString(), subjectId: sub.id.toString() }, avg);
      add({ key: `s:${level}:${sub.id}`, label: `${sub.name} – khối ${level}`, gradeLevel: level, classId: null, subjectId: sub.id.toString() }, avg);
      add({ key: `c:${cls.id}`, label: cls.name, gradeLevel: level, classId: cls.id.toString(), subjectId: null }, avg);
      add({ key: `g:${level}`, label: `Khối ${level}`, gradeLevel: level, classId: null, subjectId: null }, avg);
    }
    const summarize = (prefix: string) =>
      [...groups.values()]
        .filter((g) => g.base.key.startsWith(prefix))
        .map(({ base, values }) => {
          const buckets = SCORE_BUCKETS.map(() => 0);
          for (const v of values) buckets[bucketOf(v.value!)]!++;
          const sum = values.reduce((s, v) => s + v.value!, 0);
          return {
            ...base,
            averaged: values.length,
            provisional: values.filter((v) => v.provisional).length,
            mean: values.length ? Math.round((sum / values.length) * 100) / 100 : null,
            below5: values.filter((v) => v.value! < 5).length,
            buckets,
          };
        })
        .sort((a, b) => (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0) || a.label.localeCompare(b.label, 'vi'));

    return {
      semesterId: semester.id.toString(),
      semesterName: semester.name,
      schoolYearName: semester.schoolYear.name,
      byClassSubject: summarize('cs:'),
      bySubject: summarize('s:'),
      byClass: summarize('c:'),
      byGrade: summarize('g:'),
    };
  }

  // ───────────── Xuất Excel (ghi audit, không ghi giá trị điểm) ─────────────

  async exportGradebook(actor: AuthUser, q: GradebookQuery, ip?: string): Promise<{ file: Buffer; filename: string }> {
    await this.limitExports(actor);
    const g = await this.gradebook(actor, q);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Sổ điểm');
    sheet.addRow([safeCell(`Sổ điểm ${g.subjectName} – lớp ${g.className} – ${g.semesterName} – ${g.schoolYearName}`)]);
    if (g.publishedOnly) sheet.addRow(['Chỉ gồm điểm đã công bố']);
    sheet.addRow(['STT', 'Mã HS', 'Họ và tên', ...g.columns.map((c) => safeCell(`${c.code}${c.status === 'DRAFT' ? ' (nháp)' : ''}`)), 'ĐTB môn', 'Ghi chú']);
    g.rows.forEach((r, i) =>
      sheet.addRow([
        i + 1,
        safeCell(r.studentCode),
        safeCell(r.fullName),
        ...r.cells.map((c) => (c.status === 'GRADED' ? Number(c.value) : c.status ? SCORE_STATUS_NAMES[c.status] : '')),
        r.average.value ?? '',
        safeCell(r.average.provisional ? `Tạm tính: ${r.average.missing.join('; ')}` : ''),
      ]),
    );
    sheet.addRow([]);
    sheet.addRow([safeCell(g.formulaNote)]);
    await this.recordExport(actor, 'gradebook', ip, { class: g.className, subject: g.subjectName, semester: g.semesterName, rows: g.rows.length });
    return { file: Buffer.from(await wb.xlsx.writeBuffer()), filename: `so-diem-${g.classId}-${g.subjectId}-${g.semesterId}.xlsx` };
  }

  async exportClassSummary(actor: AuthUser, classId: string, q: ClassSummaryQuery, ip?: string): Promise<{ file: Buffer; filename: string }> {
    await this.limitExports(actor);
    const s = await this.classSummary(actor, classId, q);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Bảng điểm lớp');
    sheet.addRow([safeCell(`Bảng điểm trung bình lớp ${s.className} – ${s.periodName} – ${s.schoolYearName} (điểm đã công bố)`)]);
    sheet.addRow(['STT', 'Mã HS', 'Họ và tên', ...s.subjects.map((sub) => safeCell(sub.name))]);
    s.rows.forEach((r, i) =>
      sheet.addRow([
        i + 1,
        safeCell(r.studentCode),
        safeCell(r.fullName),
        ...r.averages.map((a) => (a?.value == null ? '' : a.provisional ? `${formatScore(a.value)} (tạm tính)` : a.value)),
      ]),
    );
    sheet.addRow([]);
    sheet.addRow([safeCell(s.formulaNote)]);
    await this.recordExport(actor, 'class_summary', ip, { class: s.className, period: s.periodName, rows: s.rows.length });
    return { file: Buffer.from(await wb.xlsx.writeBuffer()), filename: `bang-diem-lop-${s.classId}${s.semesterId ? `-${s.semesterId}` : '-ca-nam'}.xlsx` };
  }

  // ───────────── Nội bộ ─────────────

  private async report(studentId: bigint, publishedOnly: boolean): Promise<StudentReportDto> {
    const user = await this.prisma.user.findUnique({ where: { id: studentId }, include: { studentProfile: true } });
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, include: { semesters: { orderBy: { number: 'asc' } } } });
    const base = {
      studentId: studentId.toString(),
      studentCode: user?.studentProfile?.studentCode ?? '',
      fullName: user?.fullName ?? '',
      publishedOnly,
      formulaNote: SCORE_FORMULA_NOTE,
    };
    if (!year) return { ...base, className: null, schoolYearName: null, semesters: [], year: [] };

    const enrollment = await this.prisma.classEnrollment.findUnique({
      where: { studentId_schoolYearId: { studentId, schoolYearId: year.id } },
      include: { class: true },
    });
    const classId = enrollment?.classId ?? null;
    const [formula, periods, facts, assigned] = await Promise.all([
      this.calendar.formula(),
      classId ? this.periodsMap([classId]) : new Map<string, number>(),
      this.facts({ studentIds: [studentId], semesterIds: year.semesters.map((s) => s.id), publishedOnly }),
      classId ? this.prisma.teachingAssignment.findMany({ where: { classId }, select: { subjectId: true } }) : [],
    ]);
    const subjectIds = [...new Set([...assigned.map((a) => a.subjectId), ...facts.map((f) => f.subjectId)].map(String))].map((s) => BigInt(s));
    const subjects = (await this.prisma.subject.findMany({ where: { id: { in: subjectIds } } })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    const semesterAverages = new Map<string, ScoreAverageDto>();
    const semesters = year.semesters.map((sem) => ({
      semesterId: sem.id.toString(),
      semesterName: sem.name,
      subjects: subjects.map((sub): StudentSubjectReportDto => {
        const entries = facts
          .filter((f) => f.semesterId === sem.id && f.subjectId === sub.id)
          .sort((x, y) => TYPE_ORDER[x.type] - TYPE_ORDER[y.type] || x.testDate.getTime() - y.testDate.getTime());
        // ĐTB tính theo số tiết của lớp mà học sinh có điểm (lớp hiện tại nếu chưa có điểm).
        const periodsPerWeek = periods.get(pairKey(entries[0]?.classId ?? classId ?? 0n, sub.id)) ?? null;
        const average = sub.gradingType === 'SCORE' && entries.length > 0 ? subjectAverage(entries, periodsPerWeek, formula) : null;
        if (average) semesterAverages.set(pairKey(sem.id, sub.id), average);
        return {
          subjectId: sub.id.toString(),
          subjectCode: sub.code,
          subjectName: sub.name,
          gradingType: sub.gradingType,
          entries: entries.map((f) => ({
            assessmentId: f.assessmentId.toString(),
            code: f.code,
            type: f.type,
            testDate: day(f.testDate),
            value: f.value === null ? null : String(f.value),
            status: f.status,
            note: f.note,
            published: f.published,
          })),
          average,
        };
      }),
    }));
    const [hk1, hk2] = year.semesters;
    const yearRows = subjects
      .filter((sub) => sub.gradingType === 'SCORE')
      .map((sub) => {
        const a1 = hk1 ? (semesterAverages.get(pairKey(hk1.id, sub.id)) ?? null) : null;
        const a2 = hk2 ? (semesterAverages.get(pairKey(hk2.id, sub.id)) ?? null) : null;
        return { subjectId: sub.id.toString(), subjectName: sub.name, average: yearAverage(a1, a2, formula), has: !!(a1 || a2) };
      })
      .filter((r) => r.has)
      .map(({ has: _has, ...r }) => r);

    return { ...base, className: enrollment?.class.name ?? null, schoolYearName: year.name, semesters, year: yearRows };
  }

  // Ai được xem sổ điểm lớp–môn–học kỳ và xem ở chế độ nào.
  private async gradebookAccess(
    actor: AuthUser,
    classId: bigint,
    subjectId: bigint,
    semester: { id: bigint; schoolYearId: bigint },
  ): Promise<Access> {
    if (can(actor, 'score:enter')) {
      const scopes = await this.scores.teacherScopes(actor, semester.schoolYearId);
      const covered = assignmentCovers(scopes, {
        teacherId: actor.id,
        classId: classId.toString(),
        subjectId: subjectId.toString(),
        schoolYearId: semester.schoolYearId.toString(),
        semesterId: semester.id.toString(),
      });
      if (covered) return { view: 'TEACHER', publishedOnly: false };
    }
    if (can(actor, 'score:read:all')) return { view: 'PRINCIPAL', publishedOnly: false };
    if (can(actor, 'score:enter') && (await isHomeroomOf(this.prisma, actor, classId))) return { view: 'HOMEROOM', publishedOnly: true };
    throw new ForbiddenException(OUT_OF_SCOPE);
  }

  // Điểm đã lưu kèm thông tin đợt; published = lớp của điểm đã được công bố trong đợt đó.
  private async facts(filter: {
    semesterIds: bigint[];
    classIds?: bigint[];
    studentIds?: bigint[];
    subjectIds?: bigint[];
    publishedOnly: boolean;
  }): Promise<ScoreFact[]> {
    const scores = await this.prisma.score.findMany({
      where: {
        classId: filter.classIds ? { in: filter.classIds } : undefined,
        studentId: filter.studentIds ? { in: filter.studentIds } : undefined,
        assessment: { semesterId: { in: filter.semesterIds }, subjectId: filter.subjectIds ? { in: filter.subjectIds } : undefined },
      },
      include: { assessment: { select: { code: true, type: true, testDate: true, subjectId: true, semesterId: true } } },
    });
    if (scores.length === 0) return [];
    const published = new Set(
      (
        await this.prisma.assessmentClass.findMany({
          where: { status: 'PUBLISHED', assessmentId: { in: [...new Set(scores.map((s) => s.assessmentId))] } },
          select: { assessmentId: true, classId: true },
        })
      ).map((ac) => pairKey(ac.assessmentId, ac.classId)),
    );
    return scores
      .map((s) => ({
        assessmentId: s.assessmentId,
        code: s.assessment.code,
        type: s.assessment.type,
        testDate: s.assessment.testDate,
        subjectId: s.assessment.subjectId,
        semesterId: s.assessment.semesterId,
        studentId: s.studentId,
        classId: s.classId,
        value: num(s.value),
        status: s.status,
        note: s.note,
        published: published.has(pairKey(s.assessmentId, s.classId)),
      }))
      .filter((f) => !filter.publishedOnly || f.published);
  }

  // Số tiết/tuần của lớp–môn: ghi đè theo lớp, không có thì định mức theo khối, không có nữa thì số tiết phân công.
  private async periodsMap(classIds: bigint[]): Promise<Map<string, number>> {
    if (classIds.length === 0) return new Map();
    const classes = await this.prisma.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, gradeId: true, schoolYearId: true } });
    const [overrides, quotas, assignments] = await Promise.all([
      this.prisma.classPeriodQuota.findMany({ where: { classId: { in: classIds } } }),
      this.prisma.subjectPeriodQuota.findMany({
        where: { schoolYearId: { in: [...new Set(classes.map((c) => c.schoolYearId))] }, gradeId: { in: [...new Set(classes.map((c) => c.gradeId))] } },
      }),
      this.prisma.teachingAssignment.findMany({ where: { classId: { in: classIds } }, select: { classId: true, subjectId: true, periodsPerWeek: true } }),
    ]);
    const result = new Map<string, number>();
    for (const a of assignments) result.set(pairKey(a.classId, a.subjectId), Math.max(result.get(pairKey(a.classId, a.subjectId)) ?? 0, a.periodsPerWeek));
    for (const c of classes) {
      for (const q of quotas) {
        if (q.gradeId === c.gradeId && q.schoolYearId === c.schoolYearId) result.set(pairKey(c.id, q.subjectId), q.periodsPerWeek);
      }
    }
    for (const o of overrides) result.set(pairKey(o.classId, o.subjectId), o.periodsPerWeek);
    return result;
  }

  private async scoreSubjects(...idLists: bigint[][]) {
    const ids = [...new Set(idLists.flat().map(String))].map((s) => BigInt(s));
    return (await this.prisma.subject.findMany({ where: { id: { in: ids }, gradingType: 'SCORE' } })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  private async currentSemester() {
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, include: { semesters: { orderBy: { number: 'asc' } } } });
    if (!year) return null;
    const today = vnToday();
    const s =
      year.semesters.find((x) => day(x.startDate) <= today && today <= day(x.endDate)) ??
      year.semesters.filter((x) => day(x.startDate) <= today).at(-1) ??
      year.semesters[0];
    return s ? { ...s, schoolYear: year } : null;
  }

  private assertAnyScoreRole(actor: AuthUser): void {
    if (!can(actor, 'score:enter') && !can(actor, 'score:read:all')) assertPermission(actor, 'score:read:all');
  }

  private async limitReads(actor: AuthUser): Promise<void> {
    const { count, retryAfterSec } = await this.limits.increment('score-read', actor.id, 60);
    if (count > SCORE_READS_PER_MIN) {
      throw new HttpException(`Bạn xem bảng điểm quá nhiều lần, vui lòng thử lại sau ${retryAfterSec} giây`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async limitExports(actor: AuthUser): Promise<void> {
    const { count, retryAfterSec } = await this.limits.increment('score-export', actor.id, 60);
    if (count > SCORE_EXPORTS_PER_MIN) {
      throw new HttpException(`Bạn xuất file quá nhiều lần, vui lòng thử lại sau ${retryAfterSec} giây`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordExport(actor: AuthUser, kind: string, ip: string | undefined, params: Record<string, unknown>) {
    return this.audit.record({ userId: actor.id, channel: 'web', action: 'score.export', targetType: 'score', params: { kind, ...params }, ok: true, ip });
  }
}
